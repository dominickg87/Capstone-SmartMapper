import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  AutomationActionV2Schema,
  SourceAnswersSchema,
  type SmartMapperPlan,
} from '@smartmapper/contracts';
import { ActiveTabJobService } from '../../apps/orchestrator-api/src/active-tab-service.js';
import { MemoryCheckpointStore } from '../../apps/orchestrator-api/src/checkpoints.js';
import { createApi } from '../../apps/orchestrator-api/src/http.js';

const manifest = JSON.parse(
  readFileSync('apps/extension-prototype/dist/manifest.json', 'utf8'),
) as { host_permissions: string[]; content_scripts: { matches: string[] }[] };
const backend = new URL(manifest.host_permissions[0]!).origin;
const mia = new URL(manifest.content_scripts[0]!.matches[0]!).origin;
const carrierOrigin = 'https://pdf-carrier.example.test';
const raw = JSON.parse(
  readFileSync('fixtures/mia-quotes/active-tab.synthetic.json', 'utf8'),
) as Record<string, unknown>;
const source = {
  ...SourceAnswersSchema.parse(raw.source),
  answers: [],
  sourceFormat: 'pdf' as const,
};
const action = AutomationActionV2Schema.parse(raw.action);
const bytes = Buffer.from('%PDF-1.4 Synthetic browser boundary fixture');
const document = {
  tenantId: source.tenantId,
  userId: source.userId,
  quoteId: source.quoteId,
  revision: source.revision,
  digest: createHash('sha256').update(bytes).digest('hex'),
  data: bytes.toString('base64'),
};

async function activate(context: BrowserContext, id: string, page: Page) {
  await page.bringToFront();
  const cdp = await context.browser()!.newBrowserCDPSession();
  const targets = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = targets.targetInfos.find((item) => item.url === page.url());
  if (!tab) throw new Error('missing_test_tab');
  await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  await cdp.detach();
}

async function launch(profile: string) {
  const path = resolve('apps/extension-prototype/dist');
  return chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium',
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-extensions-except=' + path,
      '--load-extension=' + path,
    ],
  });
}

test('toolbar activation enables the panel on only one tab and disables it on another origin', async ({
  browserName,
}, info) => {
  expect(browserName).toBe('chromium');
  const context = await launch(info.outputPath('profile'));
  try {
    await context.route('https://*.example.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Synthetic carrier</h1><button>Issue policy</button>',
      }),
    );
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const first = await context.newPage();
    await first.goto(carrierOrigin + '/first');
    const second = await context.newPage();
    await second.goto(carrierOrigin + '/second');
    await activate(context, id, first);
    const options = () =>
      worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return Promise.all(
          tabs.map(async (tab) => ({
            id: tab.id,
            ...(await chrome.sidePanel.getOptions({ tabId: tab.id })),
          })),
        );
      });
    await expect.poll(async () => (await options()).filter((item) => item.enabled).length).toBe(1);
    const firstOption = (await options()).find((item) => item.enabled)!;
    expect(firstOption.path).toBe('sidepanel.html?tabId=' + firstOption.id);
    await expect
      .poll(
        async () =>
          await worker.evaluate(async () =>
            (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).map(
              (item) => item.documentUrl,
            ),
          ),
      )
      .toContain('chrome-extension://' + id + '/' + firstOption.path);
    expect(await worker.evaluate(() => chrome.sidePanel.getOptions({}))).toMatchObject({
      enabled: false,
    });
    await second.bringToFront();
    expect((await options()).filter((item) => item.enabled).map((item) => item.id)).toEqual([
      firstOption.id,
    ]);
    await activate(context, id, second);
    await expect
      .poll(async () => (await options()).filter((item) => item.enabled).map((item) => item.id))
      .not.toContain(firstOption.id);
    expect((await options()).filter((item) => item.enabled)).toHaveLength(1);
    const secondOption = (await options()).find((item) => item.enabled)!;
    await expect
      .poll(
        async () =>
          await worker.evaluate(async () =>
            (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).map(
              (item) => item.documentUrl,
            ),
          ),
      )
      .toContain('chrome-extension://' + id + '/' + secondOption.path);
    await second.goto('https://another.example.test/quote');
    await expect.poll(async () => (await options()).filter((item) => item.enabled).length).toBe(0);
    await expect(first.locator('body')).not.toHaveAttribute('data-submitted');
  } finally {
    await context.close();
  }
});

