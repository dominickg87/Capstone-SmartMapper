import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import {
  AutomationActionV2Schema,
  PageObservationSchema,
  SourceAnswersSchema,
  type SmartMapperObservation,
  type SmartMapperPlan,
  type MappingChatContext,
} from '@smartmapper/contracts';
import { ActiveTabJobService } from '../../apps/orchestrator-api/src/active-tab-service.js';
import { MemoryCheckpointStore } from '../../apps/orchestrator-api/src/checkpoints.js';
import { createApi } from '../../apps/orchestrator-api/src/http.js';

const raw = JSON.parse(
  readFileSync(resolve('fixtures/mia-quotes/active-tab.synthetic.json'), 'utf8'),
) as Record<string, unknown>;
const source = SourceAnswersSchema.parse(raw.source);
const action = AutomationActionV2Schema.parse(raw.action);
const backend = 'https://asp-smartmapper-dev-fgbqddfbewfrd2at.eastus-01.azurewebsites.net';
// Intercept the configured tenant locally, including builds made for the demo account.
const extensionManifest = JSON.parse(
  readFileSync(resolve('apps/extension-prototype/dist/manifest.json'), 'utf8'),
) as { content_scripts: { matches: string[] }[] };
const miaOrigin = new URL(extensionManifest.content_scripts[0]!.matches[0]!).origin;
const html = `<!doctype html><html><head><title>Synthetic carrier</title></head><body>
<h1>Applicant</h1><form onsubmit="event.preventDefault();document.body.dataset.submitted='true'">
<fieldset><legend>Applicant 1</legend><label for="first">First Name</label><input id="first" required>
<label for="choice">Residence</label><select id="choice"><option value="">Choose</option><option value="own">Own home</option></select>
<label><input id="consent" type="checkbox">I agree to the terms</label></fieldset>
<button type="button" id="next" onclick="history.pushState({},'', '/smartmapper-lab/next');document.querySelector('h1').textContent='Next page';document.querySelector('#first').value=''">Next</button>
<button type="submit">Issue policy</button></form></body></html>`;

