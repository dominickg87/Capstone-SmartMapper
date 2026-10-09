import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type Worker } from '@playwright/test';
import { PageObservationSchema, type PageObservation } from '@smartmapper/contracts';
import { structuralTrainingObservation } from '../../apps/extension-prototype/src/training-observation.js';
import { MemoryCheckpointStore } from '../../apps/orchestrator-api/src/checkpoints.js';
import { MemoryMappingRegistryStore } from '../../apps/orchestrator-api/src/mapping-registry.js';
import {
  MemoryTrainingSessionStore,
  TrainingService,
} from '../../apps/orchestrator-api/src/training-service.js';

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

    // Operational-looking carrier labels must not make an otherwise valid page uncapturable.
    await carrier.locator('form').evaluate((form) => {
      const label = document.createElement('label');
      label.textContent = 'Demo Agent Code:*';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = 'SYNTHETIC-AGENCY';
      label.append(input);
      form.prepend(label);
    });

    const tabId = await tabIdFor(worker, '/classic');
    const page = await observe(worker, tabId);
    const radioControls = page.controls.filter(
      (control) => control.inputType === 'radio' && control.choiceGroup,
    );
    expect(radioControls).toHaveLength(2);
    expect(new Set(radioControls.map((control) => control.choiceGroup?.key)).size).toBe(1);

    const service = new TrainingService(
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
            catalog: {
              version: '2.0',
              schemaRevision: 'synthetic-home',
              formType: 'home',
              entityLimits: [],
              templates: [],
              fields: [],
            },
          }),
      },
      new MemoryMappingRegistryStore(),
      {
        miaOrigins: new Set(['https://mia.test']),
        carrierOrigins: new Set([carrierOrigin]),
        principals: new Set(['tenant/user']),
      },
      new MemoryCheckpointStore(),
    );
    const started = await service.start({
      miaOrigin: 'https://mia.test',
      code: 'c'.repeat(32),
      verifier: 'v'.repeat(43),
      carrierOrigin,
      carrierBaseUrl: carrierOrigin,
      tabId,
      formType: 'home',
      workflowName: 'Synthetic workflow',
    });
    const structural = await structuralTrainingObservation(page);
    const operational = page.controls.find((control) => control.label === 'Demo Agent Code:*');
    expect(operational).toBeDefined();
    expect(
      structural.controls.find((control) => control.elementId === operational!.elementId)
        ?.operationalTarget,
    ).toBeNull();
    const captured = await service.capture(started.training.trainingId, started.token, {
      revision: started.training.revision,
      observation: structural,
    });
    expect(captured.training).toMatchObject({ revision: 1, status: 'draft' });
    expect(captured.page.fields).toHaveLength(6);
    expect(
      captured.page.fields.find((field) => field.control.elementId === operational!.elementId),
    ).toBeDefined();
    expect(JSON.stringify(captured.training)).not.toContain('SYNTHETIC-AGENCY');
    expect(JSON.stringify(captured.training)).not.toContain('Demo Agent Code');
    // Capturing the field is allowed; assigning an unrecognized operational default remains denied.
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: captured.page.fields.find(
              (field) => field.control.elementId === operational!.elementId,
            )!.fieldId,
            disposition: { kind: 'carrier_default' },
          },
        ],
        workflowControls: [],
      }),
    ).rejects.toMatchObject({ code: 'unsafe_mapping_disposition' });

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

    // A carrier can scroll a panel independently of the document. Badges must use the live
    // target geometry, disappear outside that panel's clip, and follow subsequent layout shifts.
    await carrier.addStyleTag({ content: 'button { display: inline-block; }' });
    await carrier
      .locator('input[type="radio"]')
      .first()
      .evaluate((target) => {
        const box = document.createElement('div');
        box.id = 'synthetic-scroll-box';
        box.style.cssText = 'height:240px;width:400px;overflow:auto;margin:60px 0;border:2px solid';
        const inner = document.createElement('div');
        inner.style.cssText =
          'height:1200px;width:900px;padding:320px 100px 0;box-sizing:border-box';
        const label = document.createElement('label');
        label.id = 'moving-target';
        label.style.display = 'block';
        label.append(target);
        inner.append(label);
        box.append(inner);
        document.body.append(box);
        document.body.style.minHeight = '2600px';
        box.scrollIntoView({ block: 'center' });
      });
    const alignment = () =>
      carrier.evaluate(() => {
        const target = document.querySelector('#moving-target input')!.getBoundingClientRect();
        const outline = document.querySelector<HTMLElement>('#smartmapper-training-overlay > div')!;
        const bounds = outline.getBoundingClientRect();
        return (
          !outline.hidden &&
          Math.abs(bounds.left - target.left + 4) < 1 &&
          Math.abs(bounds.top - target.top + 4) < 1
        );
      });
    await expect(overlay.locator('button')).toBeHidden();
    await carrier.locator('#synthetic-scroll-box').evaluate((box) => {
      box.scrollTop = 200;
      box.scrollLeft = 40;
    });
    await expect.poll(alignment).toBe(true);
    await carrier.evaluate(() => window.scrollBy(0, 35));
    await expect.poll(alignment).toBe(true);
    await carrier.locator('#moving-target').evaluate((label) => {
      (label as HTMLElement).style.marginTop = '25px';
    });
    await expect.poll(alignment).toBe(true);
    await carrier.locator('#synthetic-scroll-box').evaluate((box) => {
      box.scrollTop = 900;
    });
    await expect(overlay.locator('button')).toBeHidden();
    await worker.evaluate(async (id) => {
      await chrome.tabs.sendMessage(id, {
        type: 'focus-training-field',
        fieldId: 'synthetic-radio-group',
      });
    }, tabId);
    await expect.poll(alignment).toBe(true);

    await carrier.goto(carrierOrigin + '/classic?step=3');
    await expect(carrier.getByRole('heading', { name: 'Review worksheet' })).toBeVisible();
    const reviewTabId = await tabIdFor(worker, '/classic');
    await observe(worker, reviewTabId);
    await expect(carrier.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
  } finally {
    await context.close();
  }
});
