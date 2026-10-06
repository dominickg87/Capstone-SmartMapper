import { describe, expect, it } from 'vitest';
import type { PageObservation } from '@smartmapper/contracts';
import { structuralTrainingObservation } from './training-observation.js';

const observation: PageObservation = {
  version: '2.0',
  tabId: 3,
  origin: 'https://carrier.example.test',
  pageStateId: 'page-state',
  documentId: 'document',
  routeId: 'route',
  fingerprint: 'a'.repeat(64),
  textFingerprint: 'b'.repeat(64),
  title: 'Jordan Secret quote',
  pageText: 'Customer secret',
  headings: ['Jordan Secret applicant'],
  controls: [
    {
      elementId: 'radio-yes',
      key: 'radio-key',
      tag: 'custom',
      inputType: '',
      role: 'radio',
      label: 'Yes',
      section: 'Prior insurance',
      context: [],
      value: 'yes-code',
      checked: true,
      required: true,
      requiredSatisfied: true,
      disabled: false,
      humanOnly: false,
      ordinaryNext: false,
      choiceGroup: { key: 'prior-insurance', label: 'Currently insured?' },
      options: [],
      errors: ['Customer-specific validation text'],
      rect: { x: 1, y: 2, width: 100, height: 20 },
    },
    {
      elementId: 'customer-name',
      key: 'customer-name-key',
      tag: 'input',
      inputType: 'text',
      role: 'textbox',
      label: 'Applicant Jordan Secret',
      section: 'Risk for Jordan Secret',
      context: ['jordan.secret@example.test', '504-555-1212'],
      value: 'Jordan Secret',
      checked: false,
      required: true,
      disabled: false,
      humanOnly: false,
      ordinaryNext: false,
      choiceGroup: null,
      options: [],
      errors: [],
      rect: { x: 1, y: 30, width: 100, height: 20 },
    },
    {
      elementId: 'insured-selector',
      key: 'insured-selector-key',
      tag: 'select',
      inputType: 'select-one',
      role: 'combobox',
      label: 'Named insured',
      section: 'Policy',
      context: [],
      value: 'CUSTOMER-000012345678',
      checked: false,
      required: false,
      disabled: false,
      humanOnly: false,
      ordinaryNext: false,
      choiceGroup: null,
      options: [
        { value: 'CUSTOMER-000012345678', label: 'Jordan Secret' },
        { value: 'CUSTOMER-999987654321', label: 'Taylor Example' },
      ],
      errors: [],
      rect: { x: 1, y: 60, width: 100, height: 20 },
    },
    {
      elementId: 'generic-record-selector',
      key: 'generic-record-selector-key',
      tag: 'select',
      inputType: 'select-one',
      role: 'combobox',
      label: 'Selection',
      section: 'Details',
      context: [],
      value: 'person-42',
      checked: false,
      required: false,
      disabled: false,
      humanOnly: false,
      ordinaryNext: false,
      choiceGroup: null,
      options: [
        { value: 'person-42', label: 'Casey Example' },
        { value: 'vehicle-1', label: '2021 Toyota Camry' },
      ],
      errors: [],
      rect: { x: 1, y: 90, width: 100, height: 20 },
    },
  ],
  errors: ['Page validation text'],
  authenticationRequired: false,
  unsupportedFrames: 0,
  omittedControls: 0,
  capturedAt: '2026-10-06T12:00:00.000Z',
};

