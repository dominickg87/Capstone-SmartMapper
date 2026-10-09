import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, type Server } from 'node:http';
import { chromium, expect, test, type CDPSession, type Page } from '@playwright/test';
import {
  PageObservationSchema,
  type MiaFieldCatalog,
  type SourceAnswers,
  type TrainingSessionView,
} from '@smartmapper/contracts';
import { structuralTrainingObservation } from '../../apps/extension-prototype/src/training-observation.js';
import { ActiveTabJobService } from '../../apps/orchestrator-api/src/active-tab-service.js';
import { MemoryCheckpointStore } from '../../apps/orchestrator-api/src/checkpoints.js';
import { MemoryMappingRegistryStore } from '../../apps/orchestrator-api/src/mapping-registry.js';
import {
  MemoryTrainingSessionStore,
  TrainingService,
} from '../../apps/orchestrator-api/src/training-service.js';
import { createApi } from '../../apps/orchestrator-api/src/http.js';

const extensionPath = resolve('.tools/e2e-tab-panel-extension');
const extensionPackage = JSON.parse(
  readFileSync(resolve('apps/extension-prototype/package.json'), 'utf8'),
) as { version: string };

async function activateToolbar(client: CDPSession, extensionId: string, carrier: Page) {
  await carrier.bringToFront();
  const { targetInfos } = await client.send('Target.getTargets', {
    filter: [{ type: 'tab', exclude: false }],
  });
  const target = targetInfos.find((candidate) => candidate.url === carrier.url());
  if (!target) throw new Error('synthetic_carrier_tab_target_missing');
  await client.send('Extensions.triggerAction', { id: extensionId, targetId: target.targetId });
}

// Playwright does not expose Chrome's SIDE_PANEL targets as normal context pages.
// Read the actual panel DOM over CDP rather than opening a substitute browser tab.
async function panelText(
  client: CDPSession,
  documentUrl: string,
  expression = 'document.body.innerText',
): Promise<string> {
  const { targetInfos } = await client.send('Target.getTargets', { filter: [{}] });
  const target = targetInfos.find(
    (candidate) => candidate.type === 'page' && candidate.url === documentUrl,
  );
  if (!target) return '';
  const { sessionId } = await client.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: false,
  });
  try {
    return await new Promise<string>((resolveText, reject) => {
      const receive = (event: { sessionId: string; message: string }) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message) as {
          id?: number;
          result?: { result?: { value?: string } };
        };
        if (message.id !== 1) return;
        clearTimeout(timeout);
        client.off('Target.receivedMessageFromTarget', receive);
        resolveText(message.result?.result?.value ?? '');
      };
      const timeout = setTimeout(() => {
        client.off('Target.receivedMessageFromTarget', receive);
        reject(new Error('synthetic_panel_read_timeout'));
      }, 3000);
      client.on('Target.receivedMessageFromTarget', receive);
      void client
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({
            id: 1,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true },
          }),
        })
        .catch((error: unknown) => {
          clearTimeout(timeout);
          client.off('Target.receivedMessageFromTarget', receive);
          reject(error instanceof Error ? error : new Error('synthetic_panel_read_failed'));
        });
    });
  } finally {
    await client.send('Target.detachFromTarget', { sessionId });
  }
}

test.beforeAll(() => {
  execFileSync(
    process.execPath,
    [resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', extensionPath, '--emptyOutDir'],
    {
      cwd: resolve('apps/extension-prototype'),
      env: {
        ...process.env,
        VITE_SMARTMAPPER_BACKEND_ORIGIN: 'http://127.0.0.1:5199',
        VITE_SMARTMAPPER_MIA_ORIGIN: 'http://127.0.0.1:5198',
        VITE_SMARTMAPPER_CARRIER_ORIGINS: 'http://127.0.0.1:4173',
        VITE_SMARTMAPPER_ALLOW_ANY_CARRIER: 'false',
      },
      stdio: 'pipe',
    },
  );
  execFileSync(
    process.execPath,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'vite.content.config.ts',
      '--outDir',
      extensionPath,
    ],
    {
      cwd: resolve('apps/extension-prototype'),
      stdio: 'pipe',
    },
  );
});

async function listen(server: Server, port: number) {
  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListening);
  });
}

async function closeServer(server: Server | undefined) {
  if (!server) return;
  await new Promise<void>((resolveClosed, reject) =>
    server.close((error) => (error ? reject(error) : resolveClosed())),
  );
}

