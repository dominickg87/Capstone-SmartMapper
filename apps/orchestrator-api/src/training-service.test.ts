import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PageControl,
  PageObservation,
  RedeemedTrainingGrant,
  TrainingControlSnapshot,
  TrainingPageObservation,
} from '@smartmapper/contracts';
import { ActiveTabJobService } from './active-tab-service.js';
import { MemoryCheckpointStore } from './checkpoints.js';
import { MemoryMappingRegistryStore } from './mapping-registry.js';
import { MemoryTrainingSessionStore, TrainingService } from './training-service.js';

const principal = 'tenant/user';
const carrierOrigin = 'https://carrier.test';
const miaOrigin = 'https://mia.test';
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const semanticHash = (value: string): string =>
  `sha256:${hash(value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase())}`;

const field = (overrides: Partial<PageControl>): PageControl => ({
  elementId: crypto.randomUUID(),
  key: crypto.randomUUID(),
  tag: 'input',
  inputType: 'text',
  role: 'textbox',
  label: 'First name',
  section: 'Applicant',
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
  rect: { x: 10, y: 10, width: 100, height: 20 },
  ...overrides,
});

const operationalTarget = (item: PageControl): TrainingControlSnapshot['operationalTarget'] => {
  const description = `${item.section} ${item.label} ${item.context.join(' ')}`;
  if (
    /\b(?:agency|agent|producer|office|branch)\s+(?:code|id|identifier|number)\b/i.test(description)
  )
    return 'agency_operational';
  if (/\bcarrier\s+(?:code|id|identifier|number)\b/i.test(description))
    return 'carrier_operational';
  return null;
};

const addEntityType = (item: PageControl): TrainingControlSnapshot['addEntityType'] => {
  if (!/^(?:add|new)\b/i.test(item.label)) return null;
  if (/\bvehicle\b/i.test(item.label)) return 'vehicle';
  if (/\b(?:driver|operator)\b/i.test(item.label)) return 'additionalDriver';
  if (/\b(?:applicant|household member)\b/i.test(item.label)) return 'applicant';
  return null;
};

const repeatHint = (item: PageControl): TrainingControlSnapshot['repeatHint'] => {
  const source = `${item.section} ${item.label} ${item.context.join(' ')}`;
  const match =
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|\d+)(?:st|nd|rd|th)?\s+(vehicle|driver|operator|applicant)\b/i.exec(
      source,
    );
  if (!match) return null;
  const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  const index = /^\d+$/.test(match[1]!)
    ? Number(match[1]!) - 1
    : words.indexOf(match[1]!.toLowerCase());
  if (index < 0) return null;
  return {
    index,
    entityType:
      match[2]!.toLowerCase() === 'vehicle'
        ? 'vehicle'
        : match[2]!.toLowerCase() === 'applicant'
          ? 'applicant'
          : 'additionalDriver',
  };
};

const snapshot = (item: PageControl): TrainingControlSnapshot => ({
  ...(item.locatorHints ? { locatorHints: item.locatorHints } : {}),
  elementId: `e${BigInt(`0x${hash(item.elementId).slice(0, 12)}`).toString(10)}`,
  key: hash(item.key),
  tag: item.tag,
  inputType: item.inputType,
  role: item.role,
  label: item.label ? semanticHash(item.label) : '',
  section: item.section ? semanticHash(item.section) : '',
  context: item.context.map(semanticHash),
  required: item.required,
  disabled: item.disabled,
  humanOnly: item.humanOnly,
  ordinaryNext: item.ordinaryNext,
  choiceGroup: item.choiceGroup
    ? { key: semanticHash(item.choiceGroup.key), label: semanticHash(item.choiceGroup.label) }
    : null,
  choiceValue:
    item.inputType === 'radio' || item.role === 'radio' ? semanticHash(item.value) : null,
  addEntityType: addEntityType(item),
  operationalTarget: operationalTarget(item),
  repeatHint: repeatHint(item),
  options: item.options.map((option) => ({
    value: semanticHash(option.value),
    label: semanticHash(option.label),
  })),
  rect: { ...item.rect },
});

const trainingObservation = (
  tabId: number,
  routeId: string,
  fingerprint: string,
  controls: PageControl[],
): TrainingPageObservation => ({
  version: '2.0',
  tabId,
  origin: carrierOrigin,
  pageStateId: crypto.randomUUID(),
  documentId: crypto.randomUUID(),
  routeId: hash(routeId),
  fingerprint,
  title: '',
  headings: [],
  controls: controls.map(snapshot),
  authenticationRequired: false,
  unsupportedFrames: 0,
  omittedControls: 0,
  capturedAt: new Date().toISOString(),
});

const grant = (tabId: number): RedeemedTrainingGrant => ({
  version: '2.0',
  binding: {
    tenantId: 'tenant',
    userId: 'user',
    carrierOrigin,
    tabId,
    formType: 'home',
    expiresAt: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
  },
  catalog: {
    version: '2.0',
    schemaRevision: 'home-1',
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
    fields: [
      {
        fieldId: 'mia:home:applicant1.firstName',
        sourcePath: 'applicant1.firstName',
        sourcePattern: 'applicant*.firstName',
        question: "What is the applicant's first name?",
        section: 'Applicant',
        context: [],
        options: [],
        conditions: [],
        conditionalReview: false,
        dataType: 'text',
        entity: {
          key: 'applicants',
          type: 'applicant',
          index: 0,
          position: 1,
          label: 'Applicant 1',
        },
      },
      {
        fieldId: 'mia:home:selectedProtections',
        sourcePath: 'selectedProtections',
        sourcePattern: 'selectedProtections',
        question: 'Which protections apply?',
        section: 'Coverage',
        context: [],
        options: [
          { value: 'fire', label: 'Fire' },
          { value: 'theft', label: 'Theft' },
        ],
        conditions: [],
        conditionalReview: false,
        dataType: 'multiselect',
        entity: null,
      },
      {
        fieldId: 'mia:home:policyForm',
        sourcePath: 'policyForm',
        sourcePattern: 'policyForm',
        question: 'Which policy form applies?',
        section: 'Coverage',
        context: [],
        options: [
          { value: 'HO3', label: 'HO3' },
          { value: 'HO5', label: 'HO5' },
        ],
        conditions: [],
        conditionalReview: false,
        dataType: 'enum',
        entity: null,
      },
    ],
  },
});