test('unpacked extension maps the active page, reads it back, and waits for human navigation and Resume', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const extensionPath = resolve('apps/extension-prototype/dist');
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    headless: true,
    channel: 'chromium',
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath,
    ],
  });
  let server: ReturnType<typeof createApi> | undefined;
  let observations = 0;
  let unavailable = false;
  let expired = false;
  let sawGuidance = false;
  let holdPlanning = false;
  let releasePlanning: (() => void) | undefined;
  const note = 'Recheck the applicant field and explain which saved answer belongs here.';
  const reply = 'I will recheck the applicant field against the supplied answer on Resume.';
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const provider = {
      providerId: 'scripted-synthetic',
      proposeMappings: async (request: SmartMapperObservation): Promise<SmartMapperPlan> => {
        observations += 1;
        if (holdPlanning)
          await new Promise<void>((done) => {
            releasePlanning = done;
          });
        if (request.conversation?.some((message) => message.text === note)) sawGuidance = true;
        expect(request.page.screenshot).toMatch(/^data:image\/jpeg;base64,/);
        const field = request.page.controls.find((control) => control.label === 'First Name');
        return Promise.resolve({
          version: '2.0',
          pageStateId: request.page.pageStateId,
          outcome: field?.value === 'Alex' ? 'page_complete' : 'act',
          actions:
            field?.value === 'Alex'
              ? []
              : [
                  {
                    ...action,
                    actionId: randomUUID(),
                    pageStateId: request.page.pageStateId,
                    elementId: field?.elementId ?? null,
                  },
                ],
          reviews: [],
        });
      },
      discussMapping: (request: MappingChatContext) => {
        expect(request.conversation.at(-1)?.text).toBe(note);
        expect(request.page.screenshot).toMatch(/^data:image\/jpeg;base64,/);
        expect(request.source.answers[0]?.question).toBe('First Name');
        return Promise.resolve({ version: '2.0' as const, reply });
      },
    };
    const service = new ActiveTabJobService(
      new MemoryCheckpointStore(),
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0',
            binding: {
              tenantId: 'demo',
              userId: '7',
              quoteId: 'quote-synthetic',
              carrierOrigin: request.carrierOrigin,
              tabId: request.tabId,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
            sourceToken: 's'.repeat(43),
            source,
          }),
        read: () => Promise.resolve(source),
        revoke: () => Promise.resolve(),
      },
      provider,
      { verify: () => Promise.resolve(true) },
      {
        miaOrigins: new Set([miaOrigin]),
        carrierOrigins: new Set(['http://127.0.0.1:4173']),
        principals: new Set(['demo/7']),
      },
    );
    server = createApi(service, new Set(['chrome-extension://' + extensionId]));
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('address_missing');
    const apiOrigin = 'http://127.0.0.1:' + address.port;
    await context.route(backend + '/**', async (route) => {
      if (unavailable || expired) {
        await route.fulfill({ status: expired ? 410 : 503, json: { error: 'synthetic_failure' } });
        return;
      }
      const request = route.request();
      const response = await fetch(apiOrigin + new URL(request.url()).pathname, {
        method: request.method(),
        headers: request.headers(),
        ...(request.postData() ? { body: request.postData() } : {}),
      });
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    await context.route(miaOrigin + '/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/extension/quotes/search')
        await route.fulfill({
          json: {
            results: [
              {
                id: 'quote-synthetic',
                client_name: 'Alex Example',
                quote_number: 'DEMO-1',
                form_type: 'auto',
              },
            ],
          },
        });
      else if (path.endsWith('/grants'))
        await route.fulfill({ status: 201, json: { code: 'c'.repeat(43) } });
      else await route.abort();
    });
    const carrier = await context.newPage();
    await carrier.route('**/smartmapper-lab', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await carrier.goto('http://127.0.0.1:4173/smartmapper-lab');
    await worker.evaluate(async () => {
      await chrome.storage.session.set({ miaToken: 'mia_ext_synthetic', principal: 'demo/7' });
    });
    const browserCdp = await context.browser()!.newBrowserCDPSession();
    const targets = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
    const target = targets.targetInfos.find((item) => item.url === carrier.url());
    if (!target) throw new Error('carrier_tab_target_missing');
    await browserCdp.send('Extensions.triggerAction', {
      id: extensionId,
      targetId: target.targetId,
    });
    const panel = await context.newPage();
    await panel.goto('chrome-extension://' + extensionId + '/sidepanel.html');
    await expect(panel.getByText('Connected to M.I.A.', { exact: true })).toBeVisible();
    await panel.getByText('Connection details', { exact: true }).click();
    await expect(panel.locator('#extension-id')).toHaveValue(extensionId);
    await expect(panel.locator('#mia-account')).toHaveValue('demo/7');
    await panel.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(panel.locator('#quote')).toHaveValue('quote-synthetic');
    await carrier.bringToFront();
    await panel
      .getByRole('button', { name: 'Start mapping', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect(carrier.locator('#first')).toHaveValue('Alex');
    await expect(
      panel.getByText("I'm out of things to do on this page.", { exact: false }),
    ).toBeVisible();
    expect(observations).toBe(2);
    await expect(carrier.locator('#consent')).not.toBeChecked();
    await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
    await panel.locator('#mapping-message').evaluate((element: HTMLTextAreaElement, text) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        element,
        text,
      );
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, note);
    await expect(panel.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
    await panel
      .getByRole('button', { name: 'Send message', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect(panel.getByRole('log')).toContainText(reply);
    expect(observations).toBe(2);
    await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
    await panel.reload();
    await expect(panel.getByRole('log')).toContainText(note);
    await expect(panel.getByRole('log')).toContainText(reply);
    await carrier.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(carrier.locator('#first')).toHaveValue('');
    expect(observations).toBe(2);
    await panel
      .getByRole('button', { name: 'Resume mapping', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect(carrier.locator('#first')).toHaveValue('Alex');
    await expect(panel.getByText('2 entries verified', { exact: false })).toBeVisible();
    expect(sawGuidance).toBe(true);
    await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
    const stored = await worker.evaluate(async () => await chrome.storage.session.get(null));
    expect(JSON.stringify(stored)).not.toContain('data:image');
    expect(JSON.stringify(stored)).not.toContain('Alex');
    await panel
      .getByRole('button', { name: 'Clear chat guidance', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect(panel.getByRole('log')).not.toContainText(note);
    // A message sent during inference must invalidate the pending browser action.
    await carrier.locator('#first').evaluate((element: HTMLInputElement) => {
      element.value = '';
    });
    holdPlanning = true;
    await panel
      .getByRole('button', { name: 'Resume mapping', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect.poll(() => Boolean(releasePlanning)).toBe(true);
    await panel.locator('#mapping-message').evaluate((element: HTMLTextAreaElement, text) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        element,
        text,
      );
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, note);
    await panel
      .getByRole('button', { name: 'Send message', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect(panel.getByRole('log')).toContainText(reply);
    releasePlanning!();
    await expect(panel.getByRole('button', { name: 'Resume mapping', exact: true })).toBeEnabled();
    await expect(carrier.locator('#first')).toHaveValue('');
    await expect(panel.getByRole('heading', { name: 'paused', exact: true })).toBeVisible();
    await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
    unavailable = true;
    await panel.reload();
    await expect(panel.getByRole('alert')).toContainText('Check the service connection');
    await expect(panel.getByRole('button', { name: 'Cancel job', exact: true })).toBeVisible();
    expect(
      await worker.evaluate(async () => Boolean((await chrome.storage.session.get('job')).job)),
    ).toBe(true);
    unavailable = false;
    expired = true;
    await panel.reload();
    await expect(panel.getByText('This mapping session ended.', { exact: false })).toBeVisible();
    expect(
      await worker.evaluate(async () => Boolean((await chrome.storage.session.get('job')).job)),
    ).toBe(false);
    await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
  } finally {
    releasePlanning?.();
    await context.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((done) => server!.close(() => done()));
    }
  }
});

test('executor refuses issuance clicks, stale DOM and unverified custom options', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const extensionPath = resolve('apps/extension-prototype/dist');
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    headless: true,
    channel: 'chromium',
    args: ['--disable-extensions-except=' + extensionPath, '--load-extension=' + extensionPath],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const carrier = await context.newPage();
    await carrier.route('**/smartmapper-lab', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await carrier.goto('http://127.0.0.1:4173/smartmapper-lab');
    const panel = await context.newPage();
    await panel.goto('chrome-extension://' + extensionId + '/sidepanel.html');
    await carrier.bringToFront();
    const tabId = await panel.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error('tab_missing');
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return tab.id;
    });
    const observe = async () =>
      PageObservationSchema.parse(
        await panel.evaluate(
          async (id): Promise<unknown> =>
            await chrome.tabs.sendMessage(id, { type: 'observe', tabId: id }),
          tabId,
        ),
      );
    const initial = await observe();
    const submit = initial.controls.find((control) => control.label === 'Issue policy')!;
    const forbidden = {
      ...action,
      actionId: 'forbidden',
      type: 'click' as const,
      pageStateId: initial.pageStateId,
      elementId: submit.elementId,
      value: null,
      purpose: 'expand_section' as const,
    };
    const result: unknown = await panel.evaluate(
      async ({ id, batch }): Promise<unknown> =>
        await chrome.tabs.sendMessage(id, { type: 'execute', batch }),
      { id: tabId, batch: { batchId: randomUUID(), action: forbidden, sources: source.answers } },
    );
    expect(result).toMatchObject({ status: 'blocked', reason: 'policy_blocked' });
    const fresh = await observe();
    await carrier.locator('#first').fill('Human edit');
    const stale: unknown = await panel.evaluate(
      async ({ id, batch }): Promise<unknown> =>
        await chrome.tabs.sendMessage(id, { type: 'execute', batch }),
      {
        id: tabId,
        batch: {
          batchId: randomUUID(),
          action: {
            ...action,
            pageStateId: fresh.pageStateId,
            elementId: fresh.controls[0]!.elementId,
          },
          sources: source.answers,
        },
      },
    );
    expect(stale).toMatchObject({ status: 'blocked', reason: 'page_changed' });
    await expect(carrier.locator('#first')).toHaveValue('Human edit');
    const residenceSource = {
      ...source.answers[0]!,
      answerId: 'residence',
      question: 'Primary Residence',
      sourcePath: 'applicant1.primaryResidence',
      value: 'Own Home/Condo',
    };
    const selectedPage = await observe();
    const select = selectedPage.controls.find((control) => control.tag === 'select')!;
    const selection = {
      ...action,
      actionId: 'residence-selection',
      type: 'select' as const,
      value: 'own',
      sourceAnswerIds: ['residence'],
      elementId: select.elementId,
      pageStateId: selectedPage.pageStateId,
      transformation: {
        kind: 'equivalent_option' as const,
        explanation: 'Equivalent ownership option.',
      },
    };
    const selected: unknown = await panel.evaluate(
      async ({ id, batch }): Promise<unknown> =>
        await chrome.tabs.sendMessage(id, { type: 'execute', batch }),
      {
        id: tabId,
        batch: { batchId: randomUUID(), action: selection, sources: [residenceSource] },
      },
    );
    expect(selected).toMatchObject({ status: 'verified' });
    await expect(carrier.locator('#choice')).toHaveValue('own');
    await carrier.evaluate(() => {
      const option = document.createElement('div');
      option.setAttribute('role', 'option');
      option.setAttribute('data-value', 'own');
      option.textContent = 'Own home';
      document.body.append(option);
    });
    const optionPage = await observe();
    const option = optionPage.controls.find((control) => control.role === 'option')!;
    const unverified: unknown = await panel.evaluate(
      async ({ id, batch }): Promise<unknown> =>
        await chrome.tabs.sendMessage(id, { type: 'execute', batch }),
      {
        id: tabId,
        batch: {
          batchId: randomUUID(),
          action: {
            ...selection,
            type: 'click' as const,
            purpose: 'select_option' as const,
            pageStateId: optionPage.pageStateId,
            elementId: option.elementId,
          },
          sources: [residenceSource],
        },
      },
    );
    expect(unverified).toMatchObject({ status: 'failed', reason: 'read_back_mismatch' });
    await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
  } finally {
    await context.close();
  }
});
