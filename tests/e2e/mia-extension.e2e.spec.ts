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

async function startDemo(testInfo: TestInfo) {
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
  };

  try {
    await context.route(/^https?:\/\//, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.url() === formUrl) {
        await route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><title>Synthetic test form</title><h1>Applicant details</h1>
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
          await route.fulfill({ json: { quote } });
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
    await activateForm(panel);
    await clickWithoutActivatingPanel(panel.locator('#smartMapReadPageBtn'));
    await expect(panel.locator('#smartMapFieldCount')).toHaveText('2 fields detected');
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