afterEach(() => vi.useRealTimers());

function recoveryHarness() {
  const identity = { tenant: 'tenant', user: 'user', catalogRevision: 'home-1' };
  const store = new MemoryTrainingSessionStore();
  const registry = new MemoryMappingRegistryStore();
  const service = new TrainingService(
    store,
    {
      redeem: (request) => {
        const redeemed = grant(request.tabId);
        redeemed.binding = {
          ...redeemed.binding,
          tenantId: identity.tenant,
          userId: identity.user,
          carrierOrigin: request.carrierOrigin,
          formType: request.formType,
        };
        redeemed.catalog = {
          ...redeemed.catalog,
          formType: request.formType,
          schemaRevision: identity.catalogRevision,
        };
        return Promise.resolve(redeemed);
      },
    },
    registry,
    {
      miaOrigins: new Set([miaOrigin]),
      carrierOrigins: new Set([carrierOrigin, 'https://other-carrier.test']),
      principals: new Set(['tenant/user', 'tenant/other', 'other-tenant/user']),
    },
    new MemoryCheckpointStore(),
  );
  const start = (tabId: number, formType: 'home' | 'auto' = 'home', origin = carrierOrigin) =>
    service.start({
      miaOrigin,
      code: 'c'.repeat(32),
      verifier: 'v'.repeat(43),
      carrierOrigin: origin,
      carrierBaseUrl: origin,
      tabId,
      formType,
      workflowName: 'Synthetic workflow',
    });
  const savedDraft = async () => {
    const session = await start(7);
    const capture = await service.capture(session.training.trainingId, session.token, {
      revision: 0,
      observation: trainingObservation(7, 'page-one', '1'.repeat(64), [field({})]),
    });
    const saved = await service.savePage(
      session.training.trainingId,
      capture.page.pageId,
      session.token,
      {
        revision: capture.training.revision,
        fields: [{ fieldId: capture.page.fields[0]!.fieldId, disposition: { kind: 'ignore' } }],
        workflowControls: [],
      },
    );
    return { ...session, training: saved.training };
  };
  return { identity, service, store, registry, start, savedDraft };
}

