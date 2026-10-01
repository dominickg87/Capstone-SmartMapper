import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
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
// Intercept the configured tenant locally, including builds made for the demo account.
const extensionManifest = JSON.parse(
  readFileSync(resolve('apps/extension-prototype/dist/manifest.json'), 'utf8'),
) as { host_permissions: string[]; content_scripts: { matches: string[] }[] };
const backend = new URL(extensionManifest.host_permissions[0]!).origin;
const miaOrigin = new URL(extensionManifest.content_scripts[0]!.matches[0]!).origin;
const testExtensionPath = resolve('.tools/e2e-any-carrier-extension');
const carrierOrigin = 'https://unlisted-carrier.example.test';
const extensionMetadata = JSON.parse(
  readFileSync(resolve('apps/extension-prototype/package.json'), 'utf8'),
) as { version: string };

test.beforeAll(() => {
  const vite = resolve('node_modules/vite/bin/vite.js');
  const cwd = resolve('apps/extension-prototype');
  const env = {
    ...process.env,
    VITE_SMARTMAPPER_BACKEND_ORIGIN: backend,
    VITE_SMARTMAPPER_MIA_ORIGIN: miaOrigin,
    VITE_SMARTMAPPER_CARRIER_ORIGINS: 'http://127.0.0.1:4173',
    VITE_SMARTMAPPER_ALLOW_ANY_CARRIER: 'true',
    VITE_SMARTMAPPER_SOURCE_FORMAT: 'questions',
  };
  execFileSync(process.execPath, [vite, 'build', '--outDir', testExtensionPath, '--emptyOutDir'], {
    cwd,
    env,
    stdio: 'pipe',
  });
  execFileSync(
    process.execPath,
    [vite, 'build', '--config', 'vite.content.config.ts', '--outDir', testExtensionPath],
    { cwd, env, stdio: 'pipe' },
  );
  const manifest = JSON.parse(
    readFileSync(resolve(testExtensionPath, 'manifest.json'), 'utf8'),
  ) as { host_permissions: string[]; version: string };
  expect(manifest.version).toBe(extensionMetadata.version);
  expect(manifest.host_permissions).toEqual([...new Set([backend + '/*', miaOrigin + '/*'])]);
});

async function clickToolbar(
  context: BrowserContext,
  extensionId: string,
  carrier: Page,
): Promise<void> {
  // These scenarios render the panel in an extension tab so Playwright can drive its UI.
  // Avoid a second native panel instance making un-intercepted requests to the local API.
  // pdf-mapping.e2e.spec.ts separately verifies actual native panel opening and tab ownership.
  const worker = context.serviceWorkers()[0]!;
  await worker.evaluate(() => {
    chrome.sidePanel.open = () => Promise.resolve();
  });
  const browserCdp = await context.browser()!.newBrowserCDPSession();
  const targets = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const target = targets.targetInfos.find((item) => item.url === carrier.url());
  if (!target) throw new Error('carrier_tab_target_missing');
  await browserCdp.send('Extensions.triggerAction', { id: extensionId, targetId: target.targetId });
  await browserCdp.detach();
}
const html = `<!doctype html><html><head><title>Synthetic carrier</title></head><body>
<h1>Applicant</h1><form onsubmit="event.preventDefault();document.body.dataset.submitted='true'">
<fieldset><legend>Applicant 1</legend><label for="first">First Name</label><input id="first" required>
<label for="choice">Residence</label><select id="choice"><option value="">Choose</option><option value="own">Own home</option></select>
<label><input id="consent" type="checkbox">I agree to the terms</label></fieldset>
<button type="button" id="next" onclick="history.pushState({},'', '/smartmapper-lab/next');document.querySelector('h1').textContent='Next page';document.querySelector('#first').value=''">Next</button>
<button type="submit">Issue policy</button></form></body></html>`;

