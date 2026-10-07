import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, type Server } from 'node:http';
import { chromium, expect, test, type CDPSession, type Page } from '@playwright/test';
import { PageObservationSchema, type MiaFieldCatalog } from '@smartmapper/contracts';
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
    expect(await clickPanelButton(client, panelUrl, 'Test this mapping')).toBe('clicked');
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