describe('automatic field discovery', () => {
  it('keeps 1–20 and their annotations, allocates 21–40, and restores hidden scenarios without duplicates', async () => {
    const { service, start } = recoveryHarness();
    const session = await start(7);
    const controls = Array.from({ length: 40 }, (_, index) =>
      field({
        label: `Synthetic field ${index + 1}`,
        rect: { x: 10, y: index * 30, width: 100, height: 20 },
        locatorHints: { name: hash(`field-${index}`) },
      }),
    );
    const first = await service.capture(session.training.trainingId, session.token, {
      revision: 0,
      observation: trainingObservation(7, 'page-one', '1'.repeat(64), controls.slice(0, 20)),
    });
    const saved = await service.savePage(
      session.training.trainingId,
      first.page.pageId,
      session.token,
      {
        revision: first.training.revision,
        fields: [{ fieldId: first.page.fields[0]!.fieldId, disposition: { kind: 'ignore' } }],
        workflowControls: [],
      },
    );
    const second = await service.capture(session.training.trainingId, session.token, {
      revision: saved.training.revision,
      discover: true,
      fromPageId: first.page.pageId,
      observation: trainingObservation(7, 'page-one', '2'.repeat(64), controls),
    });
    expect(second.page.fields.map((item) => item.sequence)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    );
    expect(second.page.fields[0]!.disposition).toEqual({ kind: 'ignore' });
    expect(second.page.fields[0]!.fieldId).not.toBe(first.page.fields[0]!.fieldId);
    expect(second.page.fields[0]!.logicalFieldId).toBe(first.page.fields[0]!.fieldId);
    const edited = await service.savePage(
      session.training.trainingId,
      second.page.pageId,
      session.token,
      {
        revision: second.training.revision,
        fields: [{ fieldId: second.page.fields[0]!.fieldId, disposition: null }],
        workflowControls: [],
      },
    );
    expect(edited.training.pages[0]!.fields[0]!.disposition).toBeNull();
    const hidden = await service.capture(session.training.trainingId, session.token, {
      revision: edited.training.revision,
      discover: true,
      fromPageId: second.page.pageId,
      observation: trainingObservation(7, 'page-one', '3'.repeat(64), controls.slice(0, 20)),
    });
    expect(hidden.page.pageId).toBe(first.page.pageId);
    expect(hidden.training.revision).toBe(edited.training.revision);
    expect(hidden.training.pages).toHaveLength(2);
    const revealed = await service.capture(session.training.trainingId, session.token, {
      revision: hidden.training.revision,
      discover: true,
      fromPageId: hidden.page.pageId,
      observation: trainingObservation(7, 'page-one', '4'.repeat(64), controls),
    });
    expect(revealed.page.pageId).toBe(second.page.pageId);
    expect(revealed.training.pages).toHaveLength(2);
    await expect(
      service.capture(session.training.trainingId, session.token, {
        revision: 0,
        discover: true,
        observation: trainingObservation(7, 'page-one', '5'.repeat(64), controls),
      }),
    ).rejects.toThrow('revision_conflict');
  });

  it('does not reuse fields across routes, changed meanings, option domains, or human-only boundaries', async () => {
    const { service, start } = recoveryHarness();
    const session = await start(7);
    const original = field({ locatorHints: { id: hash('stable-input') } });
    const first = await service.capture(session.training.trainingId, session.token, {
      revision: 0,
      observation: trainingObservation(7, 'page-one', '1'.repeat(64), [original]),
    });
    let revision = first.training.revision;
    for (const [index, control] of [
      field({ ...original, locatorHints: { id: hash('different-input') } }),
      field({ ...original, label: 'Last name' }),
      field({ ...original, humanOnly: true }),
      field({
        ...original,
        tag: 'select',
        inputType: 'select-one',
        options: [{ value: 'A', label: 'A' }],
      }),
    ].entries()) {
      const result = await service.capture(session.training.trainingId, session.token, {
        revision,
        discover: true,
        fromPageId: first.page.pageId,
        observation: trainingObservation(7, 'page-one', '2'.repeat(64), [control]),
      });
      revision = result.training.revision;
      expect(result.page.fields[0]!.sequence).toBe(index + 2);
      expect(result.page.fields[0]!.logicalFieldId).not.toBe(first.page.fields[0]!.fieldId);
    }
    const other = await service.capture(session.training.trainingId, session.token, {
      revision,
      discover: true,
      fromPageId: first.page.pageId,
      observation: trainingObservation(7, 'page-two', '3'.repeat(64), [original]),
    });
    expect(other.page.fields[0]!.sequence).toBe(6);
  });

  it('preserves shared field identity through publishing and reopening an editable version', async () => {
    const { service, start } = recoveryHarness();
    const session = await start(7);
    const firstControl = field({ required: false, locatorHints: { name: hash('first') } });
    const first = await service.capture(session.training.trainingId, session.token, {
      revision: 0,
      observation: trainingObservation(7, 'page-one', '1'.repeat(64), [firstControl]),
    });
    const second = await service.capture(session.training.trainingId, session.token, {
      revision: first.training.revision,
      discover: true,
      fromPageId: first.page.pageId,
      observation: trainingObservation(7, 'page-one', '2'.repeat(64), [
        firstControl,
        field({ label: 'Optional note', required: false }),
      ]),
    });
    const saved = await service.savePage(
      session.training.trainingId,
      second.page.pageId,
      session.token,
      {
        revision: second.training.revision,
        fields: second.page.fields.map((item) => ({
          fieldId: item.fieldId,
          disposition: { kind: 'ignore' },
        })),
        workflowControls: [],
      },
    );
    const published = await service.publish(session.training.trainingId, session.token, {
      revision: saved.training.revision,
    });
    expect(published.mapping.pages[1]!.fields[0]!.logicalFieldId).toBe(
      first.page.fields[0]!.fieldId,
    );
    const fresh = await start(19);
    const editing = await service.editMapping(fresh.training.trainingId, fresh.token, {
      revision: 0,
      mappingId: published.mapping.mappingId,
      mappingVersion: published.mapping.mappingVersion,
    });
    const changed = await service.savePage(
      fresh.training.trainingId,
      second.page.pageId,
      fresh.token,
      {
        revision: editing.training.revision,
        fields: [{ fieldId: second.page.fields[0]!.fieldId, disposition: null }],
        workflowControls: [],
      },
    );
    expect(changed.training.pages[0]!.fields[0]!.disposition).toBeNull();
    expect(changed.training.pages[1]!.fields[0]!.disposition).toBeNull();
    expect(published.mapping.pages[0]!.fields[0]!.disposition).toEqual({ kind: 'ignore' });
  });

  it('keeps repeated fields distinct on insertion and never copies navigation approval to new scenarios', async () => {
    const { service, start } = recoveryHarness();
    const session = await start(7);
    const driver = (name: string, y: number) =>
      field({
        label: 'First name',
        section: 'Driver',
        locatorHints: { name: hash(name) },
        rect: { x: 10, y, width: 100, height: 20 },
      });
    const a = driver('driver-a', 10);
    const b = driver('driver-b', 50);
    const next = field({
      tag: 'button',
      inputType: 'button',
      role: 'button',
      label: 'Next',
      ordinaryNext: true,
      rect: { x: 10, y: 100, width: 100, height: 20 },
    });
    const first = await service.capture(session.training.trainingId, session.token, {
      revision: 0,
      observation: trainingObservation(7, 'page-one', '1'.repeat(64), [a, b, next]),
    });
    const saved = await service.savePage(
      session.training.trainingId,
      first.page.pageId,
      session.token,
      {
        revision: first.training.revision,
        fields: [],
        workflowControls: [
          { workflowControlId: first.page.workflowControls[0]!.workflowControlId, decision: 'use' },
        ],
      },
    );
    const second = await service.capture(session.training.trainingId, session.token, {
      revision: saved.training.revision,
      discover: true,
      fromPageId: first.page.pageId,
      observation: trainingObservation(7, 'page-one', '2'.repeat(64), [
        driver('driver-new', 0),
        a,
        b,
        next,
      ]),
    });
    expect(
      second.page.fields.find((item) => item.control.locatorHints?.name === hash('driver-a'))!
        .sequence,
    ).toBe(1);
    expect(
      second.page.fields.find((item) => item.control.locatorHints?.name === hash('driver-b'))!
        .sequence,
    ).toBe(2);
    expect(
      second.page.fields.find((item) => item.control.locatorHints?.name === hash('driver-new'))!
        .sequence,
    ).toBe(4);
    expect(second.page.workflowControls[0]!.sequence).toBe(3);
    expect(second.page.workflowControls[0]!.decision).toBeNull();
    expect(second.training.pages[0]!.workflowControls[0]!.decision).toBe('use');
  });
});

