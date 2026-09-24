import { cp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';

const portalOrigin = 'https://mia.test';
const formUrl = 'https://127.0.0.1:4173/mia-extension-synthetic-form';
const quote = {
  id: 'synthetic-quote',
  client_name: 'Synthetic Applicant',
  quote_number: 'DEMO-001',
};

interface MappingRequest {
  quote_id: string;
  page: { fields: { id: string; label: string; type: string }[] };
}

async function clickWithoutActivatingPanel(locator: Locator) {
  // The side panel is hosted in a tab for headless testing. A DOM click keeps the
  // synthetic form active, matching Chrome's actual side-panel/tab relationship.
  await expect(locator).toBeEnabled();
  await locator.evaluate((element) => (element as HTMLButtonElement).click());
}

async function activateForm(panel: Page) {
  await panel.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    if (tab?.id === undefined) throw new Error('Synthetic form tab is missing.');
    await chrome.tabs.update(tab.id, { active: true });
  }, formUrl);
}

type WorkerFault = 'missing-capabilities' | 'outdated-worker' | 'missing-fill-handler';

for (const fault of ['missing-capabilities', 'outdated-worker'] as const) {
  test(`SmartMap explains how to reload a ${fault} worker before mapping`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe('chromium');
    const { context, form, panel, state } = await startDemo(testInfo, 'deterministic', fault);
    try {
      await expect(panel.locator('#smartMapPageSummary')).toContainText(
        'Reload MIA SmartMapper at chrome://extensions',
      );
      await expect(form.locator('#name')).toHaveValue('');
      expect(state.mappingRequests).toHaveLength(0);
      expect(state.quoteReads).toBe(1);
      expect(state.unexpectedRequests).toEqual([]);
      await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
    } finally {
      await context.close();
    }
  });
}

test('SmartMap reports a missing fill response without retrying or changing mappers', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(
    testInfo,
    'deterministic',
    'missing-fill-handler',
  );
  try {
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(panel.locator('#smartMapMappingStateText')).toContainText(
      'SmartMap did not receive the mapping result. Review any entered fields',
    );
    await expect(panel.locator('#smartMapMappingStateText')).toContainText('chrome://extensions');
    await expect(form.locator('#name')).toHaveValue('');
    expect(state.mappingRequests).toHaveLength(0);
    expect(state.quoteReads).toBe(2);
    expect(state.unexpectedRequests).toEqual([]);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});

