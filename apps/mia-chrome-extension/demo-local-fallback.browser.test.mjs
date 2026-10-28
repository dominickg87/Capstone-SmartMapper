import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const appDirectory = import.meta.dirname;
const portalOrigin = 'https://demo.mia.agency';
const formUrl = 'https://127.0.0.1:4173/demo-local-fallback-synthetic-form';
const quote = {
  id: 'synthetic-local-demo-quote',
  client_name: 'Synthetic Example',
  quote_number: 'SYNTHETIC-DEMO-001',
  first_name: 'Synthetic',
  last_name: 'Example',
  email: 'synthetic@example.invalid',
  address: {
    street: '123 Synthetic Lane',
    city: 'Testville',
    state: 'IL',
    zip: '60000',
    county: 'Synthetic County',
  },
  property: { year_built: 1999, square_feet: 1800 },
  agent: { first_name: 'Unrelated Agent', email: 'agent@example.invalid' },
};
const expectedFilled = {
  given: quote.first_name,
  family: quote.last_name,
  email: quote.email,
  street: quote.address.street,
  city: quote.address.city,
  state: quote.address.state,
  zip: quote.address.zip,
  county: quote.address.county,
  yearBuilt: String(quote.property.year_built),
  squareFeet: String(quote.property.square_feet),
};
const syntheticForm = `<!doctype html><title>Synthetic fallback form</title>
  <h1>Applicant and property details</h1>
  <form onsubmit="event.preventDefault(); this.dataset.submitted='true'" data-submitted="false">
    <div><label for="given">First name</label><input id="given"></div>
    <div><input id="family" name="last_name" aria-label="Applicant family"></div>
    <div><input id="email" type="email"></div>
    <div><input id="street" placeholder="Street address"></div>
    <div>City<input id="city"></div>
    <div><label for="state">State</label><select id="state">
      <option value="">Select</option><option value="IL">Illinois</option>
      <option value="IA">Iowa</option></select></div>
    <div><label for="zip">ZIP code</label><input id="zip"></div>
    <div><label for="county">County</label><input id="county"></div>
    <div><label for="yearBuilt">Year built</label><input id="yearBuilt" type="number"></div>
    <div><label for="squareFeet">Square feet</label><input id="squareFeet" type="number"></div>
    <div><label for="phone">Phone</label><input id="phone" type="tel"></div>
    <div><label for="coverage">Coverage amount</label><input id="coverage" type="number"></div>
    <div><label for="ssn">SSN</label><input id="ssn"></div>
    <div><label for="payment">Payment card number</label><input id="payment"></div>
    <div><label for="signature">Applicant signature</label><input id="signature"></div>
    <div><label for="consent">I consent</label><input id="consent" type="checkbox"></div>
    <div><label for="attestation">I attest the first name is correct</label><input id="attestation"></div>
    <button id="mock-final-submit" type="submit" data-clicked="false"
      onclick="this.dataset.clicked='true'">Submit quote</button>
  </form>
  <script>
    for (const element of document.querySelectorAll('input,select')) {
      element.dataset.inputEvents = '0';
      element.dataset.changeEvents = '0';
      element.addEventListener('input', () => {
        element.dataset.inputEvents = String(Number(element.dataset.inputEvents) + 1);
      });
      element.addEventListener('change', () => {
        element.dataset.changeEvents = String(Number(element.dataset.changeEvents) + 1);
      });
    }
  </script>`;

async function clickWithoutActivatingPanel(locator) {
  await expect(locator).toBeEnabled();
  await locator.evaluate((element) => element.click());
}

async function activateForm(panel) {
  await panel.evaluate(async (url) => {
    const [tab] = await globalThis.chrome.tabs.query({ url });
    if (tab?.id === undefined) throw new Error('Synthetic form tab is missing.');
    await globalThis.chrome.tabs.update(tab.id, { active: true });
  }, formUrl);
}

