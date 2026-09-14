import { syntheticQuote } from '@smartmapper/mia-client';
import { describe, expect, it } from 'vitest';

import { buildMapping, toAccessibleControl, type MiaSnapshotField } from './smart-map.js';

function field(seed: MiaSnapshotField): MiaSnapshotField {
  return { tag: 'input', type: 'text', ...seed };
}

function mappingFor(fields: MiaSnapshotField[]) {
  return buildMapping(syntheticQuote, {
    href: 'http://localhost:4173/modern',
    pageTitle: 'Synthetic carrier lab',
    headings: ['Applicant details'],
    fields,
  }).mapping;
}

describe('mapping an extension page snapshot without a model', () => {
  it('fills values from the synthetic quote and names the evidence', () => {
    const mapping = mappingFor([
      field({ id: 'field_1', label: 'First name', autocomplete: 'given-name' }),
      field({ id: 'field_2', label: 'City' }),
    ]);

    expect(mapping.provider).toBe('deterministic-semantic-matcher');

    const firstName = mapping.assignments.find((entry) => entry.field_id === 'field_1');
    expect(firstName?.value).toBe(syntheticQuote.applicant.firstName);
    expect(firstName?.confidence).toBe(0.98);
    expect(firstName?.evidence).toContain('autocomplete');

    const city = mapping.assignments.find((entry) => entry.field_id === 'field_2');
    expect(city?.value).toBe(syntheticQuote.applicant.address.city);
  });

  it('recovers a field from an obfuscated legacy name attribute', () => {
    const mapping = mappingFor([
      field({ id: 'field_1', name: 'ctl00$ContentPlaceHolder1$txtLName' }),
    ]);

    const assignment = mapping.assignments.find(
      (entry) => entry.source_path === 'applicant.lastName',
    );
    expect(assignment?.value).toBe(syntheticQuote.applicant.lastName);
  });

  it('never fills a co-applicant control from the applicant', () => {
    const mapping = mappingFor([field({ id: 'field_1', label: 'Co-applicant last name' })]);

    expect(mapping.assignments).toHaveLength(0);
  });

  it('does not read a vehicle year as the year the home was built', () => {
    const mapping = mappingFor([field({ id: 'field_1', label: 'Vehicle year', type: 'number' })]);

    expect(
      mapping.assignments.some((entry) => entry.source_path === 'properties[0].yearBuilt'),
    ).toBe(false);
  });

  it('reports a tie instead of filling one of two identical controls', () => {
    const mapping = mappingFor([
      field({ id: 'field_1', label: 'Number of stories', type: 'number' }),
      field({ id: 'field_2', label: 'Number of stories', type: 'number' }),
    ]);

    expect(mapping.assignments).toHaveLength(0);
    expect(
      mapping.skipped.some(
        (entry) =>
          entry.source_path === 'properties[0].stories' && entry.reason.includes('Tied between'),
      ),
    ).toBe(true);
  });

  it('writes ISO into a native date input and US format into a text box', () => {
    const nativeDate = mappingFor([field({ id: 'field_1', label: 'Date of birth', type: 'date' })]);
    expect(nativeDate.assignments[0]?.value).toBe('1990-04-12');

    const textDate = mappingFor([field({ id: 'field_1', label: 'Date of birth', type: 'text' })]);
    expect(textDate.assignments[0]?.value).toBe('04/12/1990');
  });

  it('skips a control whose source value the quote does not carry', () => {
    // The synthetic applicant has no second address line; nothing may be invented for it.
    const mapping = mappingFor([field({ id: 'field_1', label: 'Apt, suite' })]);

    expect(mapping.assignments).toHaveLength(0);
    expect(mapping.skipped.some((entry) => entry.source_path === 'applicant.address.line2')).toBe(
      true,
    );
  });

  it('never targets a disabled control', () => {
    const mapping = mappingFor([field({ id: 'field_1', label: 'First name', disabled: true })]);

    expect(mapping.assignments).toHaveLength(0);
  });
});

describe('translating the inherited snapshot shape', () => {
  it('treats a select as an option control and keeps its options', () => {
    const control = toAccessibleControl({
      id: 'field_1',
      tag: 'select',
      type: 'select-one',
      label: 'State',
      options: [{ label: 'Illinois', value: 'IL' }],
    });

    expect(control.role).toBe('select');
    expect(control.inputType).toBeUndefined();
    expect(control.options).toEqual([{ label: 'Illinois', value: 'IL' }]);
  });

  it('folds table cell context into adjacent text', () => {
    const control = toAccessibleControl({
      id: 'field_1',
      tag: 'input',
      type: 'text',
      previousCellText: 'Last name',
      nearbyText: ['Required'],
    });

    expect(control.nearbyText).toEqual(['Last name', 'Required']);
  });

  it('carries the section through as the control container', () => {
    const control = toAccessibleControl({
      id: 'field_1',
      tag: 'input',
      type: 'text',
      section: 'Driver 1',
    });

    expect(control.containerKey).toBe('Driver 1');
    expect(control.containerLabel).toBe('Driver 1');
  });
});