const legacyHtml = html
  .replace(
    '<label for="first">First Name</label><input id="first" required>',
    `<table><tr><td></td><td>First</td><td>M.I.</td><td>Last</td></tr>
  <tr><td>Name</td><td><input id="first" required></td><td><input id="middle" size="2"></td><td><input id="last"></td></tr></table>`,
  )
  .replace(
    '</form>',
    '<fieldset><legend>Applicant 2</legend><span>First</span><input id="other-first"></fieldset></form>',
  );

for (const legacy of [false, true]) {
  test(`unpacked extension maps ${legacy ? 'legacy unlabeled' : 'labeled'} fields, reads back, and waits for human navigation and Resume`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe('chromium');
    const extensionPath = testExtensionPath;
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
    let holdReceipt = false;
    let releaseReceipt: (() => void) | undefined;
    let verifications = 0;
    const note = 'Recheck the applicant field and explain which saved answer belongs here.';
    const reply = 'I will recheck the applicant field against the supplied answer on Resume.';
    const lastAnswer = {
      ...source.answers[0]!,
      answerId: 'last-name',
      question: 'Last Name',
      sourcePath: 'applicant1.lastName',
      value: 'Example',
    };
    const activeSource = legacy ? { ...source, answers: [...source.answers, lastAnswer] } : source;
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
          const field = request.page.controls.find(
            (control) => control.section === 'Applicant 1' && control.tag === 'input',
          );
          const lastField = legacy
            ? request.page.controls.filter(
                (control) => control.section === 'Applicant 1' && control.tag === 'input',
              )[2]
            : undefined;
          const actions =
            field?.value === 'Alex'
              ? []
              : [
                  {
                    ...action,
                    actionId: randomUUID(),
                    pageStateId: request.page.pageStateId,
                    elementId: field?.elementId ?? null,
                  },
                ];
          if (lastField && lastField.value !== 'Example')
            actions.push({
              ...action,
              actionId: randomUUID(),
              pageStateId: request.page.pageStateId,
              elementId: lastField.elementId,
              sourceAnswerIds: ['last-name'],
              value: 'Example',
            });
          return Promise.resolve({
            version: '2.0',
            pageStateId: request.page.pageStateId,
            outcome: actions.length ? 'act' : 'page_complete',
            actions,
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
              source: activeSource,
            }),
          read: () => Promise.resolve(activeSource),
          revoke: () => Promise.resolve(),
        },
        provider,
        {
          verifySection: (entries, page) => {
            verifications += 1;
            expect(entries).toHaveLength(2);
            expect(page.screenshot).toMatch(/^data:image\/jpeg;base64,/);
            expect(entries.map((entry) => entry.sources[0]?.value)).toEqual(['Alex', 'Example']);
            expect(entries.every((entry) => entry.control.label === '')).toBe(true);
            return Promise.resolve(
              entries.map(() =>
                legacy && verifications === 1
                  ? { approved: false, reason: 'missing_question_context' }
                  : { approved: true },
              ),
            );
          },
          verify: (proposed, target, answers, page) => {
            verifications += 1;
            expect(page.screenshot).toMatch(/^data:image\/jpeg;base64,/);
            expect(page.controls).toContainEqual(target);
            expect(proposed.elementId).toBe(target.elementId);
            expect(answers[0]?.value).toBe('Alex');
            expect(target.label).toBe(legacy ? '' : 'First Name');
            if (legacy) {
              expect(page.controls.some((control) => control.section === 'Applicant 2')).toBe(true);
              // Script the unclear-context path, then verify Resume keeps the full evidence.
              if (verifications === 1)
                return Promise.resolve({ approved: false, reason: 'missing_question_context' });
            }
            return Promise.resolve({ approved: true });
          },
        },
        {
          miaOrigins: new Set([miaOrigin]),
          carrierOrigins: new Set(),
          allowAnyCarrier: true,
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
          await route.fulfill({
            status: expired ? 410 : 503,
            json: { error: 'synthetic_failure' },
          });
          return;
        }
        const request = route.request();
        const response = await fetch(apiOrigin + new URL(request.url()).pathname, {
          method: request.method(),
          headers: request.headers(),
          ...(request.postData() ? { body: request.postData() } : {}),
        });
        if (holdReceipt && new URL(request.url()).pathname.endsWith('/receipts')) {
          holdReceipt = false;
          await new Promise<void>((done) => {
            releaseReceipt = done;
          });
        }
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
        route.fulfill({ contentType: 'text/html', body: legacy ? legacyHtml : html }),
      );
      await carrier.goto(carrierOrigin + '/smartmapper-lab');
      await worker.evaluate(async () => {
        await chrome.storage.session.set({ miaToken: 'mia_ext_synthetic', principal: 'demo/7' });
      });
      await clickToolbar(context, extensionId, carrier);
      const panel = await context.newPage();
      await panel.goto('chrome-extension://' + extensionId + '/sidepanel.html');
      await expect(
        panel.getByText('Version ' + extensionMetadata.version, { exact: true }),
      ).toBeVisible();
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
      if (legacy) {
        await expect(
          panel
            .getByText('I could not confidently identify what this field asks.', {
              exact: false,
            })
            .first(),
        ).toBeVisible();
        await expect(carrier.locator('#first')).toHaveValue('');
        await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
        await panel
          .getByRole('button', { name: 'Resume mapping', exact: true })
          .evaluate((element: HTMLButtonElement) => element.click());
      }
      await expect(carrier.locator('#first')).toHaveValue('Alex');
      await expect(
        panel.getByText("I'm out of things to do on this page.", { exact: false }),
      ).toBeVisible();
      expect(observations).toBe(legacy ? 3 : 2);
      if (legacy) {
        await expect(carrier.locator('#middle')).toHaveValue('');
        await expect(carrier.locator('#last')).toHaveValue('Example');
        await expect(carrier.locator('#other-first')).toHaveValue('');
      }
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
      expect(observations).toBe(legacy ? 3 : 2);
      await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
      await panel.reload();
      await expect(panel.getByRole('log')).toContainText(note);
      await expect(panel.getByRole('log')).toContainText(reply);
      await carrier.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(carrier.locator('#first')).toHaveValue('');
      expect(observations).toBe(legacy ? 3 : 2);
      await panel
        .getByRole('button', { name: 'Resume mapping', exact: true })
        .evaluate((element: HTMLButtonElement) => element.click());
      await expect(carrier.locator('#first')).toHaveValue('Alex');
      await expect(
        panel.getByText((legacy ? '3' : '2') + ' entries verified', { exact: false }),
      ).toBeVisible();
      expect(sawGuidance).toBe(true);
      await expect(
        panel.getByText("I'm out of things to do on this page.", { exact: false }),
      ).toBeVisible();
      await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
      const observationsBeforeTabSwitch = observations;
      const otherCarrier = await context.newPage();
      await otherCarrier.route('**/*', (route) =>
        route.fulfill({ contentType: 'text/html', body: html }),
      );
      await otherCarrier.goto('https://another-carrier.example.test/quote');
      await clickToolbar(context, extensionId, otherCarrier);
      await panel
        .getByRole('button', { name: 'Resume mapping', exact: true })
        .evaluate((element: HTMLButtonElement) => element.click());
      await expect(panel.getByRole('alert')).toContainText('Return to the original quote tab');
      await expect(otherCarrier.locator('#first')).toHaveValue('');
      await expect(otherCarrier.locator('body')).not.toHaveAttribute('data-submitted');
      expect(observations).toBe(observationsBeforeTabSwitch);
      await otherCarrier.close();
      await carrier.bringToFront();
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
      await expect(
        panel.getByRole('button', { name: 'Resume mapping', exact: true }),
      ).toBeEnabled();
      await expect(carrier.locator('#first')).toHaveValue('');
      await expect(panel.getByRole('heading', { name: 'paused', exact: true })).toBeVisible();
      await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
      if (legacy) {
        holdPlanning = false;
        await carrier.locator('#last').evaluate((element: HTMLInputElement) => {
          element.value = '';
        });
        holdReceipt = true;
        await panel
          .getByRole('button', { name: 'Resume mapping', exact: true })
          .evaluate((element: HTMLButtonElement) => element.click());
        await expect.poll(() => Boolean(releaseReceipt)).toBe(true);
        await expect(carrier.locator('#first')).toHaveValue('Alex');
        await panel
          .getByRole('button', { name: 'Pause', exact: true })
          .evaluate((element: HTMLButtonElement) => element.click());
        await expect(panel.getByRole('heading', { name: 'paused', exact: true })).toBeVisible();
        releaseReceipt!();
        await expect(
          panel.getByRole('button', { name: 'Resume mapping', exact: true }),
        ).toBeEnabled();
        await expect(carrier.locator('#last')).toHaveValue('');
        await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
      }
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
      releaseReceipt?.();
      await context.close();
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((done) => server!.close(() => done()));
      }
    }
  });
}

