import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import {
  SourceAnswersSchema,
  type AutomationActionV2,
  type SmartMapperObservation,
  type SmartMapperPlan,
} from '@smartmapper/contracts';
import { ActiveTabJobService } from '../../apps/orchestrator-api/src/active-tab-service.js';
import { MemoryCheckpointStore } from '../../apps/orchestrator-api/src/checkpoints.js';
import { createApi } from '../../apps/orchestrator-api/src/http.js';
import { MemoryMappingStore } from '../../apps/orchestrator-api/src/mapping-memory-store.js';

const backend = 'https://asp-smartmapper-dev-fgbqddfbewfrd2at.eastus-01.azurewebsites.net';
const extensionManifest = JSON.parse(
  readFileSync(resolve('apps/extension-prototype/dist/manifest.json'), 'utf8'),
) as { content_scripts: { matches: string[] }[] };
const miaOrigin = new URL(extensionManifest.content_scripts[0]!.matches[0]!).origin;

const base = {
  sourcePath: 'applicant1.field',
  section: 'Applicant',
  entity: 'Applicant 1',
  context: [],
  options: [],
  status: 'answered' as const,
};
const source = SourceAnswersSchema.parse({
  version: '2.0',
  tenantId: 'demo',
  userId: '7',
  quoteId: 'quote-synthetic',
  formType: 'auto',
  revision: 'revision-1',
  unavailablePaths: [],
  answers: [
    {
      ...base,
      answerId: 'first-name',
      questionId: 'applicant-first-name',
      question: 'First Name',
      value: 'Alex',
      dataType: 'text',
    },
    {
      ...base,
      answerId: 'dob',
      questionId: 'applicant-dob',
      question: 'Date of Birth',
      value: '1990-04-12',
      dataType: 'date',
    },
    {
      ...base,
      answerId: 'marital',
      questionId: 'applicant-marital',
      question: 'Marital Status',
      value: 'Married',
      dataType: 'enum',
      options: [
        { value: 'Married', label: 'Married' },
        { value: 'Single', label: 'Single' },
      ],
    },
    {
      ...base,
      answerId: 'prior',
      questionId: 'prior-insurance',
      question: 'Currently insured?',
      value: true,
      dataType: 'boolean',
    },
  ],
});

// Synthetic carrier page. Codes and labels differ from M.I.A. wording on purpose.
const html = `<!doctype html><html><head><title>Synthetic carrier</title></head><body>
<h1>Quote</h1><form onsubmit="event.preventDefault();document.body.dataset.submitted='true'">
<fieldset><legend>Applicant 1</legend>
<label for="first">First Name</label><input id="first" name="first">
<label for="dob">Date of birth</label><input id="dob" name="dob">
<label for="marital">Marital status</label><select id="marital" name="marital">
<option value="">Choose</option><option value="M">Married</option><option value="S">Single</option></select>
</fieldset>
<fieldset><legend>Prior insurance</legend>
<input type="radio" id="prior-yes" name="prior" value="Y"><label for="prior-yes">Yes</label>
<input type="radio" id="prior-no" name="prior" value="N"><label for="prior-no">No</label>
</fieldset>
<label><input id="consent" type="checkbox">I agree to the terms</label>
<button type="submit">Issue policy</button></form></body></html>`;

const click = (page: Page, name: string) =>
  page
    .getByRole('button', { name, exact: true })
    .evaluate((element: HTMLButtonElement) => element.click());