async function startDemo(mappingStatus, portal = portalOrigin) {
  const directory = await mkdtemp(join(tmpdir(), 'mia-demo-local-fallback-'));
  const extensionPath = join(directory, 'extension');
  let context;
  const state = { mappingRequests: [], feedbackCalls: 0, trainingCalls: 0, unexpectedRequests: [] };
  try {
    await cp(join(appDirectory, 'dist'), extensionPath, { recursive: true });
    const manifestPath = join(extensionPath, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    // Only the disposable test extension receives access to the synthetic form.
    manifest.host_permissions.push('https://127.0.0.1/*');
    await writeFile(manifestPath, JSON.stringify(manifest));
    context = await chromium.launchPersistentContext(join(directory, 'profile'), {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--host-resolver-rules=MAP * ~NOTFOUND',
      ],
    });
    await context.route(/^https?:\/\//, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.url() === formUrl) {
        await route.fulfill({ contentType: 'text/html', body: syntheticForm });
        return;
      }
      if (url.origin !== portal) {
        state.unexpectedRequests.push(request.url());
        await route.abort();
        return;
      }
      if (url.pathname === '/extension/connect') {
        await route.fulfill({
          contentType: 'text/html',
          body: `<main><h1>Synthetic MIA connection</h1><script type="application/json"
            id="mia-extension-connection">${JSON.stringify({
              access_token: 'synthetic-demo-token-not-a-credential',
              token_type: 'Bearer',
              user: { id: 'synthetic-user' },
              tenant: { id: 'synthetic-tenant' },
            })}</script></main>`,
        });
        return;
      }
      assert.equal(request.headers().authorization, 'Bearer synthetic-demo-token-not-a-credential');
      switch (url.pathname) {
        case '/api/extension/me':
          await route.fulfill({
            json: { user: { id: 'synthetic-user' }, tenant: { id: 'synthetic-tenant' } },
          });
          return;
        case '/api/extension/quotes/search':
          await route.fulfill({ json: { results: [quote] } });
          return;
        case `/api/extension/quotes/${quote.id}`:
          await route.fulfill({ json: { quote } });
          return;
        case '/api/extension/smart-map/map': {
          const body = JSON.parse(request.postData() || '{}');
          state.mappingRequests.push(body);
          assert.equal(request.method(), 'POST');
          assert.equal(body.quote_id, quote.id);
          assert.equal(body.page.fields.length, 17);
          assert.ok(body.page.fields.every((field) => field.type !== 'submit'));
          if (mappingStatus !== 200) {
            await route.fulfill({
              status: mappingStatus,
              json: {
                message: mappingStatus === 404 ? 'Route not found' : 'Synthetic backend failure',
              },
            });
            return;
          }
          const firstNameField = body.page.fields.find((field) => field.htmlId === 'given');
          assert.ok(firstNameField);
          // A backend-owned value distinct from local quote data proves it wins.
          await route.fulfill({
            json: {
              mapping: {
                source: 'ai',
                assignments: [
                  { field_id: firstNameField.id, value: 'Backend Synthetic', confidence: 1 },
                ],
              },
            },
          });
          return;
        }
        case '/api/extension/smart-map/feedback':
          state.feedbackCalls += 1;
          await route.fulfill({ json: { success: true } });
          return;
        case '/api/extension/smart-map/training':
          state.trainingCalls += 1;
          await route.fulfill({
            json: { template: { id: 'synthetic-template', saved_mappings: 1 } },
          });
          return;
        default:
          state.unexpectedRequests.push(request.url());
          await route.abort();
      }
    });
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const form = await context.newPage();
    await form.goto(formUrl);
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async (baseUrl) => {
      await globalThis.chrome.storage.sync.set({ miaBaseUrl: baseUrl });
    }, portal);
    await panel.reload();
    await expect(panel.locator('#smartMapBtn')).toBeEnabled();
    await panel.locator('#smartMapBtn').click();
    await expect(panel.locator('#smartMapScreen')).toBeVisible();
    await expect(panel.locator('#smartMapQuoteSearch')).toBeDisabled();
    const connectionPagePromise = context.waitForEvent('page');
    await panel.locator('#smartMapSignInBtn').click();
    const connectionPage = await connectionPagePromise;
    // DNS stays disabled. Revisit after attaching Playwright routes to the tab.
    await connectionPage.goto(`${portal}/extension/connect`);
    await expect(panel.locator('#smartMapConnectionStatus')).toHaveText('Signed in');
    await panel.locator('#smartMapQuoteSearch').fill('Synthetic');
    await panel.locator('#smartMapQuoteResults button').click();
    await expect(panel.locator('#smartMapSelectedQuote')).toContainText(quote.client_name);
    await activateForm(panel);
    await clickWithoutActivatingPanel(panel.locator('#smartMapReadPageBtn'));
    await expect(panel.locator('#smartMapFieldCount')).toHaveText('17 fields detected');
    return {
      form,
      panel,
      state,
      close: async () => {
        await context.close();
        // mkdtemp created this exact test-owned path under the OS temporary dir.
        assert.equal(resolve(directory, '..'), resolve(tmpdir()));
        assert.ok(directory.includes('mia-demo-local-fallback-'));
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await context?.close();
    assert.equal(resolve(directory, '..'), resolve(tmpdir()));
    assert.ok(directory.includes('mia-demo-local-fallback-'));
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function assertFinalControlUntouched(form) {
  await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  await expect(form.locator('form')).toHaveAttribute('data-submitted', 'false');
}

test(
  '404 demo endpoint uses selected quote locally and visibly fills only safe fields',
  { timeout: 120_000 },
  async () => {
    const { form, panel, state, close } = await startDemo(404);
    try {
      await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
      for (const [id, value] of Object.entries(expectedFilled)) {
        await expect(form.locator(`#${id}`)).toHaveValue(value);
        const events = await form.locator(`#${id}`).evaluate((element) => ({
          input: Number(element.dataset.inputEvents),
          change: Number(element.dataset.changeEvents),
        }));
        assert.ok(events.input > 0, `${id} dispatches input`);
        assert.ok(events.change > 0, `${id} dispatches change`);
      }
      for (const id of ['phone', 'coverage', 'ssn', 'payment', 'signature', 'attestation']) {
        await expect(form.locator(`#${id}`)).toHaveValue('');
        await expect(form.locator(`#${id}`)).toHaveAttribute('data-input-events', '0');
      }
      await expect(form.locator('#consent')).not.toBeChecked();
      await expect(panel.locator('#smartMapFillSummary')).toContainText(
        'Demo local mapping fallback',
      );
      await expect(panel.locator('#smartMapSaveTrainingBtn')).toBeHidden();
      assert.equal(state.mappingRequests.length, 1, 'the backend is attempted before fallback');
      assert.equal(state.feedbackCalls, 0);
      assert.equal(state.trainingCalls, 0);
      assert.deepEqual(state.unexpectedRequests, []);
      await assertFinalControlUntouched(form);
    } finally {
      await close();
    }
  },
);

test(
  'successful backend SmartMap remains primary instead of local fallback',
  { timeout: 120_000 },
  async () => {
    const { form, panel, state, close } = await startDemo(200);
    try {
      await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
      await expect(form.locator('#given')).toHaveValue('Backend Synthetic');
      await expect(form.locator('#family')).toHaveValue('');
      await expect(panel.locator('#smartMapFillSummary')).not.toContainText(
        'Demo local mapping fallback',
      );
      await expect.poll(() => state.feedbackCalls).toBe(1);
      assert.equal(state.mappingRequests.length, 1);
      assert.equal(state.trainingCalls, 0);
      assert.deepEqual(state.unexpectedRequests, []);
      await assertFinalControlUntouched(form);
    } finally {
      await close();
    }
  },
);

for (const [status, portal] of [
  [503, portalOrigin],
  [401, portalOrigin],
  [404, 'https://mia.test'],
]) {
  test(
    `${status} from ${portal} does not trigger demo fallback`,
    { timeout: 120_000 },
    async () => {
      const { form, panel, state, close } = await startDemo(status, portal);
      try {
        await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
        await expect(panel.locator('#smartMapMappingStateText')).toHaveText(
          status === 401
            ? /sign|expired|401/i
            : status === 404
              ? 'Route not found'
              : 'Synthetic backend failure',
        );
        for (const id of Object.keys(expectedFilled)) {
          await expect(form.locator(`#${id}`)).toHaveValue('');
        }
        await expect(panel.locator('#smartMapFillSummary')).not.toContainText(
          'Demo local mapping fallback',
        );
        assert.equal(state.mappingRequests.length, 1);
        assert.equal(state.feedbackCalls, 0);
        assert.equal(state.trainingCalls, 0);
        assert.deepEqual(state.unexpectedRequests, []);
        if (status === 401) {
          await expect(panel.locator('#smartMapConnectionStatus')).toHaveText('Signed out');
          await expect(panel.locator('#smartMapRunBtn')).toBeDisabled();
        }
        await assertFinalControlUntouched(form);
      } finally {
        await close();
      }
    },
  );
}

test(
  'demo fallback stops when target field structure changes after Read Page',
  { timeout: 120_000 },
  async () => {
    const { form, panel, state, close } = await startDemo(404);
    try {
      await form.locator('form').evaluate((element) => {
        const field = element.ownerDocument.createElement('input');
        field.id = 'new-unknown-field';
        field.setAttribute('aria-label', 'Unknown added field');
        element.prepend(field);
      });
      await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
      await expect(panel.locator('#smartMapMappingStateText')).toHaveText(
        'Page changed. Read Page again before using the demo fallback.',
      );
      for (const id of Object.keys(expectedFilled)) {
        await expect(form.locator(`#${id}`)).toHaveValue('');
      }
      await expect(form.locator('#new-unknown-field')).toHaveValue('');
      assert.equal(state.mappingRequests.length, 1);
      assert.equal(state.feedbackCalls, 0);
      assert.equal(state.trainingCalls, 0);
      assert.deepEqual(state.unexpectedRequests, []);
      await assertFinalControlUntouched(form);
    } finally {
      await close();
    }
  },
);

test(
  'demo fallback stops if an input event changes a later field into a signature',
  { timeout: 120_000 },
  async () => {
    const { form, panel, state, close } = await startDemo(404);
    try {
      await form.locator('#state').evaluate((element) => {
        element.addEventListener('change', () => {
          element.ownerDocument.querySelector('label[for="given"]').textContent =
            'Applicant signature';
        });
      });
      await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
      await expect(panel.locator('#smartMapMappingStateText')).toContainText(
        /changed|Read Page|Review/i,
      );
      await expect(form.locator('#state')).toHaveValue(quote.address.state);
      for (const id of Object.keys(expectedFilled).filter((id) => id !== 'state')) {
        await expect(form.locator(`#${id}`)).toHaveValue('');
      }
      await expect(form.locator('#given')).toHaveAttribute('data-input-events', '0');
      assert.equal(state.mappingRequests.length, 1);
      assert.equal(state.feedbackCalls, 0);
      assert.equal(state.trainingCalls, 0);
      assert.deepEqual(state.unexpectedRequests, []);
      await assertFinalControlUntouched(form);
    } finally {
      await close();
    }
  },
);

test(
  'demo fallback reads back entered values and does not count a rejected value as filled',
  { timeout: 120_000 },
  async () => {
    const { form, panel, state, close } = await startDemo(404);
    try {
      await form.locator('#given').evaluate((element) => {
        element.addEventListener('input', () => {
          element.value = '';
        });
      });
      await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
      await expect(panel.locator('#smartMapFillSummary')).toContainText('Filled 9 fields.');
      await expect(form.locator('#given')).toHaveValue('');
      await expect(form.locator('#given')).not.toHaveAttribute('data-input-events', '0');
      for (const [id, value] of Object.entries(expectedFilled).filter(([id]) => id !== 'given')) {
        await expect(form.locator(`#${id}`)).toHaveValue(value);
      }
      await expect(panel.locator('#smartMapFillSummary')).toContainText(
        'Demo local mapping fallback',
      );
      assert.equal(state.mappingRequests.length, 1);
      assert.equal(state.feedbackCalls, 0);
      assert.equal(state.trainingCalls, 0);
      assert.deepEqual(state.unexpectedRequests, []);
      await assertFinalControlUntouched(form);
    } finally {
      await close();
    }
  },
);