describe('saved training recovery', () => {
  it('copies saved numbered choices into a fresh tab authorization without changing the original', async () => {
    const { service, start, savedDraft } = recoveryHarness();
    const old = await savedDraft();
    const fresh = await start(19);
    const library = await service.library(fresh.training.trainingId, fresh.token);
    expect(library.drafts).toEqual([old.training]);
    expect(JSON.stringify(library)).not.toContain('tokenHash');
    expect(JSON.stringify(library)).not.toContain(old.token);
    const recovered = await service.recover(fresh.training.trainingId, fresh.token, {
      revision: 0,
      trainingId: old.training.trainingId,
    });
    expect(recovered.training).toMatchObject({
      trainingId: fresh.training.trainingId,
      revision: 1,
      binding: { tabId: 19 },
      status: 'draft',
      mappingId: null,
    });
    expect(recovered.training.pages).toEqual(old.training.pages);
    expect(await service.read(old.training.trainingId, old.token)).toEqual(old.training);
    await expect(
      service.capture(fresh.training.trainingId, fresh.token, {
        revision: 1,
        observation: trainingObservation(7, 'page-two', '2'.repeat(64), [field({})]),
      }),
    ).rejects.toMatchObject({ code: 'binding_mismatch' });
  });

  it('recovers durable draft metadata after the original capability expires using fresh authorization', async () => {
    vi.useFakeTimers();
    const { service, start, savedDraft } = recoveryHarness();
    const old = await savedDraft();
    vi.setSystemTime(Date.now() + 9 * 60 * 60_000);
    await expect(service.read(old.training.trainingId, old.token)).rejects.toMatchObject({
      code: 'training_expired',
    });
    const fresh = await start(19);
    expect((await service.library(fresh.training.trainingId, fresh.token)).drafts).toHaveLength(1);
    expect(
      (
        await service.recover(fresh.training.trainingId, fresh.token, {
          revision: 0,
          trainingId: old.training.trainingId,
        })
      ).training.binding.expiresAt,
    ).toBe(fresh.training.binding.expiresAt);
  });

  it.each(['user', 'tenant', 'carrier', 'lob'] as const)(
    'isolates saved drafts by %s',
    async (different) => {
      const { identity, service, start, savedDraft } = recoveryHarness();
      const old = await savedDraft();
      if (different === 'user') identity.user = 'other';
      if (different === 'tenant') identity.tenant = 'other-tenant';
      const fresh = await start(
        19,
        different === 'lob' ? 'auto' : 'home',
        different === 'carrier' ? 'https://other-carrier.test' : carrierOrigin,
      );
      expect((await service.library(fresh.training.trainingId, fresh.token)).drafts).toEqual([]);
      await expect(
        service.recover(fresh.training.trainingId, fresh.token, {
          revision: 0,
          trainingId: old.training.trainingId,
        }),
      ).rejects.toMatchObject({ code: 'saved_training_not_found' });
    },
  );

  it('rejects stale revisions, changed catalogs and overwriting a nonempty recovery target', async () => {
    const { identity, service, start, savedDraft } = recoveryHarness();
    const old = await savedDraft();
    const fresh = await start(19);
    await expect(
      service.recover(fresh.training.trainingId, fresh.token, {
        revision: 1,
        trainingId: old.training.trainingId,
      }),
    ).rejects.toThrow('revision_conflict');
    identity.catalogRevision = 'home-2';
    const changed = await start(20);
    await expect(
      service.recover(changed.training.trainingId, changed.token, {
        revision: 0,
        trainingId: old.training.trainingId,
      }),
    ).rejects.toMatchObject({ code: 'saved_training_catalog_changed' });
    await service.recover(fresh.training.trainingId, fresh.token, {
      revision: 0,
      trainingId: old.training.trainingId,
    });
    await expect(
      service.recover(fresh.training.trainingId, fresh.token, {
        revision: 1,
        trainingId: old.training.trainingId,
      }),
    ).rejects.toMatchObject({ code: 'recovery_requires_empty_draft' });
    await expect(service.library(fresh.training.trainingId, old.token)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('reopens an exact published version for testing and preserves the verification gate', async () => {
    const { service, start, savedDraft } = recoveryHarness();
    const old = await savedDraft();
    const published = await service.publish(old.training.trainingId, old.token, {
      revision: old.training.revision,
    });
    const fresh = await start(19);
    const library = await service.library(fresh.training.trainingId, fresh.token);
    expect(library.drafts).toEqual([]);
    expect(library.mappings).toEqual([published.mapping]);
    const opened = await service.openMapping(fresh.training.trainingId, fresh.token, {
      revision: 0,
      mappingId: published.mapping.mappingId,
      mappingVersion: published.mapping.mappingVersion,
    });
    expect(opened.mapping).toEqual(published.mapping);
    expect(opened.training).toMatchObject({
      binding: { tabId: 19 },
      status: 'testable',
      mappingId: published.mapping.mappingId,
    });
    await expect(
      service.activate(fresh.training.trainingId, fresh.token, {
        revision: opened.training.revision,
        mappingVersion: published.mapping.mappingVersion,
      }),
    ).rejects.toThrow();
    const other = await start(20, 'auto');
    expect((await service.library(other.training.trainingId, other.token)).mappings).toEqual([]);
    await expect(
      service.openMapping(other.training.trainingId, other.token, {
        revision: 0,
        mappingId: published.mapping.mappingId,
        mappingVersion: published.mapping.mappingVersion,
      }),
    ).rejects.toMatchObject({ code: 'saved_mapping_not_found' });
  });
});

describe('training service', () => {
  it('groups radio choices and persists no page values, errors, screenshots, text or quote IDs', async () => {
    const registry = new MemoryMappingRegistryStore();
    const jobs = new MemoryCheckpointStore();
    const service = new TrainingService(
      new MemoryTrainingSessionStore(),
      { redeem: (request) => Promise.resolve(grant(request.tabId)) },
      registry,
      {
        miaOrigins: new Set([miaOrigin]),
        carrierOrigins: new Set([carrierOrigin]),
        principals: new Set([principal]),
      },
      jobs,
    );
    const tabId = 7;
    const started = await service.start({
      miaOrigin,
      code: 'c'.repeat(32),
      verifier: 'v'.repeat(43),
      carrierOrigin,
      carrierBaseUrl: `${carrierOrigin}/quote`,
      tabId,
      formType: 'home',
      workflowName: 'Synthetic Home',
    });
    const sentinel = 'CUSTOMER-SECRET-SENTINEL';
    const controls = [
      field({ section: 'Operator 1', value: sentinel, errors: [sentinel] }),
      field({
        elementId: 'radio-no',
        inputType: 'radio',
        role: 'radio',
        label: 'No',
        value: 'N',
        choiceGroup: { key: 'salutation', label: 'Salutation preference?' },
        rect: { x: 10, y: 40, width: 20, height: 20 },
      }),
      field({
        elementId: 'radio-yes',
        inputType: 'radio',
        role: 'radio',
        label: 'Yes',
        value: 'Y',
        choiceGroup: { key: 'salutation', label: 'Salutation preference?' },
        rect: { x: 40, y: 40, width: 20, height: 20 },
      }),
      field({
        label: 'Agency Code',
        section: 'Policy',
        rect: { x: 10, y: 70, width: 100, height: 20 },
      }),
      field({
        label: 'Product Code',
        section: 'Policy',
        rect: { x: 10, y: 80, width: 100, height: 20 },
      }),
      field({
        label: 'Risk Location Number',
        section: 'Policy',
        rect: { x: 10, y: 90, width: 100, height: 20 },
      }),
      field({
        inputType: 'checkbox',
        role: 'checkbox',
        label: 'Fire protection selected',
        section: 'Coverage',
        rect: { x: 10, y: 100, width: 20, height: 20 },
      }),
      field({
        tag: 'button',
        inputType: 'button',
        role: 'button',
        label: 'Next',
        ordinaryNext: true,
        rect: { x: 10, y: 120, width: 100, height: 20 },
      }),
      field({
        tag: 'button',
        inputType: 'button',
        role: 'button',
        label: 'Add Applicant',
        section: 'Applicants',
        rect: { x: 120, y: 120, width: 100, height: 20 },
      }),
    ];
    const observation: PageObservation = {
      version: '2.0',
      tabId,
      origin: carrierOrigin,
      pageStateId: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      routeId: 'route',
      fingerprint: 'a'.repeat(64),
      textFingerprint: 'b'.repeat(64),
      title: 'Quote',
      pageText: sentinel,
      headings: ['Applicant'],
      controls,
      errors: [sentinel],
      authenticationRequired: false,
      unsupportedFrames: 0,
      omittedControls: 0,
      capturedAt: new Date().toISOString(),
    };
    const trainingObservation = {
      version: observation.version,
      tabId: observation.tabId,
      origin: observation.origin,
      pageStateId: observation.pageStateId,
      documentId: observation.documentId,
      routeId: hash(observation.routeId),
      fingerprint: observation.fingerprint,
      title: '',
      headings: [],
      controls: observation.controls.map(snapshot),
      authenticationRequired: observation.authenticationRequired,
      unsupportedFrames: observation.unsupportedFrames,
      omittedControls: observation.omittedControls,
      capturedAt: observation.capturedAt,
    };
    expect(JSON.stringify(trainingObservation)).not.toContain(sentinel);
    const unsafeObservation = structuredClone(trainingObservation);
    unsafeObservation.controls[0]!.label = sentinel;
    await expect(
      service.capture(started.training.trainingId, started.token, {
        revision: started.training.revision,
        observation: unsafeObservation,
      }),
    ).rejects.toMatchObject({ code: 'unsafe_training_structure' });
    const forgedOperationalTarget = structuredClone(trainingObservation);
    forgedOperationalTarget.controls[0]!.operationalTarget = 'agency_operational';
    await expect(
      service.capture(started.training.trainingId, started.token, {
        revision: started.training.revision,
        observation: forgedOperationalTarget,
      }),
    ).rejects.toMatchObject({ code: 'unsafe_training_structure' });
    const unsafeStructureCases: Array<(value: TrainingPageObservation) => void> = [
      (value) => {
        value.controls[0]!.inputType = sentinel;
      },
      (value) => {
        value.controls[0]!.role = sentinel;
      },
      (value) => {
        value.controls[0]!.elementId = sentinel;
      },
      (value) => {
        value.controls[0]!.key = sentinel;
      },
      (value) => {
        value.routeId = sentinel;
      },
      (value) => {
        value.title = sentinel;
      },
      (value) => {
        value.headings = [sentinel];
      },
    ];
    for (const mutate of unsafeStructureCases) {
      const unsafe = structuredClone(trainingObservation);
      mutate(unsafe);
      await expect(
        service.capture(started.training.trainingId, started.token, {
          revision: started.training.revision,
          observation: unsafe,
        }),
      ).rejects.toMatchObject({ code: 'unsafe_training_structure' });
    }
    const captured = await service.capture(started.training.trainingId, started.token, {
      revision: started.training.revision,
      observation: trainingObservation,
    });
    await expect(
      service.capture(started.training.trainingId, started.token, {
        revision: captured.training.revision,
        observation: trainingObservation,
      }),
    ).rejects.toMatchObject({ code: 'duplicate_training_page' });
    expect(captured.page.fields).toHaveLength(6);
    const radio = captured.page.fields.find((item) => item.control.inputType === 'radio');
    expect(radio?.control).toMatchObject({
      label: semanticHash('Salutation preference?'),
      options: [
        { value: semanticHash('N'), label: semanticHash('No') },
        { value: semanticHash('Y'), label: semanticHash('Yes') },
      ],
    });
    expect(JSON.stringify(captured)).not.toContain(sentinel);
    const textField = captured.page.fields.find((item) => item.control.inputType === 'text')!;
    const agencyField = captured.page.fields.find(
      (item) => item.control.label === semanticHash('Agency Code'),
    )!;
    const productField = captured.page.fields.find(
      (item) => item.control.label === semanticHash('Product Code'),
    )!;
    const locationField = captured.page.fields.find(
      (item) => item.control.label === semanticHash('Risk Location Number'),
    )!;
    const protectionField = captured.page.fields.find(
      (item) => item.control.label === semanticHash('Fire protection selected'),
    )!;
    const nextControl = captured.page.workflowControls.find(
      (item) => item.kind === 'ordinary_next',
    )!;
    const ignoredAddControl = captured.page.workflowControls.find(
      (item) => item.kind === 'add_entity',
    )!;
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: textField.fieldId,
            disposition: {
              kind: 'fixed_value',
              value: 'invented customer fact',
              classification: 'agency_operational',
              reason: 'approved_agency_identifier',
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'unsafe_mapping_disposition' });
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: protectionField.fieldId,
            disposition: {
              kind: 'source',
              references: [
                {
                  binding: 'fixed',
                  sourcePath: 'selectedProtections',
                  sourcePathPattern: 'selectedProtections',
                },
              ],
              transform: { kind: 'multiselect_membership', member: 'flood' },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'incompatible_mapping_transform' });
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: radio!.fieldId,
            disposition: {
              kind: 'source',
              references: [
                {
                  binding: 'fixed',
                  sourcePath: 'policyForm',
                  sourcePathPattern: 'policyForm',
                },
              ],
              transform: { kind: 'enum', cases: [{ source: 'HO3', target: 'UNKNOWN' }] },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'incompatible_mapping_transform' });
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: textField.fieldId,
            disposition: {
              kind: 'source',
              references: [
                {
                  binding: 'fixed',
                  sourcePath: 'applicant1.firstName',
                  sourcePathPattern: 'applicant*.firstName',
                },
              ],
              transform: { kind: 'boolean', trueValue: 'Y', falseValue: 'N' },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'incompatible_mapping_transform' });
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: textField.fieldId,
            disposition: {
              kind: 'source',
              references: [
                {
                  binding: 'fixed',
                  sourcePath: 'applicant1.firstName',
                  sourcePathPattern: 'applicant*.firstName',
                },
              ],
              transform: { kind: 'compose', separator: ' ' },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'incompatible_mapping_transform' });
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: productField.fieldId,
            disposition: {
              kind: 'fixed_value',
              value: 'HOME',
              classification: 'carrier_operational',
              reason: 'approved_carrier_identifier',
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'unsafe_mapping_disposition' });
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [{ fieldId: locationField.fieldId, disposition: { kind: 'carrier_default' } }],
      }),
    ).rejects.toMatchObject({ code: 'unsafe_mapping_disposition' });
    await expect(
      service.savePage(started.training.trainingId, captured.page.pageId, started.token, {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: textField.fieldId,
            disposition: {
              kind: 'source',
              references: [
                {
                  binding: 'same_position',
                  sourcePathPattern: 'applicant*.firstName',
                  sourceIndexBase: 0,
                },
              ],
              transform: { kind: 'identity' },
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'unknown_mia_catalog_field' });
    const mapped = await service.savePage(
      started.training.trainingId,
      captured.page.pageId,
      started.token,
      {
        revision: captured.training.revision,
        fields: [
          {
            fieldId: textField.fieldId,
            repeatBinding: { entityType: 'applicant', index: 0 },
            disposition: {
              kind: 'source',
              references: [
                {
                  binding: 'same_position',
                  sourcePathPattern: 'applicant*.firstName',
                  sourceIndexBase: 1,
                },
              ],
              transform: { kind: 'identity' },
            },
          },
          { fieldId: radio!.fieldId, disposition: { kind: 'leave_blank' } },
          {
            fieldId: agencyField.fieldId,
            disposition: {
              kind: 'fixed_value',
              value: 'TEST-AGENCY',
              classification: 'agency_operational',
              reason: 'approved_agency_identifier',
            },
          },
          { fieldId: productField.fieldId, disposition: { kind: 'human_required' } },
          { fieldId: locationField.fieldId, disposition: { kind: 'human_required' } },
          {
            fieldId: protectionField.fieldId,
            disposition: {
              kind: 'source',
              references: [
                {
                  binding: 'fixed',
                  sourcePath: 'selectedProtections',
                  sourcePathPattern: 'selectedProtections',
                },
              ],
              transform: { kind: 'multiselect_membership', member: 'fire' },
            },
          },
        ],
      },
    );
    await expect(
      service.publish(started.training.trainingId, started.token, {
        revision: mapped.training.revision,
      }),
    ).rejects.toMatchObject({ code: 'workflow_control_decision_required' });
    const saved = await service.savePage(
      started.training.trainingId,
      captured.page.pageId,
      started.token,
      {
        revision: mapped.training.revision,
        fields: [],
        workflowControls: [
          { workflowControlId: nextControl.workflowControlId, decision: 'use' },
          { workflowControlId: ignoredAddControl.workflowControlId, decision: 'ignore' },
        ],
      },
    );
    expect(
      saved.page.fields.find((item) => item.fieldId === textField.fieldId)?.repeatEntityType,
    ).toBe('applicant');
    const published = await service.publish(started.training.trainingId, started.token, {
      revision: saved.training.revision,
    });
    const serialized = JSON.stringify(published.mapping);
    expect(serialized).not.toContain(sentinel);
    expect(serialized).not.toContain('screenshot');
    expect(serialized).not.toContain('pageText');
    expect(serialized).not.toContain('quoteId');
    expect(serialized).not.toContain('elementId');
    expect(serialized).not.toContain('Salutation preference?');
    expect(serialized).not.toContain('Agency Code');
    expect(published.mapping.pages[0]?.fields[0]?.target.repeatEntityType).toBe('applicant');
    expect(published.mapping.pages[0]?.workflowControls).toHaveLength(1);
    expect(published.mapping.pages[0]?.workflowControls[0]?.kind).toBe('ordinary_next');

    const jobId = crypto.randomUUID();
    const jobToken = `${'a'.repeat(64)}.${'b'.repeat(43)}`;
    await jobs.create('a'.repeat(64), jobId, {
      view: {
        version: '2.0',
        jobId,
        revision: 7,
        status: 'page_complete',
        binding: {
          tenantId: 'tenant',
          userId: 'user',
          quoteId: 'synthetic-quote',
          carrierOrigin,
          tabId,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        verified: 2,
        failed: 0,
        reviews: [],
      },
      tokenHash: createHash('sha256').update(jobToken).digest('hex'),
      miaOrigin,
      sourceToken: 'synthetic-source-token',
      sourceRevision: 'synthetic-revision',
      mappingId: published.mapping.mappingId,
      mappingVersion: published.mapping.mappingVersion,
      completedMappingPageIds: published.mapping.pages.map((page) => page.pageId),
      verifiedMappingFieldIds: published.mapping.pages.flatMap((page) =>
        page.fields
          .filter((item) =>
            ['source', 'fixed_value', 'carrier_default'].includes(item.disposition.kind),
          )
          .map((item) => item.fieldId),
      ),
      verifiedMappingWorkflowControlIds: published.mapping.pages.flatMap((page) =>
        page.workflowControls.map((item) => item.workflowControlId),
      ),
      page: null,
      attempts: {},
      verifiedControls: [],
      recentResults: [],
      audit: [],
      actionCount: 2,
      lastFingerprint: '',
      unchangedCount: 0,
      pending: null,
      queued: [],
      lastBatchId: null,
    });
    await expect(
      service.verify(started.training.trainingId, started.token, {
        revision: published.training.revision,
        mappingVersion: published.mapping.mappingVersion,
        jobId,
        jobToken: `${'a'.repeat(64)}.${'c'.repeat(43)}`,
      }),
    ).rejects.toMatchObject({ code: 'invalid_mapping_test_evidence' });
    const verified = await service.verify(started.training.trainingId, started.token, {
      revision: published.training.revision,
      mappingVersion: published.mapping.mappingVersion,
      jobId,
      jobToken,
    });
    expect(verified.mapping.status).toBe('verified');
    expect(verified.mapping.verification.evidenceDigests).toHaveLength(1);
    const active = await service.activate(started.training.trainingId, started.token, {
      revision: verified.training.revision,
      mappingVersion: verified.mapping.mappingVersion,
    });
    expect(active.mapping.status).toBe('active');
  });

  it('numbers fields and reviewed workflow controls monotonically across captured pages', async () => {
    const service = new TrainingService(
      new MemoryTrainingSessionStore(),
      { redeem: (request) => Promise.resolve(grant(request.tabId)) },
      new MemoryMappingRegistryStore(),
      {
        miaOrigins: new Set([miaOrigin]),
        carrierOrigins: new Set([carrierOrigin]),
        principals: new Set([principal]),
      },
      new MemoryCheckpointStore(),
    );
    const tabId = 19;
    const started = await service.start({
      miaOrigin,
      code: 'c'.repeat(32),
      verifier: 'v'.repeat(43),
      carrierOrigin,
      carrierBaseUrl: `${carrierOrigin}/quote`,
      tabId,
      formType: 'home',
      workflowName: 'Sequential training',
    });
    const firstNext = field({
      tag: 'button',
      inputType: 'button',
      role: 'button',
      label: 'Next',
      ordinaryNext: true,
      rect: { x: 10, y: 10, width: 80, height: 20 },
    });
    const firstField = field({ rect: { x: 10, y: 30, width: 100, height: 20 } });
    const first = await service.capture(started.training.trainingId, started.token, {
      revision: started.training.revision,
      observation: trainingObservation(tabId, 'page-one', '1'.repeat(64), [firstField, firstNext]),
    });
    expect(first.page.workflowControls[0]?.sequence).toBe(1);
    expect(first.page.fields[0]?.sequence).toBe(2);

    const secondField = field({
      label: 'Last name',
      rect: { x: 10, y: 5, width: 100, height: 20 },
    });
    const addApplicant = field({
      tag: 'button',
      inputType: 'button',
      role: 'button',
      label: 'Add Applicant',
      rect: { x: 10, y: 15, width: 100, height: 20 },
    });
    const secondNext = field({
      tag: 'button',
      inputType: 'button',
      role: 'button',
      label: 'Continue',
      ordinaryNext: true,
      rect: { x: 10, y: 25, width: 100, height: 20 },
    });
    const second = await service.capture(started.training.trainingId, started.token, {
      revision: first.training.revision,
      observation: trainingObservation(tabId, 'page-two', '2'.repeat(64), [
        secondNext,
        addApplicant,
        secondField,
      ]),
    });
    const sequences = second.training.pages
      .flatMap((page) => [
        ...page.fields.map((item) => item.sequence),
        ...page.workflowControls.map((item) => item.sequence),
      ])
      .sort((left, right) => left - right);
    expect(sequences).toEqual([1, 2, 3, 4, 5]);
    expect(second.page.fields[0]?.sequence).toBe(3);
    expect(second.page.workflowControls.map((item) => item.sequence)).toEqual([4, 5]);

    const ordinalDriver = field({
      label: 'Second Driver Given Name',
      section: 'Drivers',
      rect: { x: 10, y: 5, width: 100, height: 20 },
    });
    const firstVin = field({
      label: 'VIN',
      section: 'Vehicle Information',
      rect: { x: 10, y: 25, width: 100, height: 20 },
    });
    const secondVin = field({
      label: 'VIN',
      section: 'Vehicle Information',
      rect: { x: 10, y: 45, width: 100, height: 20 },
    });
    const third = await service.capture(started.training.trainingId, started.token, {
      revision: second.training.revision,
      observation: trainingObservation(tabId, 'page-three', '3'.repeat(64), [
        secondVin,
        ordinalDriver,
        firstVin,
      ]),
    });
    expect(third.page.fields.map((item) => item.sequence)).toEqual([6, 7, 8]);
    expect(third.page.fields[0]).toMatchObject({
      repeatIndex: 1,
      repeatEntityType: 'additionalDriver',
    });
    expect(third.page.fields.slice(1).map((item) => item.repeatIndex)).toEqual([0, 1]);
    expect(third.page.fields[1]?.groupKey).toBe(third.page.fields[2]?.groupKey);
  });
});

