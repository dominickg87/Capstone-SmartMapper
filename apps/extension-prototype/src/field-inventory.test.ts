import { describe, expect, it } from 'vitest';
import type { MiaFieldCatalog, TrainingField, TrainingSessionView } from '@smartmapper/contracts';
import { createFieldInventory } from './field-inventory.js';

const optionKey = `sha256:${'a'.repeat(64)}`;
const field: TrainingField = {
  fieldId: '00000000-0000-4000-8000-000000000001',
  logicalFieldId: '00000000-0000-4000-8000-000000000002',
  sequence: 12,
  occurrence: 0,
  repeatIndex: null,
  repeatEntityType: null,
  groupKey: 'private-group',
  disposition: null,
  control: {
    elementId: 'private-element',
    key: 'private-key',
    tag: 'input',
    inputType: 'radio',
    role: 'radio',
    label: 'private-label',
    section: 'private-section',
    context: ['private-context'],
    required: true,
    disabled: false,
    humanOnly: false,
    ordinaryNext: false,
    choiceGroup: { key: 'private-choice-group', label: 'private-choice-label' },
    choiceValue: 'private-choice-value',
    addEntityType: null,
    operationalTarget: null,
    repeatHint: null,
    options: [
      { value: optionKey, label: 'private-option-label' },
      { value: 'private-option-value', label: 'private-option-label' },
    ],
    reference: { label: 'Currently insured?', section: 'Prior insurance', options: ['Yes', 'No'] },
    rect: { x: 10, y: 20, width: 100, height: 30 },
  },
};

const catalog: MiaFieldCatalog = {
  version: '2.0',
  schemaRevision: 'synthetic-home',
  formType: 'home',
  entityLimits: [],
  templates: [],
  fields: [
    {
      fieldId: 'currently-insured',
      sourcePath: 'applicant.currentlyInsured',
      sourcePattern: 'applicant.currentlyInsured',
      question: 'Currently insured?',
      section: 'Prior insurance',
      context: [],
      options: [
        { value: true, label: 'Yes' },
        { value: false, label: 'No' },
      ],
      conditions: [],
      conditionalReview: false,
      dataType: 'boolean',
      entity: null,
    },
  ],
};

const training: TrainingSessionView = {
  version: '2.0',
  trainingId: '00000000-0000-4000-8000-000000000003',
  revision: 4,
  status: 'draft',
  binding: {
    tenantId: 'private-tenant',
    userId: 'private-user',
    carrierOrigin: 'https://carrier.example.test',
    tabId: 23,
    formType: 'home',
    expiresAt: '2026-11-12T23:00:00.000Z',
  },
  workflow: {
    carrierOrigin: 'https://carrier.example.test',
    carrierBaseUrl: 'https://carrier.example.test/private-path',
    workflowName: 'private-workflow-name',
    lineOfBusiness: 'home',
  },
  catalogRevision: catalog.schemaRevision,
  mappingId: null,
  pages: [
    {
      pageId: '00000000-0000-4000-8000-000000000004',
      sequence: 2,
      scenarioLabel: 'private-scenario',
      routeId: 'private-route',
      fingerprint: 'b'.repeat(64),
      signature: 'c'.repeat(64),
      fields: [field],
      workflowControls: [
        {
          workflowControlId: '00000000-0000-4000-8000-000000000005',
          sequence: 13,
          kind: 'ordinary_next',
          entityType: null,
          decision: null,
          control: {
            ...field.control,
            tag: 'button',
            inputType: 'button',
            role: 'button',
            choiceGroup: null,
            options: [],
            reference: { label: 'Continue', section: '', options: [] },
          },
        },
      ],
    },
  ],
};

