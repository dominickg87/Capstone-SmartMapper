import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, expect, test, type Page, type Worker } from '@playwright/test';
import { valueDigest } from '@smartmapper/automation-core/active-tab';
import {
  ActionReceiptSchema,
  PageObservationSchema,
  type ActionBatch,
  type JobView,
  type MappingDisposition,
  type MiaCatalogField,
  type MiaFieldCatalog,
  type PageObservation,
  type SourceAnswers,
  type TrainingField,
  type TrainingPage,
} from '@smartmapper/contracts';
import { structuralTrainingObservation } from '../../apps/extension-prototype/src/training-observation.js';
import { ActiveTabJobService } from '../../apps/orchestrator-api/src/active-tab-service.js';
import { MemoryCheckpointStore } from '../../apps/orchestrator-api/src/checkpoints.js';
import { MemoryMappingRegistryStore } from '../../apps/orchestrator-api/src/mapping-registry.js';
import {
  MemoryTrainingSessionStore,
  TrainingService,
} from '../../apps/orchestrator-api/src/training-service.js';

const carrierOrigin = 'http://127.0.0.1:4173';
const miaOrigin = 'https://mia.test';
const extensionPath = resolve('.tools/e2e-registry-extension');

const catalogFieldSeeds: Array<
  readonly [sourcePath: string, question: string, dataType: MiaCatalogField['dataType']]
> = [
  ['applicant1.firstName', 'Applicant first name', 'text'],
  ['applicant1.lastName', 'Applicant last name', 'text'],
  ['applicant1.phone', 'Contact phone', 'text'],
  ['property.yearBuilt', 'Year built', 'number'],
  ['policy.currentlyInsured', 'Current insurance status', 'boolean'],
  ['drivers.0.firstName', 'Driver given name', 'text'],
  ['vehicles.0.make', 'Auto make', 'text'],
];

const catalogFields: MiaCatalogField[] = catalogFieldSeeds.map(
  ([sourcePath, question, dataType], index) => ({
    fieldId: `mia:home:e2e:${index}`,
    sourcePath,
    sourcePattern: sourcePath,
    question,
    section: index < 5 ? 'Risk worksheet' : 'Listed drivers and autos',
    context: [],
    options:
      dataType === 'boolean'
        ? [
            { value: true, label: 'Yes' },
            { value: false, label: 'No' },
          ]
        : [],
    conditions: [],
    conditionalReview: false,
    dataType,
    entity: null,
  }),
);

const catalog: MiaFieldCatalog = {
  version: '2.0',
  schemaRevision: 'home-registry-e2e-1',
  formType: 'home',
  entityLimits: [],
  templates: [],
  fields: catalogFields,
};

const source: SourceAnswers = {
  version: '2.0',
  tenantId: 'tenant',
  userId: 'user',
  quoteId: 'synthetic-registry-e2e',
  formType: 'home',
  revision: 'source-registry-e2e-1',
  answers: [
    ['applicant1.firstName', 'Jordan', 'text'],
    ['applicant1.lastName', 'Smartmapper', 'text'],
    ['applicant1.phone', '504-555-1212', 'text'],
    ['property.yearBuilt', 1999, 'number'],
    ['policy.currentlyInsured', true, 'boolean'],
    ['drivers.0.firstName', 'Casey', 'text'],
    ['vehicles.0.make', 'Synthetic', 'text'],
  ].map(([sourcePath, value, dataType], index) => ({
    answerId: `answer-${index}`,
    questionId: `question-${index}`,
    sourcePath: String(sourcePath),
    question: catalogFields[index]!.question,
    section: catalogFields[index]!.section,
    entity: '',
    context: [],
    options: catalogFields[index]!.options,
    value: value as string | number | boolean,
    status: 'answered' as const,
    dataType: dataType as 'text' | 'number' | 'boolean',
  })),
  unavailablePaths: [],
};

function expectNoRawTrainingText(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const privateText of [
    'Jordan',
    'Smartmapper',
    '504-555-1212',
    'Casey',
    'Synthetic',
    'Applicant first name',
    'Applicant last name',
    'Contact phone',
    'Risk worksheet',
    'Current insurance status',
    'Yes, currently insured',
    'No current insurance',
    'Driver given name',
    'Listed drivers and autos',
    'Auto make',
    'Category A',
  ])
    expect(serialized).not.toContain(privateText);
  expect(serialized).not.toContain('"yes"');
  expect(serialized).not.toContain('"no"');
}

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
  const expected = JSON.parse(
    readFileSync(resolve('apps/extension-prototype/package.json'), 'utf8'),
  ) as { version: string };
  const manifest = JSON.parse(readFileSync(resolve(extensionPath, 'manifest.json'), 'utf8')) as {
    version: string;
  };
  expect(manifest.version).toBe(expected.version);
});