function clickPanelButton(client: CDPSession, documentUrl: string, label: string) {
  return panelText(
    client,
    documentUrl,
    `(() => {
    const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) return 'unavailable'; button.click(); return 'clicked';
  })()`,
  );
}

test('the real panel restores and tests saved work after its original carrier tab is closed', async ({
  browserName,
}, testInfo) => {
  test.setTimeout(90_000);
  expect(browserName).toBe('chromium');
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath('reopened-panel-profile'),
    {
      headless: true,
      channel: 'chromium',
      args: [
        '--enable-unsafe-extension-debugging',
        '--disable-extensions-except=' + extensionPath,
        '--load-extension=' + extensionPath,
      ],
    },
  );
  let api: Server | undefined;
  let mia: Server | undefined;
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).hostname;
    const carrierOrigin = 'http://127.0.0.1:4173';
    const miaOrigin = 'http://127.0.0.1:5198';
    const catalog: MiaFieldCatalog = {
      version: '2.0',
      schemaRevision: 'synthetic-home',
      formType: 'home',
      entityLimits: [],
      templates: [],
      fields: [],
    };
    const jobs = new MemoryCheckpointStore();
    const registry = new MemoryMappingRegistryStore();
    const access = {
      miaOrigins: new Set([miaOrigin]),
      carrierOrigins: new Set([carrierOrigin]),
      principals: new Set(['tenant/user']),
    };
    const training = new TrainingService(
      new MemoryTrainingSessionStore(),
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0',
            binding: {
              tenantId: 'tenant',
              userId: 'user',
              carrierOrigin,
              tabId: request.tabId,
              formType: 'home',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
            catalog,
          }),
      },
      registry,
      access,
      jobs,
    );
    const runtime = new ActiveTabJobService(
      jobs,
      {
        redeem: () => Promise.reject(new Error('unexpected_quote_grant')),
        read: () => Promise.reject(new Error('unexpected_source_read')),
        revoke: () => Promise.resolve(),
      },
      registry,
      access,
    );
    api = createApi(
      runtime,
      new Set([`chrome-extension://${extensionId}`]),
      () => undefined,
      30_000,
      training,
    );
    await listen(api, 5199);
    mia = createServer((request, response) => {
      response.setHeader('Access-Control-Allow-Origin', `chrome-extension://${extensionId}`);
      response.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      if (request.method === 'OPTIONS') {
        response.writeHead(204).end();
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/extension/smartmapper/v2/catalog/home')
        response.end(JSON.stringify(catalog));
      else if (request.url === '/api/extension/smartmapper/v2/training/grants')
        response.end(JSON.stringify({ code: 'g'.repeat(32) }));
      else response.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    });
    await listen(mia, 5198);
    const original = await context.newPage();
    await original.goto(`${carrierOrigin}/classic?step=1`);
    const originalTab = await worker.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!,
    );
    const serialized = await worker.evaluate(async (id) => {
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
      return JSON.stringify(
        await chrome.tabs.sendMessage(id, { type: 'training-observe', tabId: id }),
      );
    }, originalTab.id!);
    const observation = await structuralTrainingObservation(
      PageObservationSchema.parse(JSON.parse(serialized) as unknown),
    );
    const started = await training.start({
      miaOrigin,
      code: 'g'.repeat(32),
      verifier: 'v'.repeat(43),
      carrierOrigin,
      carrierBaseUrl: carrierOrigin,
      tabId: originalTab.id!,
      formType: 'home',
      workflowName: 'Synthetic workflow',
    });
    const captured = await training.capture(started.training.trainingId, started.token, {
      revision: 0,
      observation,
    });
    const saved = await training.savePage(
      started.training.trainingId,
      captured.page.pageId,
      started.token,
      {
        revision: captured.training.revision,
        fields: captured.page.fields.map((field) => ({
          fieldId: field.fieldId,
          disposition: { kind: field.control.required ? 'human_required' : 'ignore' },
        })),
        workflowControls: captured.page.workflowControls.map((control) => ({
          workflowControlId: control.workflowControlId,
          decision: 'ignore',
        })),
      },
    );
    await worker.evaluate(
      async (session) => {
        await chrome.storage.session.set({
          miaToken: 'synthetic-token',
          principal: 'tenant/user',
          training: session,
        });
      },
      { training: saved.training, token: started.token, catalog, windowId: originalTab.windowId },
    );
    await original.close();
    const reopened = await context.newPage();
    await reopened.goto(`${carrierOrigin}/classic?step=1`);
    const browser = context.browser();
    if (!browser) throw new Error('synthetic_browser_missing');
    const client = await browser.newBrowserCDPSession();
    await activateToolbar(client, extensionId, reopened);
    const currentTabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!.id!,
    );
    expect(currentTabId).not.toBe(originalTab.id);
    const panelUrl = `chrome-extension://${extensionId}/sidepanel.html?tabId=${currentTabId}`;
    await expect.poll(() => panelText(client, panelUrl)).toContain('Connected to M.I.A.');
    expect(await clickPanelButton(client, panelUrl, 'Train')).toBe('clicked');
    await expect
      .poll(() => panelText(client, panelUrl))
      .toContain('Your saved work belongs to a previous tab');
    expect(await clickPanelButton(client, panelUrl, 'Find saved training and mappings')).toBe(
      'clicked',
    );
    await expect.poll(() => panelText(client, panelUrl)).toContain('Resume saved draft');
    expect(await clickPanelButton(client, panelUrl, 'Resume saved draft')).toBe('clicked');
    await expect
      .poll(() => panelText(client, panelUrl))
      .toContain('Saved draft resumed in this tab');
    const recovered = await worker.evaluate(
      async () =>
        (await chrome.storage.session.get('training')).training as {
          training: { binding: { tabId: number }; pages: unknown[] };
        },
    );
    expect(recovered.training.binding.tabId).toBe(currentTabId);
    expect(recovered.training.pages).toEqual(saved.training.pages);
    await expect(reopened.locator('#smartmapper-training-overlay button')).toHaveCount(
      saved.page.fields.length + saved.page.workflowControls.length,
    );
    expect(await clickPanelButton(client, panelUrl, 'Mapping complete')).toBe('clicked');
    await expect.poll(() => panelText(client, panelUrl)).toMatch(/Mapping version 1: testable/i);
    expect(await clickPanelButton(client, panelUrl, 'Find saved training and mappings')).toBe(
      'clicked',
    );
    await expect
      .poll(() => panelText(client, panelUrl))
      .toContain('Open saved mapping for testing');
    expect(await clickPanelButton(client, panelUrl, 'Open saved mapping for testing')).toBe(
      'clicked',
    );
    await expect.poll(() => panelText(client, panelUrl)).toContain('Saved mapping opened');
    const reference = await context.newPage();
    await reference.goto(`chrome-extension://${extensionId}/reference.html?tabId=${currentTabId}`);
    await expect(reference.getByText('Mapping version 1: testable', { exact: true })).toBeVisible();
    await reference.getByRole('button', { name: 'Test this mapping', exact: true }).click();
    await expect.poll(() => panelText(client, panelUrl)).toContain('Test mode: mapping version 1');
    expect((await training.read(started.training.trainingId, started.token)).binding.tabId).toBe(
      originalTab.id,
    );
    await reopened.goto(`${carrierOrigin}/classic?step=3`);
    await expect(reopened.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
    await closeServer(api);
    await closeServer(mia);
  }
});

