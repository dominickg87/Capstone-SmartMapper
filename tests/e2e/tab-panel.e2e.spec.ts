import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type CDPSession, type Page } from '@playwright/test';

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
async function panelText(client: CDPSession, documentUrl: string): Promise<string> {
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
            params: { expression: 'document.body.innerText', returnByValue: true },
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