async function tabIdFor(worker: Worker): Promise<number> {
  return await worker.evaluate(async (origin) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((item) => item.url && new URL(item.url).origin === origin);
    if (tab?.id === undefined) throw new Error('synthetic_carrier_tab_missing');
    return tab.id;
  }, carrierOrigin);
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
        targeted: false,
      }),
    );
  }, tabId);
  return PageObservationSchema.parse(JSON.parse(serialized) as unknown);
}

async function execute(worker: Worker, tabId: number, batch: ActionBatch) {
  const serialized = await worker.evaluate(
    async ({ id, input }) =>
      JSON.stringify(await chrome.tabs.sendMessage(id, { type: 'execute', batch: input })),
    { id: tabId, input: batch },
  );
  return ActionReceiptSchema.parse(JSON.parse(serialized) as unknown);
}

function sourceDisposition(
  sourcePath: string,
  transform: Extract<MappingDisposition, { kind: 'source' }>['transform'] = {
    kind: 'identity',
  },
): MappingDisposition {
  return {
    kind: 'source',
    references: [{ binding: 'fixed', sourcePath, sourcePathPattern: sourcePath }],
    transform,
  };
}

function orderedFields(page: TrainingPage): TrainingField[] {
  return [...page.fields].sort((left, right) => left.sequence - right.sequence);
}

async function saveFirstPage(
  service: TrainingService,
  trainingId: string,
  token: string,
  page: TrainingPage,
  revision: number,
) {
  const fields = orderedFields(page);
  expect(fields).toHaveLength(5);
  const radio = fields.find(
    (field) => field.control.inputType === 'radio' || field.control.role === 'radio',
  );
  expect(radio?.control.options).toHaveLength(2);
  const text = fields.filter((field) => field.fieldId !== radio?.fieldId);
  expect(text.map((field) => field.control.inputType)).toEqual(['text', 'text', 'tel', 'number']);
  const byPath = [
    'applicant1.firstName',
    'applicant1.lastName',
    'applicant1.phone',
    'property.yearBuilt',
  ];
  const next = page.workflowControls.find((control) => control.kind === 'ordinary_next');
  expect(next).toBeDefined();
  return await service.savePage(trainingId, page.pageId, token, {
    revision,
    fields: [
      ...text.map((field, index) => ({
        fieldId: field.fieldId,
        disposition: sourceDisposition(byPath[index]!),
      })),
      {
        fieldId: radio!.fieldId,
        disposition: sourceDisposition('policy.currentlyInsured', {
          kind: 'boolean',
          trueValue: radio!.control.options[0]!.value,
          falseValue: radio!.control.options[1]!.value,
        }),
      },
    ],
    workflowControls: [{ workflowControlId: next!.workflowControlId, decision: 'use' as const }],
  });
}

async function saveSecondPage(
  service: TrainingService,
  trainingId: string,
  token: string,
  page: TrainingPage,
  revision: number,
) {
  const fields = orderedFields(page);
  expect(fields).toHaveLength(5);
  const next = page.workflowControls.find((control) => control.kind === 'ordinary_next');
  expect(next).toBeDefined();
  return await service.savePage(trainingId, page.pageId, token, {
    revision,
    fields: fields.map((field, index) => ({
      fieldId: field.fieldId,
      disposition:
        index === 0
          ? sourceDisposition('drivers.0.firstName')
          : index === 2
            ? sourceDisposition('vehicles.0.make')
            : ({ kind: 'leave_blank' } as const),
    })),
    workflowControls: [{ workflowControlId: next!.workflowControlId, decision: 'ignore' as const }],
  });
}