test('approved mappings fill known fields on the next run without asking the model', async ({
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
  const modelFilled: string[] = [];
  let modelCalls = 0;
  const memory = new MemoryMappingStore();
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;
    // Scripted stand-in for the model: fills the first empty supported field it recognizes.
    const provider = {
      providerId: 'scripted-synthetic',
      proposeMappings: (request: SmartMapperObservation): Promise<SmartMapperPlan> => {
        modelCalls += 1;
        const find = (label: string) => request.page.controls.find((item) => item.label === label);
        const plan = (
          label: string,
          type: AutomationActionV2['type'],
          answerId: string,
          value: string | null,
          kind: AutomationActionV2['transformation']['kind'],
        ): SmartMapperPlan => {
          modelFilled.push(label);
          return {
            version: '2.0',
            pageStateId: request.page.pageStateId,
            outcome: 'act',
            actions: [
              {
                version: '2.0',
                actionId: randomUUID(),
                type,
                pageStateId: request.page.pageStateId,
                elementId: find(label)!.elementId,
                sourceAnswerIds: [answerId],
                value,
                checked: type === 'check' ? true : null,
                key: null,
                purpose: null,
                direction: null,
                milliseconds: null,
                transformation: { kind, explanation: 'Synthetic scripted mapping.' },
                confidence: 0.99,
              },
            ],
            reviews: [],
          };
        };
        if (!find('First Name')?.value)
          return Promise.resolve(plan('First Name', 'fill', 'first-name', 'Alex', 'identity'));
        if (!find('Date of birth')?.value)
          return Promise.resolve(plan('Date of birth', 'fill', 'dob', '04/12/1990', 'format'));
        if (!find('Marital status')?.value)
          return Promise.resolve(
            plan('Marital status', 'select', 'marital', 'M', 'equivalent_option'),
          );
        if (!find('Yes')?.checked)
          return Promise.resolve(plan('Yes', 'check', 'prior', null, 'equivalent_option'));
        return Promise.resolve({
          version: '2.0',
          pageStateId: request.page.pageStateId,
          outcome: 'page_complete',
          actions: [],
          reviews: [],
        });
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
      memory,
    );
    server = createApi(service, new Set(['chrome-extension://' + extensionId]));
    await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('address_missing');
    const apiOrigin = 'http://127.0.0.1:' + address.port;
    await context.route(backend + '/**', async (route) => {
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
    await click(panel, 'Search');
    await expect(panel.locator('#quote')).toHaveValue('quote-synthetic');

    // Run 1: the model fills every field.
    await carrier.bringToFront();
    await click(panel, 'Start mapping');
    await expect(
      panel.getByText("I'm out of things to do on this page.", { exact: false }),
    ).toBeVisible();
    await expect(carrier.locator('#first')).toHaveValue('Alex');
    await expect(carrier.locator('#dob')).toHaveValue('04/12/1990');
    await expect(carrier.locator('#marital')).toHaveValue('M');
    await expect(carrier.locator('#prior-yes')).toBeChecked();
    expect(modelFilled).toEqual(['First Name', 'Date of birth', 'Marital status', 'Yes']);
    expect(modelCalls).toBe(5);

    // The human corrects the date by hand; that pairing must not be offered for memory.
    await carrier.locator('#dob').fill('04/13/1990');
    await expect
      .poll(async () =>
        worker.evaluate(async () =>
          Object.keys((await chrome.storage.session.get('mappingEdits')).mappingEdits ?? {}),
        ),
      )
      .toHaveLength(1);

    await click(panel, 'Finish job');
    const review = panel.getByRole('region', { name: 'Remember mappings' });
    await expect(review.getByRole('checkbox')).toHaveCount(4);
    await expect(review.getByText("You changed this field, so it can't be saved.")).toHaveCount(1);
    const dateRow = review.getByRole('listitem').filter({ hasText: 'Date of birth' });
    await expect(dateRow.getByRole('checkbox')).toBeDisabled();
    await expect(review.getByText('← M.I.A.: Marital Status · matched to an option')).toBeVisible();
    for (const box of await review.getByRole('checkbox').all())
      if (await box.isEnabled()) await box.evaluate((element: HTMLInputElement) => element.click());
    await click(panel, 'Remember 3 and finish');
    await expect(
      panel.getByText('Job finished. Saved 3 mappings for next time.', { exact: true }),
    ).toBeVisible();
    // Mapping memory shares the job partition: tenant, user and carrier origin.
    const partition = createHash('sha256')
      .update(['demo', '7', 'http://127.0.0.1:4173'].join('\0'))
      .digest('hex');
    const saved = await memory.list(partition);
    expect(saved.map((entry) => entry.questionIds[0]).sort()).toEqual([
      'applicant-first-name',
      'applicant-marital',
      'prior-insurance',
    ]);
    for (const text of ['Alex', 'Married', 'First Name', '04/12', 'Yes'])
      expect(JSON.stringify(saved)).not.toContain(text);
    const stored = await worker.evaluate(async () => await chrome.storage.session.get(null));
    expect(JSON.stringify(stored)).not.toContain('Alex');
    expect(JSON.stringify(stored)).not.toContain('mappingFills');

    // Run 2: a fresh form. Memory fills the approved fields; the model only handles the date.
    await carrier.evaluate(() => document.querySelector('form')!.reset());
    modelFilled.length = 0;
    modelCalls = 0;
    await carrier.bringToFront();
    await click(panel, 'Start mapping');
    await expect(
      panel.getByText("I'm out of things to do on this page.", { exact: false }),
    ).toBeVisible();
    await expect(carrier.locator('#first')).toHaveValue('Alex');
    await expect(carrier.locator('#dob')).toHaveValue('04/12/1990');
    await expect(carrier.locator('#marital')).toHaveValue('M');
    await expect(carrier.locator('#prior-yes')).toBeChecked();
    expect(modelFilled).toEqual(['Date of birth']);
    expect(modelCalls).toBe(2);
    await expect(
      panel.getByText('4 entries verified (3 from saved mappings)', { exact: false }),
    ).toBeVisible();
    await expect(carrier.locator('#consent')).not.toBeChecked();
    await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');

    await click(panel, 'Finish job');
    await expect(
      panel.getByRole('region', { name: 'Remember mappings' }).getByRole('checkbox'),
    ).toHaveCount(1);
    await click(panel, 'Finish without saving');
    await expect(
      panel.getByText('Job finished. No mappings were saved.', { exact: true }),
    ).toBeVisible();
    expect(await memory.list(partition)).toHaveLength(3);
    await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
  } finally {
    await context.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((done) => server!.close(() => done()));
    }
  }
});