describe('field inventory export', () => {
  it('keeps reference numbers, grouped choices and the value-free source catalog for review', () => {
    const inventory = createFieldInventory(training, catalog);
    expect(inventory.pages[0]?.fields).toEqual([
      expect.objectContaining({
        fieldId: field.fieldId,
        logicalFieldId: field.logicalFieldId,
        number: 12,
        label: 'Currently insured?',
        type: 'radio group',
        required: true,
        disposition: null,
        options: [
          { number: 1, label: 'Yes', optionKey },
          { number: 2, label: 'No', optionKey: null },
        ],
      }),
    ]);
    expect(inventory.pages[0]?.workflowControls[0]).toMatchObject({
      number: 13,
      label: 'Continue',
      decision: null,
    });
    expect(inventory.miaCatalog).toEqual(catalog);
    expect(inventory.formatVersion).toBe(1);
    expect(training.pages[0]?.fields[0]?.disposition).toBeNull();
    expect(training.status).toBe('draft');
  });

  it('preserves each captured scenario and shared logical numbers without deduplicating proof targets', () => {
    const first = training.pages[0]!;
    const next = { ...first, pageId: '00000000-0000-4000-8000-000000000006', sequence: 3 };
    const inventory = createFieldInventory({ ...training, pages: [first, next] }, catalog);
    expect(inventory.pages.map((page) => page.number)).toEqual([2, 3]);
    expect(inventory.pages.map((page) => page.fields[0]?.number)).toEqual([12, 12]);
  });

  it('excludes session identity, URLs, free text, raw choices and fixed values', () => {
    const changed = structuredClone(training);
    changed.pages[0]!.fields[0]!.disposition = {
      kind: 'fixed_value',
      value: 'private-fixed-value',
      classification: 'agency_operational',
      reason: 'approved_agency_identifier',
    };
    const exported = JSON.stringify(createFieldInventory(changed, catalog));
    expect(exported).not.toContain('private-');
    expect(exported).not.toContain('carrier.example.test');
    for (const key of [
      'trainingId',
      'binding',
      'tabId',
      'tenantId',
      'userId',
      'rect',
      'choiceValue',
    ])
      expect(exported).not.toContain(`"${key}"`);
    expect(exported).toContain('fixed_value');
  });

  it('reapplies caption and choice allowlists and retains human-only omissions', () => {
    const changed = structuredClone(training);
    const control = changed.pages[0]!.fields[0]!.control;
    control.reference = {
      label: 'Jordan Example',
      section: 'jordan@example.test',
      options: ['Jordan Example', 'Synthetic Sedan'],
    };
    const exported = createFieldInventory(changed, catalog).pages[0]!.fields[0]!;
    expect(exported.label).toBe('Carrier field 12');
    expect(exported.section).toBe('Carrier section');
    expect(exported.options.map((option) => option.label)).toEqual([
      'Carrier option 1',
      'Carrier option 2',
    ]);
    control.options = [];
    control.humanOnly = true;
    expect(createFieldInventory(changed, catalog).pages[0]!.fields[0]).toMatchObject({
      humanOnly: true,
      options: [],
    });
  });

  it('rejects unexpected answer/session fields instead of serializing them', () => {
    expect(() =>
      createFieldInventory(
        { ...training, token: 'synthetic-secret' } as TrainingSessionView,
        catalog,
      ),
    ).toThrow('Could not export');
    const changed = structuredClone(training);
    Object.assign(changed.pages[0]!.fields[0]!.control, {
      value: 'synthetic-answer',
      checked: true,
    });
    expect(() => createFieldInventory(changed, catalog)).toThrow('Could not export');
    const changedCatalog = structuredClone(catalog);
    Object.assign(changedCatalog.fields[0]!, { value: 'synthetic-answer' });
    expect(() => createFieldInventory(training, changedCatalog)).toThrow('Could not export');
  });

  it('rejects empty captures and mismatched source catalogs', () => {
    expect(() => createFieldInventory({ ...training, pages: [] }, catalog)).toThrow(
      'Capture a carrier page',
    );
    expect(() => createFieldInventory(training, { ...catalog, formType: 'auto' })).toThrow(
      'catalog changed',
    );
    expect(() => createFieldInventory(training, { ...catalog, schemaRevision: 'new' })).toThrow(
      'catalog changed',
    );
  });
});
