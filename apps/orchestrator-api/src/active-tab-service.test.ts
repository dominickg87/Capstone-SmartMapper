import { describe, expect, it } from 'vitest';
import { stableLocator, stablePageSignature } from '@smartmapper/automation-core/registry';
import { valueDigest } from '@smartmapper/automation-core/active-tab';
import type {
  MappingProfile,
  PageControl,
  PageObservation,
  SourceAnswers,
} from '@smartmapper/contracts';
import { ActiveTabJobService } from './active-tab-service.js';
import { MemoryCheckpointStore } from './checkpoints.js';
import { MemoryMappingRegistryStore } from './mapping-registry.js';

const carrierOrigin = 'https://carrier.test';
const miaOrigin = 'https://mia.test';
const now = () => new Date().toISOString();
const control = (overrides: Partial<PageControl>): PageControl => ({
  elementId: crypto.randomUUID(),
  key: crypto.randomUUID(),
  tag: 'input',
  inputType: 'text',
  role: 'textbox',
  label: 'VIN',
  section: 'Vehicle 1',
  context: [],
  value: '',
  checked: false,
  required: false,
  requiredSatisfied: true,
  disabled: false,
  humanOnly: false,
  ordinaryNext: false,
  choiceGroup: null,
  options: [],
  errors: [],
  rect: { x: 0, y: 0, width: 100, height: 20 },
  ...overrides,
});
const observation = (controls: PageControl[]): PageObservation => ({
  version: '2.0',
  tabId: 11,
  origin: carrierOrigin,
  pageStateId: crypto.randomUUID(),
  documentId: 'document',
  routeId: '1'.repeat(64),
  fingerprint: 'a'.repeat(64),
  title: 'Vehicles',
  headings: ['Vehicles'],
  controls,
  errors: [],
  authenticationRequired: false,
  unsupportedFrames: 0,
  omittedControls: 0,
  capturedAt: now(),
  capture: { complete: true, unexpanded: 0, mode: 'targeted' },
});
const source: SourceAnswers = {
  version: '2.0',
  tenantId: 'tenant',
  userId: 'user',
  quoteId: 'quote',
  formType: 'auto',
  revision: 'r1',
  answers: [0, 1].map((index) => ({
    answerId: `vehicle-${index}-vin`,
    questionId: 'vehicle-vin',
    sourcePath: `vehicles.${index}.vin`,
    question: 'What is the VIN?',
    section: 'Vehicles',
    entity: `Vehicle ${index + 1}`,
    context: [],
    options: [],
    value: `VIN${index}`,
    status: 'answered',
    dataType: 'text',
  })),
  unavailablePaths: [],
};