for (const mode of ['batch', 'dynamic', 'review']) {
  const dynamic = mode === 'dynamic';
  const review = mode === 'review';
  test(`PDF page batches use targeted images and ${dynamic ? 'repair a revealed field' : review ? 'support suggestions and human field skips' : 'finish without another planning call'}`, async ({
    browserName,
  }, info) => {
    expect(browserName).toBe('chromium');
    const context = await launch(info.outputPath('profile'));
    let server: ReturnType<typeof createApi> | undefined;
    let calls = 0;
    let downloads = 0;
    const images: number[] = [];
    try {
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
      const id = new URL(worker.url()).host;
      const service = new ActiveTabJobService(
        new MemoryCheckpointStore(),
        {
          redeem: (input) => {
            expect(input.sourceFormat).toBe('pdf');
            return Promise.resolve({
              version: '2.0',
              sourceToken: 's'.repeat(43),
              source,
              binding: {
                tenantId: source.tenantId,
                userId: source.userId,
                quoteId: source.quoteId,
                tabId: input.tabId,
                carrierOrigin,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
              },
            });
          },
          read: () => Promise.resolve(structuredClone(source)),
          document: () => {
            downloads++;
            return Promise.resolve(document);
          },
          revoke: () => Promise.resolve(),
        },
        {
          providerId: 'synthetic-pdf',
          proposeMappings: (request): Promise<SmartMapperPlan> => {
            calls++;
            expect(request.document).toEqual(document);
            expect(request.source.answers).toEqual([]);
            expect(request.page.capture).toEqual({
              complete: true,
              unexpanded: 0,
              mode: 'targeted',
            });
            images.push(request.page.images?.length ?? 0);
            if (review && calls === 1)
              return Promise.resolve({
                version: '2.0',
                pageStateId: request.page.pageStateId,
                outcome: 'human_input',
                actions: [],
                reviews: [
                  {
                    elementId: request.page.controls.find(
                      (control) => control.label === 'First Name',
                    )!.elementId,
                    question: 'First Name',
                    entity: 'Applicant',
                    reason: 'ambiguous_match',
                  },
                ],
              });
            const fields = request.page.controls.filter(
              (control) =>
                control.tag === 'input' &&
                !control.value &&
                !request.skippedElementIds?.includes(control.elementId),
            );
            expect(fields.length).toBeGreaterThan(0);
            return Promise.resolve({
              version: '2.0',
              pageStateId: request.page.pageStateId,
              outcome: 'act',
              reviews: [],
              documentAnswers: fields.map((control) => ({
                answerId: control.key,
                page: 1,
                question: control.label || 'Middle Name',
                entity: 'Applicant 1',
                value:
                  control.label === 'First Name'
                    ? 'Alex'
                    : control.label === 'Last Name'
                      ? 'Synthetic'
                      : 'Example',
              })),
              actions: fields
                .map((control) => ({
                  ...action,
                  actionId: control.key,
                  pageStateId: request.page.pageStateId,
                  elementId: control.elementId,
                  sourceAnswerIds: [control.key],
                  value:
                    control.label === 'First Name'
                      ? 'Alex'
                      : control.label === 'Last Name'
                        ? 'Synthetic'
                        : 'Example',
                }))
                .reverse(),
            });
          },
          discussMapping: (request) => {
            expect(request.document).toEqual(document);
            expect(request.conversation.at(-1)?.text).toContain('Suggest the best supported match');
            return Promise.resolve({
              version: '2.0',
              reply:
                'The PDF lists First Name as Alex. Please review the carrier field before entering it.',
            });
          },
        },
        {
          verify: (_action, _control, _sources, _page, sheet) => {
            expect(sheet).toEqual(document);
            return Promise.resolve({ approved: true });
          },
          verifySection: (entries, _page, sheet) => {
            expect(sheet).toEqual(document);
            return Promise.resolve(entries.map(() => ({ approved: true })));
          },
        },
        {
          miaOrigins: new Set([mia]),
          carrierOrigins: new Set(),
          allowAnyCarrier: true,
          principals: new Set(['demo/7']),
        },
      );
      server = createApi(service, new Set(['chrome-extension://' + id]));
      await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('address_missing');
      await context.route(backend + '/**', async (route) => {
        const request = route.request();
        const response = await fetch(
          'http://127.0.0.1:' + address.port + new URL(request.url()).pathname,
          {
            method: request.method(),
            headers: request.headers(),
            ...(request.postData() ? { body: request.postData() } : {}),
          },
        );
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text(),
        });
      });
      await context.route(mia + '/**', async (route) => {
        if (route.request().url().includes('/quotes/search'))
          await route.fulfill({
            json: {
              results: [
                {
                  id: source.quoteId,
                  client_name: 'Alex Synthetic',
                  quote_number: 'PDF-TEST',
                  form_type: 'auto',
                },
              ],
            },
          });
        else if (route.request().url().endsWith('/grants')) {
          expect(route.request().postDataJSON()).toMatchObject({ sourceFormat: 'pdf' });
          await route.fulfill({ status: 201, json: { code: 'c'.repeat(43) } });
        } else await route.abort();
      });
      const carrier = await context.newPage();
      await carrier.route(carrierOrigin + '/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><h1>Applicant</h1><form onsubmit="event.preventDefault();document.body.dataset.submitted='true'">
        <label>First Name<input id="first" required></label>
        <div style="margin-top:900px" id="reveal" hidden><span>Middle Name</span><input id="middle" required></div>
        <div style="margin-top:1800px"><label>Last Name<input id="last" required></label></div>
        <button type="submit">Issue policy</button></form>
        <script>window.entryOrder=[];document.addEventListener('change',e=>window.entryOrder.push(e.target.id));${dynamic ? "document.querySelector('#first').addEventListener('change',()=>document.querySelector('#reveal').hidden=false);" : ''}</script>`,
        }),
      );
      await carrier.goto(carrierOrigin + '/quote');
      await worker.evaluate(() =>
        chrome.storage.session.set({ miaToken: 'mia_ext_synthetic', principal: 'demo/7' }),
      );
      await activate(context, id, carrier);
      const panel = await context.newPage();
      await panel.goto('chrome-extension://' + id + '/sidepanel.html');
      await panel.getByLabel('Find a quote').fill('synthetic');
      await panel.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(panel.getByLabel('Selected quote')).toHaveValue(source.quoteId);
      await carrier.bringToFront();
      await panel
        .getByRole('button', { name: 'Start mapping', exact: true })
        .evaluate((element) => (element as HTMLButtonElement).click());
      if (review) {
        await expect(panel.getByRole('listitem').first()).toContainText('First Name');
        await panel
          .getByRole('button', { name: 'Suggest a match', exact: true })
          .first()
          .evaluate((element) => (element as HTMLButtonElement).click());
        await expect(panel.getByRole('log')).toContainText('The PDF lists First Name as Alex');
        await expect(carrier.locator('#first')).toHaveValue('');
        await carrier.locator('#first').fill('Human entry');
        await carrier.locator('#first').press('Tab');
        await panel
          .getByRole('button', { name: 'Skip this field', exact: true })
          .first()
          .evaluate((element) => (element as HTMLButtonElement).click());
      }
      await expect(carrier.locator('#first')).toHaveValue(review ? 'Human entry' : 'Alex');
      await expect(carrier.locator('#last')).toHaveValue('Synthetic');
      if (dynamic) await expect(carrier.locator('#middle')).toHaveValue('Example');
      await expect(
        panel.getByText("I'm out of things to do on this page.", { exact: false }),
      ).toBeVisible();
      expect(downloads).toBe(1);
      expect(calls).toBe(dynamic || review ? 2 : 1);
      expect(images[0]).toBe(1);
      if (dynamic) expect(images[1]).toBeLessThanOrEqual(3);
      const order = await carrier.evaluate(
        () => (window as unknown as { entryOrder: string[] }).entryOrder,
      );
      expect(order).toEqual(dynamic ? ['first', 'middle', 'last'] : ['first', 'last']);
      await expect(carrier.locator('body')).not.toHaveAttribute('data-submitted');
    } finally {
      await context.close();
      if (server) await new Promise<void>((done) => server!.close(() => done()));
    }
  });
}
