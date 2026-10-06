import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type Worker } from '@playwright/test';
import { PageObservationSchema, type PageObservation } from '@smartmapper/contracts';

const carrierOrigin = 'http://127.0.0.1:4173';
const extensionPath = resolve('.tools/e2e-training-extension');
const metadata = JSON.parse(
  readFileSync(resolve('apps/extension-prototype/package.json'), 'utf8'),
) as { version: string };

test.beforeAll(() => {
  const vite = resolve('node_modules/vite/bin/vite.js');
  const cwd = resolve('apps/extension-prototype');
  const env = {
    ...process.env,
    VITE_SMARTMAPPER_BACKEND_ORIGIN: 'http://127.0.0.1:5199',
    VITE_SMARTMAPPER_MIA_ORIGIN: 'http://127.0.0.1:5198',
    VITE_SMARTMAPPER_CARRIER_ORIGINS: carrierOrigin,
    VITE_SMARTMAPPER_ALLOW_ANY_CARRIER: 'false',
  };
  execFileSync(process.execPath, [vite, 'build', '--outDir', extensionPath, '--emptyOutDir'], {
    cwd,
    env,
    stdio: 'pipe',
  });
  execFileSync(
    process.execPath,
    [vite, 'build', '--config', 'vite.content.config.ts', '--outDir', extensionPath],
    { cwd, env, stdio: 'pipe' },
  );
  const manifest = JSON.parse(readFileSync(resolve(extensionPath, 'manifest.json'), 'utf8')) as {
    version: string;
  };
  expect(manifest.version).toBe(metadata.version);
});

async function tabIdFor(worker: Worker, path: string): Promise<number> {
  return await worker.evaluate(async (expectedPath) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((item) => {
      if (!item.url) return false;
      const url = new URL(item.url);
      return url.origin === 'http://127.0.0.1:4173' && url.pathname === expectedPath;
    });
    if (tab?.id === undefined) throw new Error('synthetic_carrier_tab_missing');
    return tab.id;
  }, path);
}

async function observe(worker: Worker, tabId: number): Promise<PageObservation> {
  const serialized = await worker.evaluate(async (id) => {
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(id, { type: 'prepare-survey', tabId: id });
    return JSON.stringify(
      await chrome.tabs.sendMessage(id, {
        type: 'finish-survey',
        tabId: id,
        complete: true,
        targeted: true,
      }),
    );
  }, tabId);
  const result: unknown = JSON.parse(serialized);
  return PageObservationSchema.parse(result);
}

test('training observes one logical radio group, shows a numbered marker, and never clicks final submit', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const context = await chromium.launchPersistentContext(testInfo.outputPath('training-profile'), {
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
    const carrier = await context.newPage();
    await carrier.goto(carrierOrigin + '/classic?step=1');
    await expect(carrier.getByRole('heading', { name: 'Risk worksheet' })).toBeVisible();

    const tabId = await tabIdFor(worker, '/classic');
    const page = await observe(worker, tabId);
    const radioControls = page.controls.filter(
      (control) => control.inputType === 'radio' && control.choiceGroup,
    );
    expect(radioControls).toHaveLength(2);
    expect(new Set(radioControls.map((control) => control.choiceGroup?.key)).size).toBe(1);

    const anchor = radioControls[0]!;
    await worker.evaluate(
      async ({ id, elementId, rect, label }) => {
        await chrome.tabs.sendMessage(id, {
          type: 'show-training-overlay',
          markers: [
            {
              fieldId: 'synthetic-radio-group',
              number: 123,
              label,
              control: { elementId, rect },
              state: 'unmapped',
            },
          ],
        });
      },
      {
        id: tabId,
        elementId: anchor.elementId,
        rect: anchor.rect,
        label: anchor.choiceGroup!.label,
      },
    );

    const overlay = carrier.locator('#smartmapper-training-overlay');
    await expect(overlay).toHaveAttribute('role', 'group');
    await expect(overlay).not.toHaveAttribute('aria-hidden', 'true');
    await expect(overlay.locator('button')).toHaveCount(1);
    await expect(overlay.getByRole('button', { name: /field 123/i })).toHaveText('123');

    await carrier.goto(carrierOrigin + '/classic?step=3');
    await expect(carrier.getByRole('heading', { name: 'Review worksheet' })).toBeVisible();
    const reviewTabId = await tabIdFor(worker, '/classic');
    await observe(worker, reviewTabId);
    await expect(carrier.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});