for (const revealMode of ['inline', 'postback'] as const) {
  test(`whole-page survey expands sections, fills across viewports, repairs a ${revealMode} reveal and automatically advances without issuing`, async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe('chromium');
    test.setTimeout(60_000);
    const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
      headless: true,
      channel: 'chromium',
      viewport: { width: 1100, height: 700 },
      args: [
        '--enable-unsafe-extension-debugging',
        '--disable-extensions-except=' + testExtensionPath,
        '--load-extension=' + testExtensionPath,
      ],
    });
    let server: ReturnType<typeof createApi> | undefined;
    let plans = 0;
    let firstPlanSize = 0;
    let repaired = false;
    let capturedTiles = 0;
    let issued = false;
    let postedBack = false;
    let valuesBeforeNext: { value: string; valid: boolean }[] = [];
    const fields = Array.from({ length: 10 }, (_, i) => ({
      label: 'Synthetic field ' + i,
      value: 'Answer ' + i,
      answerId: 'synthetic-' + i,
    }));
    const extra = { label: 'Revealed field', value: 'Supplied extra answer', answerId: 'extra' };
    const activeSource = {
      ...source,
      answers: [...fields, extra].map((field) => ({
        ...source.answers[0]!,
        answerId: field.answerId,
        question: field.label,
        sourcePath: 'synthetic.' + field.answerId,
        value: field.value,
      })),
    };
    const longHtml = `<!doctype html><html><head><title>Synthetic long quote</title><style>
    body{font:18px Arial}label{display:block;margin:14px}input{height:25px}fieldset{padding:20px}
    </style></head><body><h1>Applicant details</h1><form onsubmit="event.preventDefault();document.body.dataset.issued='true'">
    <details><summary>Applicant details</summary><fieldset><legend>Applicant</legend>
    ${fields
      .slice(0, 5)
      .map((f, i) => `<label>${f.label}<input id="f${i}" required></label>`)
      .join('')}
    <label id="reveal" hidden>Revealed field<input id="extra" required disabled></label></fieldset></details>
    <div style="height:550px"></div>
    <button type="button" aria-expanded="false" aria-controls="property" onclick="this.setAttribute('aria-expanded','true');document.querySelector('#property').hidden=false">Property details</button>
    <section id="property" hidden><h2>Property details</h2><fieldset><legend>Property</legend>
    ${fields
      .slice(5)
      .map((f, i) => `<label>${f.label}<input id="f${i + 5}" required></label>`)
      .join('')}</fieldset></section>
    <button type="button" id="next" onclick="window.recordReady(Array.from(document.querySelectorAll('input')).map(e=>({value:e.value,valid:e.validity.valid})),document.body.dataset.issued==='true').then(()=>location.href='/whole-page/review')">Next</button>
    <button type="submit" id="issue">Issue policy</button></form>
    <script>document.querySelector('#f0').addEventListener('change',()=>{${revealMode === 'postback' ? 'window.recordPostback().then(()=>location.reload());' : "document.querySelector('#reveal').hidden=false;document.querySelector('#extra').disabled=false;"}});</script>
    </body></html>`;
    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const extensionId = new URL(worker.url()).host;
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
                expiresAt: new Date(Date.now() + 120_000).toISOString(),
              },
              sourceToken: 's'.repeat(43),
              source: activeSource,
            }),
          read: () => Promise.resolve(activeSource),
          revoke: () => Promise.resolve(),
        },
        {
          providerId: 'scripted-whole-page',
          proposeMappings: (request) => {
            plans++;
            expect(request.page.capture).toEqual({ complete: true, unexpanded: 0 });
            capturedTiles = Math.max(capturedTiles, request.page.images?.length ?? 0);
            const actions = request.page.controls.flatMap((control) => {
              const answer = activeSource.answers.find((item) => item.question === control.label);
              if (!answer || control.disabled || control.value === answer.value) return [];
              if (control.label === extra.label) repaired = true;
              return [
                {
                  ...action,
                  actionId: randomUUID(),
                  pageStateId: request.page.pageStateId,
                  elementId: control.elementId,
                  sourceAnswerIds: [answer.answerId],
                  value: String(answer.value),
                },
              ];
            });
            if (plans === 1) firstPlanSize = actions.length;
            return Promise.resolve({
              version: '2.0',
              pageStateId: request.page.pageStateId,
              outcome: actions.length ? 'act' : 'page_complete',
              actions,
              reviews: [],
            });
          },
        },
        {
          verify: () => Promise.resolve({ approved: true }),
          verifySection: (entries, page) => {
            expect(page.images!.length).toBeGreaterThan(1);
            expect(entries.every((entry) => entry.action.value === entry.sources[0]?.value)).toBe(
              true,
            );
            return Promise.resolve(entries.map(() => ({ approved: true })));
          },
        },
        {
          miaOrigins: new Set([miaOrigin]),
          carrierOrigins: new Set([carrierOrigin]),
          principals: new Set(['demo/7']),
          autoNext: true,
        },
      );
      server = createApi(service, new Set(['chrome-extension://' + extensionId]));
      await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing_address');
      await context.route(backend + '/**', async (route) => {
        const req = route.request();
        const response = await fetch(
          'http://127.0.0.1:' + address.port + new URL(req.url()).pathname,
          {
            method: req.method(),
            headers: req.headers(),
            ...(req.postData() ? { body: req.postData() } : {}),
          },
        );
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      });
      await context.route(miaOrigin + '/**', async (route) => {
        if (new URL(route.request().url()).pathname.endsWith('/grants'))
          await route.fulfill({ status: 201, json: { code: 'c'.repeat(43) } });
        else
          await route.fulfill({
            json: {
              results: [
                {
                  id: 'quote-synthetic',
                  client_name: 'Synthetic applicant',
                  quote_number: 'DEMO-PAGE',
                  form_type: 'home',
                },
              ],
            },
          });
      });
      const carrier = await context.newPage();
      await carrier.exposeFunction(
        'recordReady',
        (values: { value: string; valid: boolean }[], wasIssued: boolean) => {
          valuesBeforeNext = values;
          issued = wasIssued;
        },
      );
      await carrier.exposeFunction('recordPostback', () => {
        postedBack = true;
      });
      await carrier.route(carrierOrigin + '/**', async (route) => {
        if (new URL(route.request().url()).pathname === '/whole-page/review') {
          await route.fulfill({
            contentType: 'text/html',
            body: '<h1>Quote review</h1><form onsubmit="event.preventDefault();document.body.dataset.issued=\'true\'"><button type="submit">Issue policy</button></form>',
          });
        } else
          await route.fulfill({
            contentType: 'text/html',
            body: postedBack
              ? longHtml
                  .replace('<input id="f0" required>', '<input id="f0" required value="Answer 0">')
                  .replace('id="reveal" hidden', 'id="reveal"')
                  .replace('id="extra" required disabled', 'id="extra" required')
                  .replace(/<script>.*<\/script>/, '')
              : longHtml,
          });
      });
      await carrier.goto(carrierOrigin + '/whole-page');
      await worker.evaluate(async () => {
        await chrome.storage.session.set({ miaToken: 'mia_ext_synthetic', principal: 'demo/7' });
      });
      await clickToolbar(context, extensionId, carrier);
      const panel = await context.newPage();
      await panel.goto('chrome-extension://' + extensionId + '/sidepanel.html');
      await panel.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(panel.locator('#quote')).toHaveValue('quote-synthetic');
      await carrier.bringToFront();
      await panel
        .getByRole('button', { name: 'Start mapping', exact: true })
        .evaluate((element: HTMLButtonElement) => element.click());
      await expect(carrier).toHaveURL(carrierOrigin + '/whole-page/review', { timeout: 45_000 });
      await expect(
        panel.getByText("I'm out of things to do on this page.", { exact: false }),
      ).toBeVisible({ timeout: 10_000 });
      expect(firstPlanSize).toBe(10);
      expect(capturedTiles).toBeGreaterThan(1);
      expect(repaired).toBe(true);
      expect(postedBack).toBe(revealMode === 'postback');
      expect(plans).toBe(4); // Initial page, revealed-field repair, clean review, next page review.
      expect(issued).toBe(false);
      expect(valuesBeforeNext).toHaveLength(11);
      expect(valuesBeforeNext.every((value) => value.valid && !!value.value)).toBe(true);
      await expect(carrier.locator('body')).not.toHaveAttribute('data-issued');
      const stored = JSON.stringify(
        await worker.evaluate(async () => await chrome.storage.session.get('job')),
      );
      expect(stored).not.toContain('data:image');
      expect(stored).not.toContain('Supplied extra answer');
    } finally {
      await context.close();
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((done) => server!.close(() => done()));
      }
    }
  });
}