describe('structural training observation', () => {
  it('omits customer values, validation text and page text', async () => {
    const structural = await structuralTrainingObservation(observation);
    const serialized = JSON.stringify(structural);

    expect(serialized).not.toContain('Customer secret');
    expect(serialized).not.toContain('Jordan Secret');
    expect(serialized).not.toContain('jordan.secret@example.test');
    expect(serialized).not.toContain('504-555-1212');
    expect(serialized).not.toContain('CUSTOMER-000012345678');
    expect(serialized).not.toContain('Taylor Example');
    expect(serialized).not.toContain('Casey Example');
    expect(serialized).not.toContain('2021 Toyota Camry');
    expect(serialized).not.toContain('person-42');
    expect(serialized).not.toContain('vehicle-1');
    expect(serialized).not.toContain('validation text');
    expect(structural.controls[0]).not.toHaveProperty('value');
    expect(structural.controls[0]).not.toHaveProperty('checked');
    expect(structural.controls[0]).not.toHaveProperty('errors');
    expect(structural.title).toBe('');
    expect(structural.headings).toEqual([]);
    expect(structural.controls[1]?.humanOnly).toBe(false);
    expect(structural.controls[1]?.label).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(structural.controls[2]).toMatchObject({ humanOnly: true, options: [] });
    expect(structural.controls[3]?.humanOnly).toBe(false);
    expect(structural.controls[3]?.options).toHaveLength(2);
  });

  it('retains a role-radio option as structural choice metadata', async () => {
    const structural = await structuralTrainingObservation(observation);

    expect(structural.controls[0]?.role).toBe('radio');
    expect(structural.controls[0]?.choiceValue).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(structural.controls[0]?.options).toEqual([]);
  });

  it('drops a sensitive radio choice identity and marks the control for a human', async () => {
    const unsafe = await structuralTrainingObservation({
      ...observation,
      controls: [
        {
          ...observation.controls[0]!,
          value: '123-45-6789',
          label: 'Choice for 123-45-6789',
          choiceGroup: { key: 'person-choice', label: 'Person 123-45-6789' },
        },
      ],
    });

    expect(JSON.stringify(unsafe)).not.toContain('123-45-6789');
    expect(unsafe.controls[0]).toMatchObject({ choiceValue: null, humanOnly: true });
  });

  it('retains a bounded static carrier option domain needed for deterministic mapping', async () => {
    const safe = await structuralTrainingObservation({
      ...observation,
      controls: [
        {
          ...observation.controls[2]!,
          elementId: 'state',
          key: 'state-key',
          label: 'State',
          value: 'LA',
          options: [
            { value: 'LA', label: 'Louisiana' },
            { value: 'TX', label: 'Texas' },
          ],
        },
      ],
    });

    expect(safe.controls[0]?.humanOnly).toBe(false);
    expect(safe.controls[0]?.options).toHaveLength(2);
    for (const option of safe.controls[0]?.options ?? []) {
      expect(option.value).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(option.label).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
    expect(JSON.stringify(safe)).not.toContain('Louisiana');
    expect(JSON.stringify(safe)).not.toContain('Texas');
  });

  it('keeps ordinary static residence and insurance choices trainable', async () => {
    const safe = await structuralTrainingObservation({
      ...observation,
      controls: [
        {
          ...observation.controls[2]!,
          elementId: 'residence-type',
          key: 'residence-type-key',
          label: 'Residence type',
          value: 'primary',
          options: [
            { value: 'primary', label: 'Primary residence' },
            { value: 'secondary', label: 'Secondary residence' },
          ],
        },
        {
          ...observation.controls[0]!,
          elementId: 'insured-yes',
          label: 'Yes currently insured',
          value: 'Y',
          choiceGroup: { key: 'current-insurance', label: 'Current insurance?' },
        },
        {
          ...observation.controls[0]!,
          elementId: 'insured-no',
          label: 'No current insurance',
          value: 'N',
          choiceGroup: { key: 'current-insurance', label: 'Current insurance?' },
        },
      ],
    });

    expect(safe.controls[0]?.humanOnly).toBe(false);
    expect(safe.controls[0]?.options).toHaveLength(2);
    expect(safe.controls[1]?.humanOnly).toBe(false);
    expect(safe.controls[1]?.choiceValue).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(safe.controls[2]?.humanOnly).toBe(false);
    expect(safe.controls[2]?.choiceValue).toMatch(/^sha256:[a-f0-9]{64}$/);
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain('Primary residence');
    expect(serialized).not.toContain('Secondary residence');
    expect(serialized).not.toContain('currently insured');
    expect(serialized).not.toContain('current insurance');
  });

  it('hashes unrecognized label, section and context text even when no input contains it', async () => {
    const privateOnly = await structuralTrainingObservation({
      ...observation,
      title: 'Taylor Example quote',
      headings: ['Taylor Example household'],
      controls: [
        {
          ...observation.controls[1]!,
          label: 'Taylor Example',
          section: 'Taylor Example household',
          context: ['Taylor Example owns a blue sedan'],
          inputType: 'Taylor Example',
          role: 'Taylor Example',
          value: '',
        },
      ],
    });
    const serialized = JSON.stringify(privateOnly);

    expect(serialized).not.toContain('Taylor Example');
    expect(serialized).not.toContain('blue sedan');
    expect(privateOnly.controls[0]?.label).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(privateOnly.controls[0]?.section).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(privateOnly.controls[0]?.context[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(privateOnly.controls[0]).toMatchObject({ inputType: '', role: '' });
  });

  it('never persists ambiguous name-like static text or carrier option text', async () => {
    const ambiguous = await structuralTrainingObservation({
      ...observation,
      controls: [
        {
          ...observation.controls[2]!,
          label: 'First Last',
          section: 'First Last',
          context: ['First Last'],
          value: 'GA',
          options: [{ value: 'GA', label: 'Georgia' }],
        },
      ],
    });
    const serialized = JSON.stringify(ambiguous);

    expect(serialized).not.toContain('First Last');
    expect(serialized).not.toContain('Georgia');
    expect(serialized).not.toContain('"GA"');
    expect(ambiguous.controls[0]?.humanOnly).toBe(false);
    expect(ambiguous.controls[0]?.options[0]?.value).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(ambiguous.controls[0]?.options[0]?.label).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('retains only enum-and-index hints for repeated rows and add controls', async () => {
    const hinted = await structuralTrainingObservation({
      ...observation,
      controls: [
        {
          ...observation.controls[1]!,
          label: 'Second driver given name',
          section: 'Drivers',
          value: '',
        },
        {
          ...observation.controls[1]!,
          elementId: 'add-vehicle',
          tag: 'button',
          inputType: 'button',
          role: 'button',
          label: 'Add another vehicle',
          section: 'Vehicles',
          value: '',
        },
      ],
    });

    expect(hinted.controls[0]?.repeatHint).toEqual({
      entityType: 'additionalDriver',
      index: 1,
    });
    expect(hinted.controls[1]?.addEntityType).toBe('vehicle');
    expect(JSON.stringify(hinted)).not.toContain('Second driver');
    expect(JSON.stringify(hinted)).not.toContain('Add another vehicle');
  });
});
