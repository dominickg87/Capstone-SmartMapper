import { describe, expect, it } from 'vitest';
import {
  ExtensionMappingError,
  extensionPageIdentity,
  planExtensionMappings,
} from './extension-mapping.js';

const field = {
  id: 'field_1',
  tag: 'input',
  type: 'text',
  label: 'Given name',
  name: 'firstName',
  htmlId: 'first',
  required: true,
  disabled: false,
};
const snapshot = {
  href: 'http://127.0.0.1:4173/form',
  tabId: 1,
  documentId: 'synthetic-document',
  fields: [field],
};

describe('extension mapping plan', () => {
  it('returns schema-validated semantic actions without source values', () => {
    const plan = planExtensionMappings(snapshot);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.action).toMatchObject({
      type: 'fillText',
      sourcePath: 'applicant.firstName',
      version: '1.0',
    });
    expect(plan.steps[0]?.action).not.toHaveProperty('value');
  });
  it('translates the actual extension text/option wire format', () => {
    const plan = planExtensionMappings({
      ...snapshot,
      fields: [
        {
          ...field,
          tag: 'select',
          type: 'select',
          label: 'State',
          name: 'state',
          htmlId: 'state',
          nearbyText: 'Residence state',
          options: [{ text: 'Illinois', value: 'IL', selected: false, disabled: false }],
        },
      ],
    });
    expect(plan.steps[0]?.action).toMatchObject({
      type: 'selectOption',
      sourcePath: 'applicant.address.stateCode',
    });
    expect(plan.steps[0]?.field.options).toEqual([
      { label: 'Illinois', value: 'IL', disabled: false },
    ]);
  });
  it('refuses tied controls, readonly fields, custom widgets and prohibited contexts', () => {
    expect(
      planExtensionMappings({ ...snapshot, fields: [field, { ...field, id: 'field_2' }] }).skipped,
    ).toContainEqual({ source_path: 'applicant.firstName', reason: 'ambiguous_target' });
    expect(
      planExtensionMappings({ ...snapshot, fields: [{ ...field, readOnly: true }] }).steps,
    ).toHaveLength(0);
    expect(
      planExtensionMappings({ ...snapshot, fields: [{ ...field, tag: 'div' }] }).skipped[0]?.reason,
    ).toBe('unsupported_control');
    expect(
      planExtensionMappings({
        ...snapshot,
        fields: [{ ...field, section: 'Legal consent and signature' }],
      }).skipped[0]?.reason,
    ).toBe('prohibited_target_intent');
  });
  it('does not let dictionary order override a stronger conflicting field meaning', () => {
    const plan = planExtensionMappings({
      ...snapshot,
      fields: [{ ...field, label: 'State', name: 'state' }],
    });
    expect(plan.steps).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toBe('conflicting_target_signals');
  });
  it('enforces medium-risk confidence and validates the page boundary', () => {
    expect(
      planExtensionMappings({
        ...snapshot,
        fields: [{ ...field, label: '', name: 'dob', htmlId: '' }],
      }).skipped[0]?.reason,
    ).toBe('confidence_below_threshold');
    expect(() => planExtensionMappings({ ...snapshot, fields: 'untrusted' })).toThrow(
      'Invalid page snapshot',
    );
    expect(() => planExtensionMappings({ ...snapshot, fieldLimitReached: true })).toThrow(
      'field limit',
    );
  });
  it('binds the plan to the document and field layout without depending on entered values', () => {
    expect(extensionPageIdentity({ ...snapshot, fields: [{ ...field, hasValue: true }] })).toBe(
      extensionPageIdentity(snapshot),
    );
    expect(extensionPageIdentity({ ...snapshot, documentId: 'next-page' })).not.toBe(
      extensionPageIdentity(snapshot),
    );
    expect(
      extensionPageIdentity({ ...snapshot, fields: [{ ...field, label: 'Co-applicant' }] }),
    ).not.toBe(extensionPageIdentity(snapshot));
  });
  it('reports safe, specific failure reasons without echoing page data', () => {
    for (const [input, reason] of [
      [{ ...snapshot, fields: 'synthetic private page data' }, 'invalid_snapshot'],
      [{ ...snapshot, fieldLimitReached: true }, 'field_limit'],
      [{ ...snapshot, fields: [field, field] }, 'duplicate_field_ids'],
    ] as const) {
      expect(() => planExtensionMappings(input)).toThrow(ExtensionMappingError);
      try {
        planExtensionMappings(input);
      } catch (error) {
        expect(error).toHaveProperty('reasonCode', reason);
        expect((error as Error).message).not.toContain('synthetic private page data');
      }
    }
  });
});