async function runCleanJob(
  service: ActiveTabJobService,
  worker: Worker,
  carrier: Page,
  tabId: number,
  mappingSelection?: { mappingId: string; mappingVersion: number },
): Promise<{ job: JobView; jobId: string; token: string }> {
  const started = await service.start({
    miaOrigin,
    code: 'c'.repeat(32),
    verifier: 'v'.repeat(43),
    carrierOrigin,
    carrierPageUrl: `${carrierOrigin}/classic`,
    tabId,
    ...(mappingSelection
      ? { mappingSelection: { mode: 'testable' as const, ...mappingSelection } }
      : {}),
  });
  let job = started.job;
  for (let pass = 0; pass < 12; pass += 1) {
    const page = await observe(worker, tabId);
    const planned = await service.observe(started.job.jobId, started.token, {
      revision: job.revision,
      resume: false,
      observation: page,
    });
    job = planned.job;
    if (!planned.batch) {
      expect(job.reviews).toEqual([]);
      expect(job.status).toBe('page_complete');
      return { job, jobId: started.job.jobId, token: started.token };
    }
    for (const batch of [planned.batch, ...(planned.followingBatches ?? [])]) {
      const receipt = await execute(worker, tabId, batch);
      job = await service.receipt(started.job.jobId, started.token, {
        revision: job.revision,
        batchId: batch.batchId,
        receipt,
      });
      if (batch.action.type === 'next_page') {
        expect(receipt).toMatchObject({ status: 'executed', reason: 'applied' });
        await carrier.waitForURL(/\/classic\?step=2$/);
        break;
      }
    }
  }
  throw new Error('registry_e2e_job_did_not_complete');
}