test('executor refuses issuance clicks, stale DOM and unverified custom options', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const extensionPath = testExtensionPath;
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    headless: true,
    channel: 'chromium',
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath,
    ],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    const carrier = await context.newPage();
    await carrier.route('**/smartmapper-lab', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await carrier.goto('http://127.0.0.1:4173/smartmapper-lab');
    await clickToolbar(context, extensionId, carrier);
    const panel = await context.newPage();
    await panel.goto('chrome-extension://' + extensionId + '/sidepanel.html');
    await carrier.bringToFront();
    const tabId = await panel.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) throw new Error('tab_missing');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          Object.assign(window, { smartMapperContentV2: '0.2.1' });
        },
      });
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
    // Navigation is a distinct internal action, never a generic click bypass.
    for (const mode of [
      'ready',
      'issue',
      'cross_form',
      'cross_link',
      'consent',
      'commitment',
      'invalid',
      'human_only',
      'stale',
    ]) {
      await carrier.evaluate((mode) => {
        document.body.innerHTML = `<h1>Applicant</h1><form onsubmit="event.preventDefault();document.body.dataset.submitted='true'">
          <label>First Name<input value="Alex" required></label><button id="next" type="submit">Next</button>
          <button type="submit">Issue policy</button></form>`;
        delete document.body.dataset.next;
        delete document.body.dataset.submitted;
        const next = document.querySelector<HTMLButtonElement>('#next')!;
        next.onclick = (event) => {
          event.preventDefault();
          document.body.dataset.next = 'true';
        };
        if (mode === 'issue') next.textContent = 'Issue policy';
        if (mode === 'cross_form') next.form!.action = 'https://other.example.test/quote';
        if (mode === 'cross_link')
          next.outerHTML = '<a id="next" href="https://other.example.test/quote">Next</a>';
        if (mode === 'consent')
          next.insertAdjacentHTML('beforebegin', '<label><input type="checkbox">I agree</label>');
        if (mode === 'commitment')
          next.insertAdjacentHTML('beforebegin', '<p>By clicking Next you authorize payment.</p>');
        if (mode === 'invalid')
          document
            .querySelector<HTMLInputElement>('input')!
            .setCustomValidity('Synthetic invalid value');
        if (mode === 'human_only') next.dataset.smartmapperHumanOnly = 'true';
      }, mode);
      const reviewed = PageObservationSchema.parse(
        await panel.evaluate(async (id) => {
          await chrome.tabs.sendMessage(id, { type: 'prepare-survey', tabId: id });
          return (await chrome.tabs.sendMessage(id, {
            type: 'finish-survey',
            tabId: id,
            complete: true,
          })) as unknown;
        }, tabId),
      );
      const nextControl =
        reviewed.controls.find((control) => control.label === 'Next') ??
        reviewed.controls.find((control) => control.label === 'Issue policy')!;
      if (mode === 'stale')
        await carrier.locator('#next').evaluate((element) => {
          element.textContent = 'Issue policy';
        });
      const dispatched: unknown = await panel.evaluate(
        async ({ id, batch }) =>
          (await chrome.tabs.sendMessage(id, { type: 'execute', batch })) as unknown,
        {
          id: tabId,
          batch: {
            batchId: randomUUID(),
            action: {
              ...action,
              type: 'next_page' as const,
              pageStateId: reviewed.pageStateId,
              elementId: nextControl.elementId,
              sourceAnswerIds: [],
              value: null,
            },
            sources: [],
          },
        },
      );
      if (mode === 'ready') {
        expect(dispatched).toMatchObject({ status: 'executed' });
        await expect(carrier.locator('body')).toHaveAttribute('data-next', 'true');
      } else {
        expect(dispatched).toMatchObject({ status: 'blocked' });
        await expect(carrier.locator('body')).not.toHaveAttribute('data-next');
      }
      await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
    }
    // Reuse one captured plan across independent entries, but never across a changed page.
    for (const mode of [
      'normal',
      'other_answer',
      'layout',
      'wording',
      'replacement',
      'validation',
    ]) {
      await carrier.evaluate((change) => {
        document.body.innerHTML = `<form onsubmit="event.preventDefault();document.body.dataset.submitted='true'">
          <fieldset><legend>Applicant 1</legend><span id="first-wording">First</span><input id="first">
          <span id="last-wording">Last</span><input id="last"></fieldset><button type="submit">Issue policy</button></form>`;
        document.querySelector('#first')!.addEventListener('change', () => {
          if (change === 'layout')
            document.querySelector('fieldset')!.append(document.createElement('input'));
          if (change === 'wording')
            document.querySelector('#last-wording')!.textContent = 'Second applicant';
          if (change === 'replacement') {
            const last = document.querySelector('#last')!;
            last.replaceWith(last.cloneNode(true));
          }
          if (change === 'validation')
            (document.querySelector('#first') as HTMLInputElement).setCustomValidity(
              'Synthetic validation error',
            );
        });
      }, mode);
      const plannedPage = await observe();
      const firstControl = plannedPage.controls[0]!;
      const lastControl = plannedPage.controls[1]!;
      const lastSource = {
        ...source.answers[0]!,
        answerId: 'last',
        question: 'Last Name',
        sourcePath: 'applicant1.lastName',
        value: 'Example',
      };
      const execute = (field: typeof action, answers: typeof source.answers) =>
        panel.evaluate(
          async ({ id, batch }): Promise<unknown> =>
            await chrome.tabs.sendMessage(id, { type: 'execute', batch }),
          { id: tabId, batch: { batchId: randomUUID(), action: field, sources: answers } },
        );
      const firstResult = await execute(
        { ...action, pageStateId: plannedPage.pageStateId, elementId: firstControl.elementId },
        source.answers,
      );
      expect(firstResult).toMatchObject({ status: mode === 'validation' ? 'failed' : 'verified' });
      if (mode === 'other_answer') await carrier.locator('#last').fill('Human edit');
      const nextResult = await execute(
        {
          ...action,
          actionId: 'last-entry',
          pageStateId: plannedPage.pageStateId,
          elementId: lastControl.elementId,
          sourceAnswerIds: ['last'],
          value: 'Example',
        },
        [lastSource],
      );
      expect(nextResult).toMatchObject(
        mode === 'normal' ? { status: 'verified' } : { status: 'blocked', reason: 'page_changed' },
      );
      await expect(carrier.locator('#last')).toHaveValue(
        mode === 'normal' ? 'Example' : mode === 'other_answer' ? 'Human edit' : '',
      );
      await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
    }
  } finally {
    await context.close();
  }
});