describe('training page previews', () => {
  it('snapshots partial choices without completing the draft or enabling navigation', async () => {
    const { service, registry, start } = recoveryHarness();
    const session = await start(7);
    const captured = await service.capture(session.training.trainingId, session.token, {
      revision: 0,
      observation: trainingObservation(7, 'page-one', '1'.repeat(64), [
        field({}),
        field({ label: 'Last name' }),
        field({
          tag: 'button',
          inputType: 'button',
          role: 'button',
          label: 'Next',
          ordinaryNext: true,
        }),
      ]),
    });
    const saved = await service.savePage(
      session.training.trainingId,
      captured.page.pageId,
      session.token,
      {
        revision: captured.training.revision,
        fields: [{ fieldId: captured.page.fields[0]!.fieldId, disposition: { kind: 'ignore' } }],
        workflowControls: captured.page.workflowControls.map((control) => ({
          workflowControlId: control.workflowControlId,
          decision: 'use',
        })),
      },
    );
    const preview = await service.preview(session.training.trainingId, session.token, {
      revision: saved.training.revision,
      pageId: captured.page.pageId,
    });
    expect(preview.training).toEqual(saved.training);
    expect(preview.training.status).toBe('draft');
    expect(preview.mapping).toMatchObject({
      status: 'preview',
      preview: {
        trainingId: session.training.trainingId,
        revision: saved.training.revision,
        pageId: captured.page.pageId,
        tabId: 7,
      },
    });
    expect(preview.mapping.pages[0]!.fields).toHaveLength(1);
    expect(preview.mapping.pages[0]!.workflowControls).toEqual([]);
    await expect(registry.publish({ ...preview.mapping })).rejects.toThrow(
      'mapping_version_exists',
    );
    const changed = await service.savePage(
      session.training.trainingId,
      captured.page.pageId,
      session.token,
      {
        revision: saved.training.revision,
        fields: [{ fieldId: captured.page.fields[0]!.fieldId, disposition: null }],
      },
    );
    expect(changed.page.fields[0]!.disposition).toBeNull();
    const scope = { tenantId: 'tenant', carrierOrigin, lineOfBusiness: 'home' as const };
    expect(
      (await registry.get(scope, preview.mapping.mappingId, 1))!.pages[0]!.fields[0]!.disposition,
    ).toEqual({ kind: 'ignore' });
    await expect(
      registry.recordVerification(scope, preview.mapping.mappingId, 1, {
        pageIds: [captured.page.pageId],
        fieldIds: [],
        workflowControlIds: [],
        evidenceDigest: 'a'.repeat(64),
      }),
    ).rejects.toThrow('mapping_not_testable');
    await expect(registry.setActive(scope, preview.mapping.mappingId, 1)).rejects.toThrow();
    expect((await service.library(session.training.trainingId, session.token)).mappings).toEqual(
      [],
    );
    await expect(
      service.publish(session.training.trainingId, session.token, {
        revision: changed.training.revision,
      }),
    ).rejects.toMatchObject({ code: 'unmapped_training_field' });
    await expect(
      service.preview(session.training.trainingId, session.token, {
        revision: saved.training.revision,
        pageId: captured.page.pageId,
      }),
    ).rejects.toThrow('revision_conflict');
    await expect(
      service.preview(session.training.trainingId, session.token, {
        revision: changed.training.revision,
        pageId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('copies a published version into a draft while preserving the original and version lineage', async () => {
    const { service, registry, start, savedDraft } = recoveryHarness();
    const old = await savedDraft();
    const published = await service.publish(old.training.trainingId, old.token, {
      revision: old.training.revision,
    });
    const fresh = await start(19);
    const editing = await service.editMapping(fresh.training.trainingId, fresh.token, {
      revision: 0,
      mappingId: published.mapping.mappingId,
      mappingVersion: published.mapping.mappingVersion,
    });
    expect(editing.training.status).toBe('draft');
    expect(editing.training.pages[0]!.fields[0]!.fieldId).toBe(
      old.training.pages[0]!.fields[0]!.fieldId,
    );
    const preview = await service.preview(fresh.training.trainingId, fresh.token, {
      revision: editing.training.revision,
      pageId: editing.training.pages[0]!.pageId,
    });
    expect(preview.mapping.mappingId).not.toBe(published.mapping.mappingId);
    const replacement = await service.publish(fresh.training.trainingId, fresh.token, {
      revision: editing.training.revision,
    });
    expect(replacement.mapping.mappingId).toBe(published.mapping.mappingId);
    expect(replacement.mapping.mappingVersion).toBe(2);
    expect(
      await registry.get(
        { tenantId: 'tenant', carrierOrigin, lineOfBusiness: 'home' },
        published.mapping.mappingId,
        1,
      ),
    ).toEqual(published.mapping);
    await expect(
      service.editMapping(fresh.training.trainingId, fresh.token, {
        revision: replacement.training.revision,
        mappingId: published.mapping.mappingId,
        mappingVersion: 1,
      }),
    ).rejects.toThrow();
  });
});

it('restricts preview jobs to the trainer, tab, page and explicit test selection', async () => {
  const { service, registry, savedDraft } = recoveryHarness();
  const draft = await savedDraft();
  const preview = await service.preview(draft.training.trainingId, draft.token, {
    revision: draft.training.revision,
    pageId: draft.training.pages[0]!.pageId,
  });
  const identity = { userId: 'user' };
  const runtime = new ActiveTabJobService(
    new MemoryCheckpointStore(),
    {
      redeem: (request) =>
        Promise.resolve({
          version: '2.0',
          binding: {
            tenantId: 'tenant',
            userId: identity.userId,
            quoteId: 'synthetic',
            carrierOrigin,
            tabId: request.tabId,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
          sourceToken: 's'.repeat(43),
          source: {
            version: '2.0',
            tenantId: 'tenant',
            userId: identity.userId,
            quoteId: 'synthetic',
            formType: 'home',
            revision: '1',
            answers: [],
            unavailablePaths: [],
          },
        }),
      read: () =>
        Promise.resolve({
          version: '2.0',
          tenantId: 'tenant',
          userId: identity.userId,
          quoteId: 'synthetic',
          formType: 'home',
          revision: '1',
          answers: [],
          unavailablePaths: [],
        }),
      revoke: () => Promise.resolve(),
    },
    registry,
    {
      miaOrigins: new Set([miaOrigin]),
      carrierOrigins: new Set([carrierOrigin]),
      principals: new Set(['tenant/user', 'tenant/other']),
      autoNext: true,
    },
  );
  const request = {
    miaOrigin,
    code: 'c'.repeat(32),
    verifier: 'v'.repeat(43),
    carrierOrigin,
    carrierPageUrl: carrierOrigin,
    tabId: 7,
  };
  const selection = { mode: 'testable', mappingId: preview.mapping.mappingId, mappingVersion: 1 };
  await expect(runtime.start(request)).rejects.toMatchObject({ code: 'mapping_not_trained' });
  await expect(
    runtime.start({
      ...request,
      mappingSelection: { ...selection, mappingId: crypto.randomUUID() },
    }),
  ).rejects.toMatchObject({ status: 409, code: 'mapping_selection_unavailable' });
  await expect(
    runtime.start({ ...request, tabId: 8, mappingSelection: selection }),
  ).rejects.toMatchObject({ status: 409, code: 'preview_tab_changed' });
  identity.userId = 'other';
  await expect(runtime.start({ ...request, mappingSelection: selection })).rejects.toMatchObject({
    status: 409,
    code: 'preview_owner_changed',
  });
  identity.userId = 'user';
  const job = await runtime.start({ ...request, mappingSelection: selection });
  await expect(
    runtime.observe(job.job.jobId, job.token, {
      revision: job.job.revision,
      resume: false,
      observation: {
        version: '2.0',
        tabId: 7,
        origin: carrierOrigin,
        pageStateId: crypto.randomUUID(),
        documentId: 'synthetic',
        routeId: 'b'.repeat(64),
        fingerprint: 'a'.repeat(64),
        title: '',
        headings: [],
        controls: [],
        errors: [],
        authenticationRequired: false,
        unsupportedFrames: 0,
        omittedControls: 0,
        capturedAt: new Date().toISOString(),
        capture: { complete: true, unexpanded: 0, mode: 'targeted' },
      },
    }),
  ).rejects.toMatchObject({ code: 'preview_page_changed' });
  expect((await runtime.read(job.job.jobId, job.token)).status).toBe('paused');
  await expect(
    service.previewResult(draft.training.trainingId, draft.token, {
      revision: draft.training.revision,
      mappingVersion: 1,
      jobId: job.job.jobId,
      jobToken: 'a'.repeat(64) + '.' + 'x'.repeat(43),
    }),
  ).rejects.toMatchObject({ status: 401 });
});