describe('deterministic active-tab runtime', () => {
  it('fills existing repeated rows, then uses the trained bounded Add Vehicle control', async () => {
    const row0 = control({ elementId: 'vin-0', key: 'vin-key-0' });
    const row1 = control({ elementId: 'vin-1', key: 'vin-key-1', section: 'Vehicle 2' });
    const add = control({
      elementId: 'add-vehicle',
      key: 'add-key',
      tag: 'button',
      inputType: 'button',
      role: 'button',
      label: 'Add Vehicle',
      section: 'Vehicles',
    });
    const next = control({
      elementId: 'next',
      key: 'next-key',
      tag: 'button',
      inputType: 'button',
      role: 'button',
      label: 'Next',
      section: 'Navigation',
      ordinaryNext: true,
    });
    const runtimePage = observation([row0, add, next]);
    const trainedPage = observation([row0, row1, add, next]);
    const fieldIds = [crypto.randomUUID(), crypto.randomUUID()];
    const mappingId = crypto.randomUUID();
    const input: Omit<MappingProfile, 'mappingVersion' | 'status' | 'publishedAt'> = {
      version: '2.0',
      mappingId,
      tenantId: 'tenant',
      createdByUserId: 'user',
      workflow: {
        carrierOrigin,
        carrierBaseUrl: carrierOrigin,
        workflowName: 'Auto workflow',
        lineOfBusiness: 'auto',
      },
      catalogRevision: 'auto-1',
      entityLimits: [
        {
          key: 'vehicles',
          entityType: 'vehicle',
          sourcePattern: 'vehicles.*',
          minimumCount: 0,
          maximumCount: 8,
          sourceIndexBase: 0,
        },
      ],
      pages: [
        {
          pageId: crypto.randomUUID(),
          sequence: 1,
          scenarioLabel: 'Page 1',
          routeId: trainedPage.routeId,
          signature: await stablePageSignature(trainedPage),
          fields: await Promise.all(
            [row0, row1].map(async (item, index) => ({
              fieldId: fieldIds[index]!,
              sequence: index + 1,
              target: await stableLocator(item, 0, index, 'vehicles-vin'),
              disposition: {
                kind: 'source' as const,
                references: [
                  {
                    binding: 'same_position' as const,
                    sourcePathPattern: 'vehicles.*.vin',
                    sourceIndexBase: 0,
                  },
                ],
                transform: { kind: 'identity' as const },
              },
            })),
          ),
          workflowControls: [
            {
              workflowControlId: crypto.randomUUID(),
              sequence: 3,
              kind: 'add_entity',
              entityType: 'vehicle',
              target: await stableLocator(add, 0, null, null),
            },
            {
              workflowControlId: crypto.randomUUID(),
              sequence: 4,
              kind: 'ordinary_next',
              entityType: null,
              target: await stableLocator(next, 0, null, null),
            },
          ],
        },
      ],
      verification: {
        coveredPageIds: [],
        coveredFieldIds: [],
        coveredWorkflowControlIds: [],
        evidenceDigests: [],
        lastVerifiedAt: null,
      },
      createdAt: now(),
    };
    const registry = new MemoryMappingRegistryStore();
    const published = await registry.publish(input);
    const scope = { tenantId: 'tenant', carrierOrigin, lineOfBusiness: 'auto' as const };
    await registry.recordVerification(scope, mappingId, published.mappingVersion, {
      pageIds: published.pages.map((page) => page.pageId),
      fieldIds,
      workflowControlIds: published.pages.flatMap((page) =>
        page.workflowControls.map((control) => control.workflowControlId),
      ),
      evidenceDigest: 'b'.repeat(64),
    });
    await registry.setActive(scope, mappingId, published.mappingVersion);
    const checkpoints = new MemoryCheckpointStore();
    const service = new ActiveTabJobService(
      checkpoints,
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0',
            binding: {
              tenantId: 'tenant',
              userId: 'user',
              quoteId: 'quote',
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
    const started = await service.start({
      miaOrigin,
      code: 'c'.repeat(32),
      verifier: 'v'.repeat(43),
      carrierOrigin,
      carrierPageUrl: `${carrierOrigin}/quote/vehicles`,
      tabId: 11,
    });
    const first = await service.observe(started.job.jobId, started.token, {
      revision: started.job.revision,
      resume: false,
      observation: runtimePage,
    });
    expect(first.batch?.action).toMatchObject({ type: 'fill', elementId: 'vin-0', value: 'VIN0' });
    const afterFill = await service.receipt(started.job.jobId, started.token, {
      revision: first.job.revision,
      batchId: first.batch!.batchId,
      receipt: {
        actionId: first.batch!.action.actionId,
        status: 'verified',
        reason: 'matched',
        observedHash: await valueDigest('VIN0'),
      },
    });
    const refreshed = observation([{ ...row0, value: 'VIN0' }, add, next]);
    refreshed.documentId = runtimePage.documentId;
    const second = await service.observe(started.job.jobId, started.token, {
      revision: afterFill.revision,
      resume: false,
      observation: refreshed,
    });
    expect(second.batch?.action).toMatchObject({
      type: 'click',
      elementId: 'add-vehicle',
      purpose: 'add_entity',
      sourceAnswerIds: ['vehicle-1-vin'],
    });
    expect(second.job.reviews).toEqual([]);
    const afterAdd = await service.receipt(started.job.jobId, started.token, {
      revision: second.job.revision,
      batchId: second.batch!.batchId,
      receipt: {
        actionId: second.batch!.action.actionId,
        status: 'executed',
        reason: 'applied',
        observedHash: null,
      },
    });
    const partition = started.token.split('.')[0]!;
    expect(
      (await checkpoints.read(partition, started.job.jobId))?.value
        .verifiedMappingWorkflowControlIds,
    ).toEqual([]);
    const withSecondRow = observation([{ ...row0, value: 'VIN0' }, row1, add, next]);
    withSecondRow.documentId = runtimePage.documentId;
    withSecondRow.fingerprint = 'c'.repeat(64);
    const third = await service.observe(started.job.jobId, started.token, {
      revision: afterAdd.revision,
      resume: false,
      observation: withSecondRow,
    });
    expect(
      (await checkpoints.read(partition, started.job.jobId))?.value
        .verifiedMappingWorkflowControlIds,
    ).toEqual([published.pages[0]!.workflowControls[0]!.workflowControlId]);
    expect(third.batch?.action).toMatchObject({ type: 'fill', elementId: 'vin-1' });
    const afterSecondFill = await service.receipt(started.job.jobId, started.token, {
      revision: third.job.revision,
      batchId: third.batch!.batchId,
      receipt: {
        actionId: third.batch!.action.actionId,
        status: 'verified',
        reason: 'matched',
        observedHash: await valueDigest('VIN1'),
      },
    });
    const completedPage = observation([
      { ...row0, value: 'VIN0' },
      { ...row1, value: 'VIN1' },
      add,
      next,
    ]);
    completedPage.documentId = runtimePage.documentId;
    completedPage.fingerprint = 'd'.repeat(64);
    const navigating = await service.observe(started.job.jobId, started.token, {
      revision: afterSecondFill.revision,
      resume: false,
      observation: completedPage,
    });
    expect(navigating.batch?.action).toMatchObject({ type: 'next_page', elementId: 'next' });
    const afterNextClick = await service.receipt(started.job.jobId, started.token, {
      revision: navigating.job.revision,
      batchId: navigating.batch!.batchId,
      receipt: {
        actionId: navigating.batch!.action.actionId,
        status: 'executed',
        reason: 'applied',
        observedHash: null,
      },
    });
    expect(
      (await checkpoints.read(partition, started.job.jobId))?.value
        .verifiedMappingWorkflowControlIds,
    ).toEqual([published.pages[0]!.workflowControls[0]!.workflowControlId]);
    const navigatedPage = observation(completedPage.controls);
    navigatedPage.documentId = 'next-document';
    navigatedPage.fingerprint = 'e'.repeat(64);
    await service.observe(started.job.jobId, started.token, {
      revision: afterNextClick.revision,
      resume: false,
      observation: navigatedPage,
    });
    expect(
      (await checkpoints.read(partition, started.job.jobId))?.value
        .verifiedMappingWorkflowControlIds,
    ).toEqual(published.pages[0]!.workflowControls.map((item) => item.workflowControlId));
  });

  it('preserves a failed field review and continues an independent queued field', async () => {
    const firstName = control({
      elementId: 'first-name',
      key: 'first-name-key',
      label: 'First name',
      section: 'Applicant',
    });
    const lastName = control({
      elementId: 'last-name',
      key: 'last-name-key',
      label: 'Last name',
      section: 'Applicant',
    });
    const runtimePage = observation([firstName, lastName]);
    const fieldIds = [crypto.randomUUID(), crypto.randomUUID()];
    const mappingId = crypto.randomUUID();
    const answers: SourceAnswers = {
      ...source,
      answers: [
        {
          ...source.answers[0]!,
          answerId: 'applicant-first',
          sourcePath: 'applicant1.firstName',
          value: 'Jordan',
        },
        {
          ...source.answers[0]!,
          answerId: 'applicant-last',
          sourcePath: 'applicant1.lastName',
          value: 'Smartmapper',
        },
      ],
    };
    const registry = new MemoryMappingRegistryStore();
    const published = await registry.publish({
      version: '2.0',
      mappingId,
      tenantId: 'tenant',
      createdByUserId: 'user',
      workflow: {
        carrierOrigin,
        carrierBaseUrl: carrierOrigin,
        workflowName: 'Auto workflow',
        lineOfBusiness: 'auto',
      },
      catalogRevision: 'auto-1',
      entityLimits: [],
      pages: [
        {
          pageId: crypto.randomUUID(),
          sequence: 1,
          scenarioLabel: 'Page 1',
          routeId: runtimePage.routeId,
          signature: await stablePageSignature(runtimePage),
          fields: await Promise.all(
            [firstName, lastName].map(async (item, index) => ({
              fieldId: fieldIds[index]!,
              sequence: index + 1,
              target: await stableLocator(item, 0, null, null),
              disposition: {
                kind: 'source' as const,
                references: [
                  {
                    binding: 'fixed' as const,
                    sourcePath: index === 0 ? 'applicant1.firstName' : 'applicant1.lastName',
                    sourcePathPattern: index === 0 ? 'applicant*.firstName' : 'applicant*.lastName',
                  },
                ],
                transform: { kind: 'identity' as const },
              },
            })),
          ),
          workflowControls: [],
        },
      ],
      verification: {
        coveredPageIds: [],
        coveredFieldIds: [],
        coveredWorkflowControlIds: [],
        evidenceDigests: [],
        lastVerifiedAt: null,
      },
      createdAt: now(),
    });
    const scope = { tenantId: 'tenant', carrierOrigin, lineOfBusiness: 'auto' as const };
    await registry.recordVerification(scope, mappingId, published.mappingVersion, {
      pageIds: published.pages.map((page) => page.pageId),
      fieldIds,
      workflowControlIds: [],
      evidenceDigest: 'f'.repeat(64),
    });
    await registry.setActive(scope, mappingId, published.mappingVersion);
    const checkpoints = new MemoryCheckpointStore();
    const service = new ActiveTabJobService(
      checkpoints,
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0',
            binding: {
              tenantId: 'tenant',
              userId: 'user',
              quoteId: 'quote',
              carrierOrigin,
              tabId: request.tabId,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
            sourceToken: 's'.repeat(43),
            source: answers,
          }),
        read: () => Promise.resolve(answers),
        revoke: () => Promise.resolve(),
      },
      registry,
      {
        miaOrigins: new Set([miaOrigin]),
        carrierOrigins: new Set([carrierOrigin]),
        principals: new Set(['tenant/user']),
      },
    );
    const started = await service.start({
      miaOrigin,
      code: 'c'.repeat(32),
      verifier: 'v'.repeat(43),
      carrierOrigin,
      carrierPageUrl: `${carrierOrigin}/quote/applicant`,
      tabId: 11,
    });
    const planned = await service.observe(started.job.jobId, started.token, {
      revision: started.job.revision,
      resume: false,
      observation: runtimePage,
    });
    expect(planned.batch?.action.elementId).toBe('first-name');
    expect(planned.followingBatches?.[0]?.action.elementId).toBe('last-name');
    const afterFailure = await service.receipt(started.job.jobId, started.token, {
      revision: planned.job.revision,
      batchId: planned.batch!.batchId,
      receipt: {
        actionId: planned.batch!.action.actionId,
        status: 'failed',
        reason: 'read_back_mismatch',
        observedHash: '0'.repeat(64),
      },
    });
    expect(afterFailure).toMatchObject({ status: 'executing', failed: 1, verified: 0 });
    expect(afterFailure.reviews).toHaveLength(1);
    const second = planned.followingBatches![0]!;
    const completed = await service.receipt(started.job.jobId, started.token, {
      revision: afterFailure.revision,
      batchId: second.batchId,
      receipt: {
        actionId: second.action.actionId,
        status: 'verified',
        reason: 'matched',
        observedHash: await valueDigest('Smartmapper'),
      },
    });
    expect(completed).toMatchObject({ status: 'human_input', failed: 1, verified: 1 });
    expect(completed.reviews).toHaveLength(1);
    const manuallyCompletedPage = observation([
      { ...firstName, value: 'Jordan' },
      { ...lastName, value: 'Smartmapper' },
    ]);
    manuallyCompletedPage.documentId = runtimePage.documentId;
    manuallyCompletedPage.fingerprint = '9'.repeat(64);
    const resumed = await service.observe(started.job.jobId, started.token, {
      revision: completed.revision,
      resume: true,
      skipElementId: firstName.elementId,
      observation: manuallyCompletedPage,
    });
    expect(resumed).toMatchObject({ batch: null, job: { status: 'page_complete', reviews: [] } });
    const partition = started.token.split('.')[0]!;
    const checkpoint = (await checkpoints.read(partition, started.job.jobId))?.value;
    expect(checkpoint?.verifiedMappingFieldIds).toEqual([fieldIds[1]]);
    expect(checkpoint?.skippedControls).toEqual([
      expect.objectContaining({
        key: firstName.key,
        routeId: runtimePage.routeId,
        sourceRevision: answers.revision,
        reason: 'read_back_mismatch',
      }),
    ]);
    expect(checkpoint?.skippedControls?.[0]?.shape).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(checkpoint)).not.toContain('First name');
    expect(JSON.stringify(checkpoint)).not.toContain('Applicant');
  });

  it('records carrier-default coverage only after a nonblank live read-back', async () => {
    const agencyCode = control({
      elementId: 'agency-code',
      key: 'agency-code-key',
      label: 'Agency code',
      section: 'Agency',
      value: '',
      required: false,
    });
    const runtimePage = observation([agencyCode]);
    const mappingId = crypto.randomUUID();
    const fieldId = crypto.randomUUID();
    const registry = new MemoryMappingRegistryStore();
    const published = await registry.publish({
      version: '2.0',
      mappingId,
      tenantId: 'tenant',
      createdByUserId: 'user',
      workflow: {
        carrierOrigin,
        carrierBaseUrl: carrierOrigin,
        workflowName: 'Auto workflow',
        lineOfBusiness: 'auto',
      },
      catalogRevision: 'auto-1',
      entityLimits: [],
      pages: [
        {
          pageId: crypto.randomUUID(),
          sequence: 1,
          scenarioLabel: 'Page 1',
          routeId: runtimePage.routeId,
          signature: await stablePageSignature(runtimePage),
          fields: [
            {
              fieldId,
              sequence: 1,
              target: await stableLocator(
                {
                  ...agencyCode,
                  choiceValue: null,
                  addEntityType: null,
                  operationalTarget: 'agency_operational',
                  repeatHint: null,
                },
                0,
                null,
                null,
              ),
              disposition: { kind: 'carrier_default' },
            },
          ],
          workflowControls: [],
        },
      ],
      verification: {
        coveredPageIds: [],
        coveredFieldIds: [],
        coveredWorkflowControlIds: [],
        evidenceDigests: [],
        lastVerifiedAt: null,
      },
      createdAt: now(),
    });
    const scope = { tenantId: 'tenant', carrierOrigin, lineOfBusiness: 'auto' as const };
    await registry.recordVerification(scope, mappingId, published.mappingVersion, {
      pageIds: [published.pages[0]!.pageId],
      fieldIds: [fieldId],
      workflowControlIds: [],
      evidenceDigest: 'a'.repeat(64),
    });
    await registry.setActive(scope, mappingId, published.mappingVersion);
    const checkpoints = new MemoryCheckpointStore();
    const service = new ActiveTabJobService(
      checkpoints,
      {
        redeem: (request) =>
          Promise.resolve({
            version: '2.0',
            binding: {
              tenantId: 'tenant',
              userId: 'user',
              quoteId: 'quote',
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
      },
    );
    const started = await service.start({
      miaOrigin,
      code: 'c'.repeat(32),
      verifier: 'v'.repeat(43),
      carrierOrigin,
      carrierPageUrl: `${carrierOrigin}/quote/agency`,
      tabId: 11,
    });
    const blank = await service.observe(started.job.jobId, started.token, {
      revision: started.job.revision,
      resume: false,
      observation: runtimePage,
    });
    expect(blank).toMatchObject({
      batch: null,
      job: {
        status: 'human_input',
        reviews: [expect.objectContaining({ reason: 'validation_error' })],
      },
    });
    const partition = started.token.split('.')[0]!;
    expect(
      (await checkpoints.read(partition, started.job.jobId))?.value.verifiedMappingFieldIds,
    ).toEqual([]);
    expect(
      (await checkpoints.read(partition, started.job.jobId))?.value.localFieldEvidence,
    ).toEqual([]);

    const populatedPage = observation([{ ...agencyCode, value: 'AGENCY-001' }]);
    populatedPage.documentId = runtimePage.documentId;
    populatedPage.routeId = runtimePage.routeId;
    populatedPage.fingerprint = '9'.repeat(64);
    const populated = await service.observe(started.job.jobId, started.token, {
      revision: blank.job.revision,
      resume: true,
      observation: populatedPage,
    });
    expect(populated).toMatchObject({ batch: null, job: { status: 'page_complete', reviews: [] } });
    const checkpoint = (await checkpoints.read(partition, started.job.jobId))?.value;
    expect(checkpoint?.verifiedMappingFieldIds).toEqual([fieldId]);
    expect(checkpoint?.localFieldEvidence).toEqual([
      {
        mappingFieldId: fieldId,
        key: agencyCode.key,
        observedHash: await valueDigest('AGENCY-001'),
        kind: 'carrier_default',
        sourceRevision: source.revision,
      },
    ]);
    expect(JSON.stringify(checkpoint)).not.toContain('AGENCY-001');
  });
});