test('a toolbar action opens the panel on its carrier tab without backend access', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const context = await chromium.launchPersistentContext(testInfo.outputPath('panel-profile'), {
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
    const extensionId = new URL(worker.url()).hostname;
    await expect
      .poll(() => worker.evaluate(() => chrome.action.onClicked.hasListeners()))
      .toBe(true);
    const carrier = await context.newPage();
    await carrier.goto('http://127.0.0.1:4173/classic?step=3');
    await expect(carrier.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
    const browser = context.browser();
    if (!browser) throw new Error('synthetic_browser_missing');
    const browserClient = await browser.newBrowserCDPSession();
    await activateToolbar(browserClient, extensionId, carrier);
    await expect
      .poll(() =>
        worker.evaluate(async () =>
          (await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })).map(
            (panel) => panel.documentUrl,
          ),
        ),
      )
      .toHaveLength(1);
    const first = await worker.evaluate(
      async () =>
        (await chrome.storage.session.get('panelTab')).panelTab as {
          tabId: number;
          origin: string;
        },
    );
    expect(first.origin).toBe('http://127.0.0.1:4173');
    const documentUrl = `chrome-extension://${extensionId}/sidepanel.html?tabId=${first.tabId}`;
    await expect
      .poll(() => panelText(browserClient, documentUrl))
      .toContain(`Version ${extensionPackage.version}`);
    const text = await panelText(browserClient, documentUrl);
    expect(text).toContain('Map');
    expect(text).toContain('Train');
    expect(await worker.evaluate(() => chrome.sidePanel.getOptions({}))).toMatchObject({
      enabled: false,
    });

    const secondCarrier = await context.newPage();
    await secondCarrier.goto('http://127.0.0.1:4173/modern?step=3');
    const secondTabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id,
    );
    if (secondTabId === undefined) throw new Error('synthetic_active_tab_missing');
    expect(
      await worker.evaluate((tabId) => chrome.sidePanel.getOptions({ tabId }), secondTabId),
    ).toMatchObject({ enabled: false });
    await activateToolbar(browserClient, extensionId, secondCarrier);
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          const { panelTab } = await chrome.storage.session.get('panelTab');
          return (panelTab as { tabId?: number } | undefined)?.tabId;
        }),
      )
      .toBe(secondTabId);
    expect(
      await worker.evaluate((tabId) => chrome.sidePanel.getOptions({ tabId }), first.tabId),
    ).toMatchObject({ enabled: false });
    await expect
      .poll(() =>
        panelText(
          browserClient,
          `chrome-extension://${extensionId}/sidepanel.html?tabId=${secondTabId}`,
        ),
      )
      .toContain(`Version ${extensionPackage.version}`);

    // A different hostname on the same synthetic server counts as a site change.
    await secondCarrier.goto('http://localhost:4173/classic?step=3');
    await expect
      .poll(() =>
        worker.evaluate(async () => (await chrome.storage.session.get('panelTab')).panelTab),
      )
      .toBeUndefined();
    expect(
      await worker.evaluate((tabId) => chrome.sidePanel.getOptions({ tabId }), secondTabId),
    ).toMatchObject({ enabled: false });
    await expect(carrier.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
    await expect(secondCarrier.locator('#mock-final-submit')).toHaveAttribute(
      'data-clicked',
      'false',
    );
  } finally {
    await context.close();
  }
});

