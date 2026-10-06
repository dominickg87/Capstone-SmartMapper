import { describe, expect, it } from 'vitest';
import type { MiaCatalogField, TrainingField } from '@smartmapper/contracts';
import {
  carrierBooleanTransform,
  carrierEnumCases,
  carrierFieldMetadata,
  defaultTransform,
  dispositionReady,
  mappingSummary,
} from './training-view.js';

const radioField: TrainingField = {
  fieldId: '00000000-0000-4000-8000-000000000001',
  sequence: 123,
  occurrence: 0,
  repeatIndex: null,
  repeatEntityType: null,
  groupKey: 'prior-loss',
  disposition: null,
  control: {
    elementId: 'e9',
    key: 'a'.repeat(64),
    tag: 'input',
    inputType: 'radio',
    role: 'radio',
    label: 'Any prior losses?',
    section: 'Loss history',
    context: [],
    required: true,
    disabled: false,
    humanOnly: false,
    ordinaryNext: false,
    choiceGroup: { key: 'priorLoss', label: 'Any prior losses?' },
    choiceValue: 'yes',
    addEntityType: null,
    operationalTarget: null,
    repeatHint: null,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
    rect: { x: 10, y: 20, width: 180, height: 50 },
  },
};

const catalogField: MiaCatalogField = {
  fieldId: 'mia-home-prior-loss',
  sourcePath: 'applicant1.priorLoss',
  sourcePattern: 'applicant*.priorLoss',
  question: 'Have you had any prior losses?',
  section: 'Loss History',
  context: ['Primary applicant'],
  options: [
    { value: true, label: 'Yes' },
    { value: false, label: 'No' },
  ],
  conditions: [],
  conditionalReview: false,
  dataType: 'boolean',
  entity: {
    key: 'applicants',
    type: 'applicant',
    index: 1,
    position: 1,
    label: 'Applicant 1',
  },
};

describe('training panel field presentation', () => {
  it('presents a native radio group as one logical carrier field with its choices', () => {
    expect([radioField]).toHaveLength(1);
    expect(carrierFieldMetadata(radioField)).toBe(
      'Loss history · radio group · 2 choices · required',
    );
  });

  it('distinguishes intentional blank and ignore from a missing mapping', () => {
    expect(mappingSummary(null, [catalogField])).toBe('Missing mapping');
    expect(mappingSummary({ kind: 'leave_blank' }, [catalogField])).toBe(
      'Leave optional field blank',
    );
    expect(mappingSummary({ kind: 'ignore' }, [catalogField])).toBe('Ignore / not applicable');
  });

  it('shows the M.I.A. question for a trained source reference', () => {
    expect(
      mappingSummary(
        {
          kind: 'source',
          references: [
            {
              binding: 'same_position',
              sourcePathPattern: 'applicant*.priorLoss',
              sourceIndexBase: 1,
            },
          ],
          transform: { kind: 'boolean', trueValue: 'yes', falseValue: 'no' },
        },
        [catalogField],
      ),
    ).toBe('Have you had any prior losses?');
  });

  it('requires a real fixed value and prevents intentionally blank required controls', () => {
    expect(
      dispositionReady(radioField, {
        kind: 'fixed_value',
        value: '',
        classification: 'agency_operational',
        reason: 'approved_agency_identifier',
      }),
    ).toBe(false);
    expect(dispositionReady(radioField, { kind: 'leave_blank' })).toBe(false);
    expect(
      dispositionReady(
        { ...radioField, control: { ...radioField.control, required: false } },
        {
          kind: 'leave_blank',
        },
      ),
    ).toBe(true);
  });

  it('uses typed membership for a multiselect source mapped to a carrier checkbox', () => {
    const multiselect = {
      ...catalogField,
      dataType: 'multiselect' as const,
      options: [
        { value: 'theft', label: 'Theft' },
        { value: 'water', label: 'Water' },
      ],
    };
    const checkbox = {
      ...radioField,
      control: { ...radioField.control, inputType: 'checkbox', role: 'checkbox' },
    };

    expect(defaultTransform(multiselect, checkbox)).toEqual({
      kind: 'multiselect_membership',
      member: 'theft',
    });
    expect(defaultTransform(multiselect, radioField)).toEqual({
      kind: 'multiselect_join',
      separator: ', ',
    });
  });

  it('stores only opaque carrier targets in boolean and enum transforms', () => {
    const privateField = {
      ...radioField,
      control: {
        ...radioField.control,
        options: [
          { value: `sha256:${'a'.repeat(64)}`, label: `sha256:${'b'.repeat(64)}` },
          { value: `sha256:${'c'.repeat(64)}`, label: `sha256:${'d'.repeat(64)}` },
        ],
      },
    };
    const booleanTransform = carrierBooleanTransform(privateField);
    const enumCases = carrierEnumCases(catalogField.options, privateField);
    const serialized = JSON.stringify({ booleanTransform, enumCases });

    expect(serialized).toContain(`sha256:${'a'.repeat(64)}`);
    expect(serialized).toContain(`sha256:${'c'.repeat(64)}`);
    expect(serialized).not.toContain('Any prior losses?');
    expect(enumCases.map((item) => item.target)).toEqual([
      `sha256:${'a'.repeat(64)}`,
      `sha256:${'c'.repeat(64)}`,
    ]);
  });

  it('does not accept same-position reuse without a detected carrier entity position', () => {
    expect(
      dispositionReady(radioField, {
        kind: 'source',
        references: [
          {
            binding: 'same_position',
            sourcePathPattern: 'additionalDrivers.*.dateOfBirth',
            sourceIndexBase: 0,
          },
        ],
        transform: { kind: 'identity' },
      }),
    ).toBe(false);
    expect(
      dispositionReady(
        radioField,
        {
          kind: 'source',
          references: [
            {
              binding: 'same_position',
              sourcePathPattern: 'additionalDrivers.*.dateOfBirth',
              sourceIndexBase: 0,
            },
          ],
          transform: { kind: 'identity' },
        },
        { entityType: 'additionalDriver', index: 1 },
      ),
    ).toBe(true);
  });
});