test('trains, proves, activates and reuses a registry mapping while preserving safe continuation', async ({
  browserName,
}, testInfo) => {
  test.setTimeout(120_000);
  expect(browserName).toBe('chromium');
  const context = await chromium.launchPersistentContext(testInfo.outputPath('registry-profile'), {
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
    let carrier = await context.newPage();
    await carrier.goto(`${carrierOrigin}/classic?step=1`);
    await expect(carrier.getByRole('heading', { name: 'Risk worksheet' })).toBeVisible();
    let tabId = await tabIdFor(worker);

    const checkpoints = new MemoryCheckpointStore();
    const registry = new MemoryMappingRegistryStore();
    const training = new TrainingService(
      new MemoryTrainingSessionStore(),
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0' as const,
            binding: {
              tenantId: 'tenant',
              userId: 'user',
              carrierOrigin,
              tabId: request.tabId,
              formType: 'home' as const,
              expiresAt: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
            },
            catalog,
          }),
      },
      registry,
      {
        miaOrigins: new Set([miaOrigin]),
        carrierOrigins: new Set([carrierOrigin]),
        principals: new Set(['tenant/user']),
        autoNext: true,
      },
      checkpoints,
    );
    const runtime = new ActiveTabJobService(
      checkpoints,
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0' as const,
            binding: {
              tenantId: 'tenant',
              userId: 'user',
              quoteId: source.quoteId,
              carrierOrigin,
              tabId: request.tabId,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
            sourceToken: 's'.repeat(43),
            source,
          }),
        read: () => Promise.resolve(source),
        revoke: () => Promise.resolve(),
      },
      registry,
      {
        miaOrigins: new Set([miaOrigin]),
        carrierOrigins: new Set([carrierOrigin]),
        principals: new Set(['tenant/user']),
        autoNext: true,
      },
    );

    const started = await training.start({
      miaOrigin,
      code: 't'.repeat(32),
      verifier: 'w'.repeat(43),
      carrierOrigin,
      carrierBaseUrl: carrierOrigin,
      tabId,
      formType: 'home',
      workflowName: 'Synthetic workflow',
    });
    const firstObservation = await structuralTrainingObservation(await observe(worker, tabId));
    expectNoRawTrainingText(firstObservation);
    const firstCapture = await training.capture(started.training.trainingId, started.token, {
      revision: started.training.revision,
      observation: firstObservation,
    });
    expectNoRawTrainingText(firstCapture.training);
    const firstSaved = await saveFirstPage(
      training,
      started.training.trainingId,
      started.token,
      firstCapture.page,
      firstCapture.training.revision,
    );

    await carrier.goto(`${carrierOrigin}/classic?step=2`);
    const secondObservation = await structuralTrainingObservation(await observe(worker, tabId));
    const secondCapture = await training.capture(started.training.trainingId, started.token, {
      revision: firstSaved.training.revision,
      observation: secondObservation,
    });
    expectNoRawTrainingText(secondCapture.training);
    const secondSaved = await saveSecondPage(
      training,
      started.training.trainingId,
      started.token,
      secondCapture.page,
      secondCapture.training.revision,
    );
    const published = await training.publish(started.training.trainingId, started.token, {
      revision: secondSaved.training.revision,
    });
    expect(published.mapping.status).toBe('testable');
    expectNoRawTrainingText(published.mapping);

    const originalTabId = tabId;
    await carrier.close();
    carrier = await context.newPage();
    await carrier.goto(`${carrierOrigin}/classic?step=1`);
    tabId = await tabIdFor(worker);
    expect(tabId).not.toBe(originalTabId);
    const fresh = await training.start({
      miaOrigin,
      code: 'n'.repeat(32),
      verifier: 'z'.repeat(43),
      carrierOrigin,
      carrierBaseUrl: carrierOrigin,
      tabId,
      formType: 'home',
      workflowName: 'Synthetic workflow',
    });
    const library = await training.library(fresh.training.trainingId, fresh.token);
    expect(library.mappings).toEqual([published.mapping]);
    const reopened = await training.openMapping(fresh.training.trainingId, fresh.token, {
      revision: fresh.training.revision,
      mappingId: published.mapping.mappingId,
      mappingVersion: published.mapping.mappingVersion,
    });
    expect(reopened.training.binding.tabId).toBe(tabId);
    expect((await training.read(started.training.trainingId, started.token)).binding.tabId).toBe(
      originalTabId,
    );
    const proof = await runCleanJob(runtime, worker, carrier, tabId, {
      mappingId: published.mapping.mappingId,
      mappingVersion: published.mapping.mappingVersion,
    });
    expect(proof.job).toMatchObject({ status: 'page_complete', failed: 0, reviews: [] });
    const verified = await training.verify(fresh.training.trainingId, fresh.token, {
      revision: reopened.training.revision,
      mappingVersion: published.mapping.mappingVersion,
      jobId: proof.jobId,
      jobToken: proof.token,
    });
    expect(verified.mapping.status).toBe('verified');
    const activated = await training.activate(fresh.training.trainingId, fresh.token, {
      revision: verified.training.revision,
      mappingVersion: verified.mapping.mappingVersion,
    });
    expect(activated.mapping.status).toBe('active');

    await carrier.goto(`${carrierOrigin}/classic?step=1`);
    const active = await runCleanJob(runtime, worker, carrier, tabId);
    expect(active.job).toMatchObject({ status: 'page_complete', failed: 0, reviews: [] });
    expect(await carrier.getByLabel('Driver given name', { exact: true }).inputValue()).toBe(
      'Casey',
    );
    expect(await carrier.getByLabel('Auto make', { exact: true }).inputValue()).toBe('Synthetic');

    await carrier.goto(`${carrierOrigin}/classic?step=1`);
    const nextButton = carrier.getByRole('button', { name: 'Next page' });
    await nextButton.evaluate((button) => {
      button.setAttribute('data-clicked', 'false');
      button.closest('form')?.addEventListener('submit', () => {
        button.setAttribute('data-clicked', 'true');
      });
    });
    await carrier.getByLabel('Applicant first name').evaluate((element) => {
      element.addEventListener('input', () => {
        (element as HTMLInputElement).value = '';
      });
    });
    const failedStart = await runtime.start({
      miaOrigin,
      code: 'f'.repeat(32),
      verifier: 'x'.repeat(43),
      carrierOrigin,
      carrierPageUrl: `${carrierOrigin}/classic`,
      tabId,
    });
    const failurePage = await observe(worker, tabId);
    const failurePlan = await runtime.observe(failedStart.job.jobId, failedStart.token, {
      revision: failedStart.job.revision,
      resume: false,
      observation: failurePage,
    });
    const failureBatches = [failurePlan.batch, ...(failurePlan.followingBatches ?? [])].filter(
      (batch): batch is ActionBatch => !!batch,
    );
    expect(failureBatches.length).toBeGreaterThan(1);
    let failureJob = failurePlan.job;
    for (const batch of failureBatches) {
      const receipt = await execute(worker, tabId, batch);
      failureJob = await runtime.receipt(failedStart.job.jobId, failedStart.token, {
        revision: failureJob.revision,
        batchId: batch.batchId,
        receipt,
      });
    }
    expect(failureJob.failed).toBe(1);
    expect(failureJob.verified).toBeGreaterThan(0);
    expect(failureJob.reviews).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'validation_error' })]),
    );
    expect(await carrier.getByLabel('Applicant first name').inputValue()).toBe('');
    expect(await carrier.getByLabel('Applicant last name').inputValue()).toBe('Smartmapper');
    await expect(nextButton).toHaveAttribute('data-clicked', 'false');
    expect(carrier.url()).toContain('/classic?step=1');

    await carrier.goto(`${carrierOrigin}/classic?step=3`);
    await expect(carrier.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
    expect(await valueDigest('Smartmapper')).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    await context.close();
  }
});