test('pauses partial training, fills with review overlays, resumes edits and tests again', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  test.setTimeout(120_000);
  const context = await chromium.launchPersistentContext(
    testInfo.outputPath('preview-panel-profile'),
    {
      headless: true,
      channel: 'chromium',
      args: [
        '--enable-unsafe-extension-debugging',
        '--disable-extensions-except=' + extensionPath,
        '--load-extension=' + extensionPath,
      ],
    },
  );
  let api: Server | undefined;
  let mia: Server | undefined;
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).hostname;
    const carrierOrigin = 'http://127.0.0.1:4173';
    const miaOrigin = 'http://127.0.0.1:5198';
    const catalog: MiaFieldCatalog = {
      version: '2.0',
      schemaRevision: 'preview-home',
      formType: 'home',
      entityLimits: [
        {
          key: 'applicants',
          entityType: 'applicant',
          sourcePattern: 'applicant*',
          minimumCount: 1,
          maximumCount: 2,
          sourceIndexBase: 1,
        },
      ],
      templates: [],
      fields: ['firstName', 'lastName'].map((name) => ({
        fieldId: name,
        sourcePath: 'applicant.' + name,
        sourcePattern: 'applicant.' + name,
        question: name === 'firstName' ? 'Applicant first name' : 'Applicant last name',
        section: 'Applicant',
        context: [],
        options: [],
        conditions: [],
        conditionalReview: false,
        dataType: 'text',
        entity: null,
      })),
    };
    const source: SourceAnswers = {
      version: '2.0',
      tenantId: 'tenant',
      userId: 'user',
      quoteId: 'synthetic',
      formType: 'home',
      revision: 'r1',
      unavailablePaths: [],
      answers: catalog.fields.map((field, index) => ({
        answerId: field.fieldId,
        questionId: field.fieldId,
        sourcePath: field.sourcePath,
        question: field.question,
        section: field.section,
        entity: '',
        context: [],
        options: [],
        dataType: 'text',
        status: 'answered',
        value: index ? 'Sample' : 'Jordan',
      })),
    };
    const jobs = new MemoryCheckpointStore();
    const registry = new MemoryMappingRegistryStore();
    const access = {
      miaOrigins: new Set([miaOrigin]),
      carrierOrigins: new Set([carrierOrigin]),
      principals: new Set(['tenant/user']),
      autoNext: true,
    };
    const binding = (tabId: number) => ({
      tenantId: 'tenant',
      userId: 'user',
      carrierOrigin,
      tabId,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const training = new TrainingService(
      new MemoryTrainingSessionStore(),
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0',
            binding: { ...binding(request.tabId), formType: 'home' },
            catalog,
          }),
      },
      registry,
      access,
      jobs,
    );
    const runtime = new ActiveTabJobService(
      jobs,
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0',
            binding: { ...binding(request.tabId), quoteId: source.quoteId },
            sourceToken: 's'.repeat(43),
            source,
          }),
        read: () => Promise.resolve(source),
        revoke: () => Promise.resolve(),
      },
      registry,
      access,
    );
    api = createApi(
      runtime,
      new Set([`chrome-extension://${extensionId}`]),
      () => undefined,
      30_000,
      training,
    );
    await listen(api, 5199);
    mia = createServer((request, response) => {
      response.setHeader('Access-Control-Allow-Origin', `chrome-extension://${extensionId}`);
      response.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      if (request.method === 'OPTIONS') {
        response.writeHead(204).end();
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/extension/smartmapper/v2/catalog/home')
        response.end(JSON.stringify(catalog));
      else if (request.url?.endsWith('/grants'))
        response.end(JSON.stringify({ code: 'g'.repeat(32) }));
      else if (request.url?.startsWith('/api/extension/quotes/search'))
        response.end(
          JSON.stringify({
            results: [
              {
                id: 'synthetic',
                client_name: 'Jordan Sample',
                quote_number: 'SYNTHETIC',
                form_type: 'home',
              },
            ],
          }),
        );
      else response.writeHead(404).end(JSON.stringify({ error: 'not_found' }));
    });
    await listen(mia, 5198);
    await worker.evaluate(() =>
      chrome.storage.session.set({ miaToken: 'synthetic-token', principal: 'tenant/user' }),
    );
    const carrier = await context.newPage();
    await carrier.goto(`${carrierOrigin}/classic?step=1`);
    await carrier.evaluate(() => {
      const form = document.getElementById('classic-risk-form')!;
      const optional = document.createElement('label');
      optional.textContent = 'Optional salutation';
      optional.appendChild(document.createElement('input'));
      form.appendChild(optional);
      const human = document.createElement('label');
      human.textContent = 'Named insured';
      const person = document.createElement('select');
      person.setAttribute('aria-label', 'Named insured');
      person.add(new Option('Choose a person', ''));
      person.add(new Option('Jordan Sample', 'CUSTOMER-000012345678'));
      human.appendChild(person);
      form.appendChild(human);
    });
    const browser = context.browser();
    if (!browser) throw new Error('synthetic_browser_missing');
    const client = await browser.newBrowserCDPSession();
    await activateToolbar(client, extensionId, carrier);
    const tabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!.id!,
    );
    const panelUrl = `chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`;
    const text = () => panelText(client, panelUrl);
    const click = (label: string) => clickPanelButton(client, panelUrl, label);
    const saved = () =>
      worker.evaluate(
        async () =>
          (await chrome.storage.session.get('training')).training as {
            training: TrainingSessionView;
            token: string;
            activePageId?: string;
          },
      );
    await expect.poll(text).toContain('Connected to M.I.A.');
    expect(await click('Train')).toBe('clicked');
    await expect.poll(text).toContain('Start training and capture this page');
    expect(await click('Start training and capture this page')).toBe('clicked');
    await expect.poll(text).toContain('Pause training & test');
    await expect.poll(async () => (await saved()).training.pages.length).toBe(1);
    const original = await saved();
    const firstPage = original.training.pages[0]!;
    const firstField = firstPage.fields[0]!;
    const secondField = firstPage.fields[1]!;
    const optionalField = firstPage.fields.at(-2)!;
    const humanField = firstPage.fields.at(-1)!;
    expect(optionalField.control.required).toBe(false);
    expect(optionalField.control.humanOnly).toBe(false);
    expect(humanField.control.humanOnly).toBe(true);
    expect(humanField.control.options).toEqual([]);
    const switchState = (fieldId: string) =>
      panelText(
        client,
        panelUrl,
        `document.querySelector('#training-field-${fieldId} [role="switch"]').getAttribute('aria-checked')`,
      );
    const toggleIgnore = (fieldId: string) =>
      panelText(
        client,
        panelUrl,
        `(() => {
          const toggle = document.querySelector('#training-field-${fieldId} [role="switch"]');
          if (toggle.disabled) return 'disabled';
          toggle.click(); return 'clicked';
        })()`,
      );
    const optionalDisposition = async () =>
      (await saved()).training.pages[0]!.fields.find(
        (field) => field.fieldId === optionalField.fieldId,
      )!.disposition;
    // Ignore works on a collapsed card, saves durably, and cannot bypass protected fields.
    expect(await toggleIgnore(firstField.fieldId)).toBe('disabled');
    expect(await toggleIgnore(humanField.fieldId)).toBe('disabled');
    expect(await toggleIgnore(optionalField.fieldId)).toBe('clicked');
    await expect.poll(() => switchState(optionalField.fieldId)).toBe('true');
    await expect.poll(optionalDisposition).toEqual({ kind: 'ignore' });
    expect(
      await panelText(
        client,
        panelUrl,
        `document.querySelector('#training-field-${optionalField.fieldId} .field-heading').getAttribute('aria-expanded')`,
      ),
    ).toBe('false');
    // Exercise the real React mapping editor, including its save-before-test behavior.
    const chooseKind = async (fieldId: string, kind: string) => {
      await panelText(
        client,
        panelUrl,
        `(() => {
        const row = document.getElementById('training-field-' + ${JSON.stringify(fieldId)});
        const heading = row.querySelector('.field-heading');
        if (heading.getAttribute('aria-expanded') !== 'true') heading.click(); return 'opened';
      })()`,
      );
      await expect
        .poll(() =>
          panelText(
            client,
            panelUrl,
            `String(!!document.querySelector('#training-field-${fieldId} .disposition-editor select'))`,
          ),
        )
        .toBe('true');
      await panelText(
        client,
        panelUrl,
        `(() => { const select = document.querySelector('#training-field-${fieldId} .disposition-editor select'); select.value = ${JSON.stringify(kind)}; select.dispatchEvent(new Event('change', { bubbles: true })); return 'changed'; })()`,
      );
    };
    // The switch and existing editor share one disposition; off restores Missing mapping.
    await chooseKind(optionalField.fieldId, 'leave_blank');
    await expect.poll(() => switchState(optionalField.fieldId)).toBe('false');
    await chooseKind(optionalField.fieldId, 'ignore');
    await expect.poll(() => switchState(optionalField.fieldId)).toBe('true');
    await expect.poll(() => toggleIgnore(optionalField.fieldId)).toBe('clicked');
    await expect.poll(optionalDisposition).toBeNull();
    expect(
      await panelText(
        client,
        panelUrl,
        `document.querySelector('#training-field-${optionalField.fieldId} .disposition-editor select').value`,
      ),
    ).toBe('');
    await chooseKind(firstField.fieldId, 'source');
    await expect.poll(() => click('Pause training & test')).toBe('clicked');
    await expect.poll(text).toContain('Training paused');
    await panelText(
      client,
      panelUrl,
      `(() => { const input = document.getElementById('quote-search'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Jordan'); input.dispatchEvent(new Event('input', { bubbles: true })); return 'changed'; })()`,
    );
    expect(await click('Search')).toBe('clicked');
    await expect.poll(text).toContain('Jordan Sample');
    // A registry startup rejection must explain the failure before touching carrier inputs.
    const registryGet = registry.get.bind(registry);
    registry.get = () => Promise.resolve(null);
    expect(await click('Test prefill on this page')).toBe('clicked');
    await expect.poll(text).toContain('create a fresh preview');
    await expect(carrier.getByLabel('Applicant first name', { exact: true })).toHaveValue('');
    expect(await click('Copy diagnostics')).toBe('clicked');
    await expect
      .poll(() =>
        panelText(
          client,
          panelUrl,
          `document.querySelector('textarea[aria-label="Diagnostic report"]')?.value ?? ''`,
        ),
      )
      .toContain('mapping_selection_unavailable');
    registry.get = registryGet;
    expect(await click('Test prefill on this page')).toBe('clicked');
    await expect(carrier.getByLabel('Applicant first name', { exact: true })).toHaveValue('Jordan');
    await expect.poll(text).toMatch(/Missing fields and exceptions/i);
    await expect(carrier.getByLabel('Named insured', { exact: true })).toHaveValue('');
    await expect(carrier.locator('#smartmapper-training-overlay button')).not.toHaveCount(0);
    await expect
      .poll(() =>
        panelText(
          client,
          panelUrl,
          `String(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Resume training')?.disabled)`,
        ),
      )
      .toBe('false');
    expect(carrier.url()).toContain('step=1');
    // Simulate another request advancing the server revision before this panel resumes.
    const stale = await worker.evaluate(
      async () =>
        (await chrome.storage.session.get('job')).job as { job: { jobId: string }; token: string },
    );
    await runtime.pause(stale.job.jobId, stale.token);
    expect(await click('Resume mapping')).toBe('clicked');
    await expect
      .poll(() =>
        panelText(
          client,
          panelUrl,
          `String(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Resume training')?.disabled)`,
        ),
      )
      .toBe('false');
    expect(await text()).not.toContain('The page or job changed');
    const firstSnapshot = (
      await registry.list({ tenantId: 'tenant', carrierOrigin, lineOfBusiness: 'home' })
    )[0]!;
    expect(firstSnapshot.status).toBe('preview');
    expect(firstSnapshot.pages[0]!.fields).toHaveLength(2);
    expect(await click('Resume training')).toBe('clicked');
    await expect.poll(text).toContain('Last page test: 1 verified');
    expect((await saved()).training.trainingId).toBe(original.training.trainingId);
    expect((await saved()).training.status).toBe('draft');
    await expect(carrier.getByLabel('Applicant first name', { exact: true })).toHaveValue('Jordan');
    await chooseKind(secondField.fieldId, 'source');
    await expect
      .poll(() =>
        panelText(
          client,
          panelUrl,
          `String(!!document.querySelector('#training-field-${secondField.fieldId} .source-editor select'))`,
        ),
      )
      .toBe('true');
    await panelText(
      client,
      panelUrl,
      `(() => { const select = document.querySelector('#training-field-${secondField.fieldId} .source-editor select'); select.value = 'lastName'; select.dispatchEvent(new Event('change', { bubbles: true })); return 'changed'; })()`,
    );
    await expect.poll(() => click('Pause training & test')).toBe('clicked');
    await expect.poll(text).toContain('Test prefill on this page');
    // Prove both entries run while unassigned-field overlays remain visible.
    await carrier.getByLabel('Applicant first name', { exact: true }).fill('');
    expect(await click('Test prefill on this page')).toBe('clicked');
    await expect(carrier.getByLabel('Applicant first name', { exact: true })).toHaveValue('Jordan');
    await expect(carrier.getByLabel('Applicant last name', { exact: true })).toHaveValue('Sample');
    await expect
      .poll(() =>
        panelText(
          client,
          panelUrl,
          `String(Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Resume training')?.disabled)`,
        ),
      )
      .toBe('false');
    expect(await click('Copy diagnostics')).toBe('clicked');
    await expect
      .poll(() =>
        panelText(
          client,
          panelUrl,
          `String(!!document.querySelector('textarea[aria-label="Diagnostic report"]'))`,
        ),
      )
      .toBe('true');
    const report = JSON.parse(
      await panelText(
        client,
        panelUrl,
        `document.querySelector('textarea[aria-label="Diagnostic report"]').value`,
      ),
    ) as { events: Array<{ receiptStatus?: string; receiptReason?: string }> };
    expect(
      report.events.filter((event) => event.receiptStatus === 'verified').length,
    ).toBeGreaterThanOrEqual(2);
    expect(report.events.some((event) => event.receiptReason === 'page_changed')).toBe(false);
    expect(JSON.stringify(report)).not.toContain('Jordan');
    expect(await click('Resume training')).toBe('clicked');
    await expect.poll(text).toContain('Last page test: 2 verified');
    expect((await saved()).training.pages[0]!.fields[1]!.disposition).toMatchObject({
      references: [{ sourcePath: 'applicant.lastName' }],
    });
    expect(
      (await registry.get(
        { tenantId: 'tenant', carrierOrigin, lineOfBusiness: 'home' },
        firstSnapshot.mappingId,
        1,
      ))!.pages[0]!.fields,
    ).toHaveLength(2);
    await carrier.goto(`${carrierOrigin}/classic?step=2`);
    await expect
      .poll(async () => (await saved()).training.pages.length, { timeout: 12000 })
      .toBe(2);
    const pages = (await saved()).training.pages;
    expect(pages[1]!.fields[0]!.sequence).toBeGreaterThan(pages[0]!.fields.at(-1)!.sequence);
    // New conditional fields appear automatically during ordinary training, without recapture.
    await carrier.evaluate(() => {
      const section = document.createElement('fieldset');
      section.id = 'recorded-section';
      section.innerHTML =
        '<legend>Additional applicant</legend><label>Applicant first name<input id="recorded-first" name="recordedFirst" /></label><label>Optional reference note<input id="recorded-note" /></label>';
      document.body.appendChild(section);
    });
    await expect
      .poll(async () => (await saved()).training.pages.length, { timeout: 12000 })
      .toBe(3);
    const recorded = (await saved()).training.pages[2]!;
    const nextNumber =
      Math.max(
        ...pages.flatMap((page) => [
          ...page.fields.map((field) => field.sequence),
          ...page.workflowControls.map((control) => control.sequence),
        ]),
      ) + 1;
    for (const existing of pages[1]!.fields) {
      expect(
        recorded.fields.find((field) => field.sequence === existing.sequence)?.disposition,
      ).toEqual(existing.disposition);
    }
    const recordedFirst = recorded.fields.find(
      (field) => field.control.reference?.label === 'Applicant first name',
    )!;
    const recordedNote = recorded.fields.find(
      (field) => field.control.reference?.label === 'Optional reference note',
    )!;
    expect(recordedFirst.control.locatorHints?.name).toMatch(/^[a-f0-9]{64}$/);
    expect([recordedFirst.sequence, recordedNote.sequence]).toEqual([nextNumber, nextNumber + 1]);
    await expect(
      carrier.locator(
        `#smartmapper-training-overlay button[data-smartmapper-field-id="${recordedFirst.fieldId}"]`,
      ),
    ).toHaveText(String(nextNumber));
    // Hide and reveal the same section: neither numbers nor captured states should duplicate.
    await carrier.locator('#recorded-section').evaluate((section) => {
      (section as HTMLElement).style.display = 'none';
    });
    await expect(carrier.locator('#recorded-section')).toBeHidden();
    await expect
      .poll(async () => (await saved()).activePageId, { timeout: 12000 })
      .toBe(pages[1]!.pageId);
    await carrier.locator('#recorded-section').evaluate((section) => {
      (section as HTMLElement).style.removeProperty('display');
    });
    await expect(carrier.locator('#recorded-section')).toBeVisible();
    await expect
      .poll(async () => (await saved()).activePageId, { timeout: 12000 })
      .toBe(recorded.pageId);
    expect((await saved()).training.pages).toHaveLength(3);
    expect(await click('Continue recording')).toBe('clicked');
    await expect.poll(text).toContain('Recording page structure');
    const referenceOpened = context.waitForEvent('page');
    expect(await click('Stop recording & annotate')).toBe('clicked');
    const reference = await referenceOpened;
    await reference.waitForURL('**/reference.html?*');
    await expect(
      reference.getByRole('heading', { name: 'Know the page. Map it once.' }),
    ).toBeVisible();
    const referenceCard = reference.locator(`#training-field-${recordedFirst.fieldId}`);
    await referenceCard.locator('.disposition-editor select').first().selectOption('source');
    await reference
      .getByRole('switch', { name: `Ignore field ${recordedNote.sequence}`, exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await saved()).training.pages[2]!.fields.find(
            (field) => field.fieldId === recordedNote.fieldId,
          )!.disposition,
      )
      .toEqual({ kind: 'ignore' });
    await reference.reload();
    await expect(referenceCard.getByLabel('Available M.I.A. field')).toHaveValue('firstName');
    await expect(
      reference.getByRole('switch', { name: `Ignore field ${recordedNote.sequence}`, exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await reference.screenshot({
      path: testInfo.outputPath('field-reference.png'),
      fullPage: true,
    });
    await carrier.evaluate(() => {
      const help = document.createElement('p');
      help.id = 'changed-help';
      help.textContent = 'Enter the first name as it appears on the application';
      document.body.appendChild(help);
      document.getElementById('recorded-first')!.setAttribute('aria-describedby', help.id);
    });
    await reference.getByRole('button', { name: 'Pause training & test', exact: true }).click();
    await expect.poll(text).toContain('Test prefill on this page');
    expect(await click('Test prefill on this page')).toBe('clicked');
    await expect(carrier.locator('#recorded-first')).toHaveValue('Jordan');
    await expect(carrier.locator('#recorded-note')).toHaveValue('');
    await expect.poll(() => click('Resume training')).toBe('clicked');
    await carrier.goto(`${carrierOrigin}/classic?step=3`);
    await expect(carrier.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
    await closeServer(api);
    await closeServer(mia);
  }
});