async function startDemo(
  testInfo: TestInfo,
  method: 'server' | 'deterministic' = 'server',
  workerFault?: WorkerFault,
) {
  const extensionPath = testInfo.outputPath('extension');
  await cp(resolve('apps/mia-chrome-extension/dist'), extensionPath, { recursive: true });
  const manifestPath = join(extensionPath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    host_permissions: string[];
  };
  // Grant only the synthetic local form in this disposable test copy. The
  // distributed manifest is unchanged; real HTTPS targets require user consent.
  manifest.host_permissions.push('https://127.0.0.1/*');
  await writeFile(manifestPath, JSON.stringify(manifest));
  if (workerFault) {
    // Simulate old/mismatched runtime code only in this disposable test extension.
    const workerPath = join(extensionPath, 'src/background.js');
    const source = await readFile(workerPath, 'utf8');
    const marker =
      workerFault === 'missing-fill-handler'
        ? 'case "MIA_SMART_MAP_DETERMINISTIC_FILL": {'
        : 'case "MIA_SMART_MAP_CAPABILITIES": {';
    expect(source).toContain(marker);
    const replacement =
      workerFault === 'outdated-worker'
        ? `${marker}\nsendResponse({ ok: true, protocolVersion: 0, buildVersion: 'old' }); return false;`
        : 'case "TEST_DISABLED_HANDLER": {';
    await writeFile(workerPath, source.replace(marker, replacement));
  }
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--host-resolver-rules=MAP * ~NOTFOUND',
    ],
  });
  const state = {
    expireRequests: false,
    failMapping: false,
    mappingRequests: [] as MappingRequest[],
    feedbackCalls: 0,
    trainingCalls: 0,
    unexpectedRequests: [] as string[],
    quoteReads: 0,
    noQuoteData: false,
  };

  try {
    await context.route(/^https?:\/\//, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.url() === formUrl) {
        await route.fulfill({
          contentType: 'text/html',
          body:
            method === 'deterministic'
              ? `<!doctype html><title>Synthetic test form</title><h1>Applicant details</h1>
            <label for="name">Given name</label><input id="name">
            <label for="dob">Date of birth</label><input id="dob" type="date">
            <label for="state">State</label><select id="state"><option value="">Choose</option><option value="IL">Illinois</option></select>
            <label for="built">Year built</label><input id="built" type="number">
            <label for="phone">Phone</label><input id="phone">
            <label for="consent">Consent</label><input id="consent" type="checkbox">
            <button id="mock-final-submit" data-clicked="false" onclick="this.dataset.clicked='true'">Submit quote</button>`
              : `<!doctype html><title>Synthetic test form</title><h1>Applicant details</h1>
            <label for="name">Full name</label><input id="name">
            <label for="phone">Phone</label><input id="phone">
            <button id="mock-final-submit" data-clicked="false"
              onclick="this.dataset.clicked='true'">Submit quote</button>`,
        });
        return;
      }
      if (url.origin !== portalOrigin) {
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
      expect(request.headers().authorization).toBe('Bearer synthetic-demo-token-not-a-credential');
      if (state.expireRequests) {
        await route.fulfill({ status: 401, json: { message: 'Synthetic expired sign-in' } });
        return;
      }
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
          state.quoteReads += 1;
          await route.fulfill({
            json: {
              quote: state.noQuoteData
                ? quote
                : {
                    ...quote,
                    form_type: 'home',
                    form_data: {
                      applicant1: { firstName: 'Avery', dob: '1991-02-03', physicalState: 'IL' },
                      yearBuilt: 1984,
                    },
                  },
            },
          });
          return;
        case '/api/extension/smart-map/map': {
          if (state.failMapping) {
            await route.fulfill({ status: 503, json: { message: 'Synthetic mapper unavailable' } });
            return;
          }
          const body = JSON.parse(request.postData() ?? '{}') as MappingRequest;
          state.mappingRequests.push(body);
          expect(body.quote_id).toBe(quote.id);
          expect(body.page.fields.map((field) => field.type)).not.toContain('submit');
          const name = body.page.fields.find((field) => field.label === 'Full name');
          const phone = body.page.fields.find((field) => field.label === 'Phone');
          expect(name).toBeDefined();
          expect(phone).toBeDefined();
          await route.fulfill({
            json: {
              mapping: {
                source: 'ai',
                assignments: [
                  { field_id: name?.id, value: quote.client_name, confidence: 0.99 },
                  { field_id: phone?.id, value: '202-555-0142', confidence: 0.2 },
                  { field_id: 'mock-final-submit', value: 'true', confidence: 1 },
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
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const form = await context.newPage();
    await form.goto(formUrl);
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await panel.evaluate(async (baseUrl) => {
      await chrome.storage.sync.set({ miaBaseUrl: baseUrl });
    }, portalOrigin);
    await panel.reload();
    await expect(panel.locator('#smartMapBtn')).toBeEnabled();
    await panel.locator('#smartMapBtn').click();
    await expect(panel.locator('#smartMapScreen')).toBeVisible();
    await expect(panel.locator('#smartMapQuoteSearch')).toBeDisabled();
    const connectionPagePromise = context.waitForEvent('page');
    await panel.locator('#smartMapSignInBtn').click();
    const connectionPage = await connectionPagePromise;
    // Chrome-created tabs can start their first navigation before Playwright
    // attaches routing. DNS is disabled above; explicitly navigate the attached
    // tab so this response always comes from the synthetic route handler.
    await connectionPage.goto(`${portalOrigin}/extension/connect`);
    await expect(panel.locator('#smartMapConnectionStatus')).toHaveText('Signed in');
    await panel.locator('#smartMapQuoteSearch').fill('Synthetic');
    await panel.locator('#smartMapQuoteResults button').click();
    await expect(panel.locator('#smartMapSelectedQuote')).toContainText(quote.client_name);
    if (method === 'server') {
      await panel.locator('#settingsBtn').click();
      await panel.getByText('Advanced mapping', { exact: true }).click();
      await panel.locator('#smartMapMethod').selectOption(method);
      await panel.locator('#closeSettingsBtn').click();
    } else {
      // The ordinary SmartMap flow defaults to the new matcher without a selector.
      await expect(panel.locator('#smartMapMethod')).toHaveValue('deterministic');
      await expect(panel.locator('#smartMapMethod')).not.toBeVisible();
    }
    await activateForm(panel);
    await clickWithoutActivatingPanel(panel.locator('#smartMapReadPageBtn'));
    if (workerFault === 'missing-capabilities' || workerFault === 'outdated-worker') {
      await expect(panel.locator('#smartMapPageSummary')).toContainText('chrome://extensions');
      await expect(panel.locator('#smartMapRunBtn')).toBeDisabled();
    } else {
      await expect(panel.locator('#smartMapFieldCount')).toHaveText(
        method === 'deterministic' ? '6 fields detected' : '2 fields detected',
      );
    }
    return { context, form, panel, state };
  } catch (error) {
    await context.close();
    throw error;
  }
}

test('imported SmartMap connects, selects, fills, and saves mappings without submitting', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(testInfo);
  try {
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(form.getByLabel('Full name', { exact: true })).toHaveValue(quote.client_name);
    await expect(form.getByLabel('Phone', { exact: true })).toHaveValue('');
    await expect(panel.locator('#smartMapFillSummary')).toContainText(
      'Filled 1 field. Skipped 1. Low confidence 1.',
    );
    await expect(panel.locator('#smartMapMappingStateText')).toContainText(
      'Review before continuing',
    );
    await clickWithoutActivatingPanel(panel.locator('#smartMapSaveTrainingBtn'));
    await expect(panel.locator('#smartMapMappingStateText')).toContainText(
      'Training saved with 1 reusable mapping',
    );
    expect(state.mappingRequests).toHaveLength(1);
    await expect.poll(() => state.feedbackCalls).toBe(1);
    expect(state.trainingCalls).toBe(1);
    expect(state.unexpectedRequests).toEqual([]);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});

test('imported SmartMap reports mapping failure and clears expired sign-in without filling', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(testInfo);
  try {
    state.failMapping = true;
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(panel.locator('#smartMapMappingStateText')).toHaveText(
      'Synthetic mapper unavailable',
    );
    await expect(form.getByLabel('Full name', { exact: true })).toHaveValue('');
    state.expireRequests = true;
    await panel.locator('#smartMapQuoteSearch').fill('Another synthetic quote');
    await expect(panel.locator('#smartMapConnectionStatus')).toHaveText('Signed out');
    await expect(panel.locator('#smartMapQuoteSearch')).toBeDisabled();
    await expect(panel.locator('#smartMapRunBtn')).toBeDisabled();
    const storage = await panel.evaluate(() => chrome.storage.local.get('miaSmartMapAuth'));
    expect(storage).not.toHaveProperty('miaSmartMapAuth');
    expect(state.unexpectedRequests).toEqual([]);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});

test('deterministic mode uses the selected MIA quote, verifies entries, and never calls the server mapper or submits', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(testInfo, 'deterministic');
  try {
    await expect(panel.locator('#extensionVersion')).toContainText('semantic.2');
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(form.getByLabel('Given name', { exact: true })).toHaveValue('Avery');
    await expect(form.getByLabel('Date of birth', { exact: true })).toHaveValue('1991-02-03');
    await expect(form.getByLabel('State', { exact: true })).toHaveValue('IL');
    await expect(form.getByLabel('Year built', { exact: true })).toHaveValue('1984');
    await expect(panel.locator('#smartMapMappingStateText')).toContainText(
      'Deterministic matcher filled 4 fields',
    );
    await expect(panel.locator('#smartMapReviewItems')).toContainText(
      'applicant.phone: missing source',
    );
    await expect(form.getByLabel('Consent', { exact: true })).not.toBeChecked();
    await expect(form.getByLabel('Phone', { exact: true })).toHaveValue('');
    expect(state.quoteReads).toBeGreaterThanOrEqual(2);
    expect(state.mappingRequests).toHaveLength(0);
    expect(state.feedbackCalls).toBe(0);
    expect(state.trainingCalls).toBe(0);
    expect(state.unexpectedRequests).toEqual([]);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});

test('deterministic mode refuses missing quote details without falling back to the server mapper', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(testInfo, 'deterministic');
  try {
    state.noQuoteData = true;
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(panel.locator('#smartMapMappingStateText')).toContainText(
      'No supported matches with available quote data',
    );
    await expect(form.getByLabel('Given name', { exact: true })).toHaveValue('');
    expect(state.mappingRequests).toHaveLength(0);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});

test('deterministic mode stops when the read page changes', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(testInfo, 'deterministic');
  try {
    await form.locator('label[for="name"]').evaluate((element) => {
      element.textContent = 'Co-applicant given name';
    });
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(panel.locator('#smartMapReviewItems')).toContainText('page changed');
    await expect(form.locator('#name')).toHaveValue('');
    expect(state.mappingRequests).toHaveLength(0);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});

test('deterministic mode pauses on read-back mismatch before filling further fields', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(testInfo, 'deterministic');
  try {
    await form.locator('#name').evaluate((element) => {
      element.addEventListener('input', () => {
        (element as HTMLInputElement).value = '';
      });
    });
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(panel.locator('#smartMapReviewItems')).toContainText('read back mismatch');
    await expect(form.locator('#dob')).toHaveValue('');
    expect(state.mappingRequests).toHaveLength(0);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});

test('deterministic mode preserves existing values and rejects unmatched select choices', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(testInfo, 'deterministic');
  try {
    await form.locator('#name').fill('Existing synthetic value');
    await form.locator('#state option[value="IL"]').evaluate((element) => {
      element.setAttribute('value', 'WI');
      element.textContent = 'Wisconsin';
    });
    await activateForm(panel);
    await clickWithoutActivatingPanel(panel.locator('#smartMapReadPageBtn'));
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(panel.locator('#smartMapReviewItems')).toContainText('existing value');
    await expect(panel.locator('#smartMapReviewItems')).toContainText('unsupported option');
    await expect(form.locator('#name')).toHaveValue('Existing synthetic value');
    await expect(form.locator('#state')).toHaveValue('');
    expect(state.mappingRequests).toHaveLength(0);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});

test('deterministic mode refuses to fill after switching active tabs', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const { context, form, panel, state } = await startDemo(testInfo, 'deterministic');
  try {
    const other = await context.newPage();
    await other.goto(formUrl);
    await clickWithoutActivatingPanel(panel.locator('#smartMapRunBtn'));
    await expect(panel.locator('#smartMapReviewItems')).toContainText('page changed');
    await expect(form.locator('#name')).toHaveValue('');
    await expect(other.locator('#name')).toHaveValue('');
    expect(state.mappingRequests).toHaveLength(0);
    await expect(form.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
    await expect(other.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});
