import { syntheticQuote } from '@smartmapper/mia-client';
import { describe, expect, it } from 'vitest';

import { buildMapping, type MiaSnapshotField } from './smart-map.js';

/*
 * End-to-end coverage of every page in the synthetic carrier lab, in both its default and its
 * changed-layout wording. These are the snapshots the MIA extension produces for apps/mock-carriers,
 * so a regression here is a regression a teammate would see in the browser.
 */

function field(id: string, label: string, type = 'text', tag = 'input'): MiaSnapshotField {
  return { id, tag, type, label, nearbyText: [] };
}

function mapPage(fields: MiaSnapshotField[]) {
  const { mapping } = buildMapping(syntheticQuote, { fields });
  return {
    byPath: new Map(mapping.assignments.map((entry) => [entry.source_path, entry])),
    filledIds: new Set(mapping.assignments.map((entry) => entry.field_id)),
    mapping,
  };
}

describe('modern flow', () => {
  it.each([
    ['default wording', 'First name', 'Date of birth', 'State'],
    ['changed layout', 'Given name', 'Birth date', 'Residence state'],
  ])('fills the applicant step using %s', (_name, firstName, birth, state) => {
    const { byPath } = mapPage([
      field('field_1', firstName),
      field('field_2', birth, 'date'),
      field('field_3', state, 'select-one', 'select'),
    ]);

    expect(byPath.get('applicant.firstName')?.value).toBe('Avery');
    // A native date input takes ISO, not the US format a text box would get.
    expect(byPath.get('applicant.dateOfBirth')?.value).toBe('1990-04-12');
    expect(byPath.get('applicant.address.stateCode')?.value).toBe('IL');
  });

  it.each([
    ['default wording', 'Driver date of birth', 'Vehicle year'],
    ['changed layout', 'Driver birth date', 'Model year'],
  ])('keeps the two drivers and vehicles apart using %s', (_name, driverBirth, vehicleYear) => {
    const { byPath } = mapPage([
      field('field_1', driverBirth, 'date'),
      field('field_2', 'Second driver date of birth', 'date'),
      field('field_3', vehicleYear, 'number'),
      field('field_4', 'Vehicle make'),
      field('field_5', 'Second vehicle year', 'number'),
    ]);

    expect(byPath.get('drivers[0].dateOfBirth')?.field_id).toBe('field_1');
    expect(byPath.get('drivers[1].dateOfBirth')?.field_id).toBe('field_2');
    expect(byPath.get('drivers[0].dateOfBirth')?.value).toBe('1990-04-12');
    expect(byPath.get('drivers[1].dateOfBirth')?.value).toBe('1992-08-21');

    expect(byPath.get('vehicles[0].year')?.field_id).toBe('field_3');
    expect(byPath.get('vehicles[1].year')?.field_id).toBe('field_5');
    expect(byPath.get('vehicles[0].make')?.value).toBe('Example Motors');
  });

  it('leaves the deliberately ambiguous usage field alone', () => {
    const { filledIds } = mapPage([
      field('field_1', 'Vehicle year', 'number'),
      field('field_2', 'Usage details'),
    ]);

    expect(filledIds.has('field_2')).toBe(false);
  });
});

describe('classic flow', () => {
  it.each([
    [
      'default wording',
      'Applicant first name',
      'Applicant last name',
      'Contact phone',
      'Year built',
    ],
    [
      'changed layout',
      'Named applicant given name',
      'Named applicant surname',
      'Telephone',
      'Construction year',
    ],
  ])('fills the risk worksheet using %s', (_name, first, last, phone, year) => {
    const { byPath } = mapPage([
      field('field_1', first),
      field('field_2', last),
      field('field_3', phone, 'tel'),
      field('field_4', year, 'number'),
    ]);

    expect(byPath.get('applicant.firstName')?.value).toBe('Avery');
    expect(byPath.get('applicant.lastName')?.value).toBe('Example');
    expect(byPath.get('applicant.phone')?.value).toBe('5550100000');
    expect(byPath.get('properties[0].yearBuilt')?.value).toBe('2005');
  });

  it.each([
    ['default wording', 'Driver given name', 'Auto make'],
    ['changed layout', 'Listed driver first name', 'Vehicle manufacturer'],
  ])('keeps the two listed drivers and autos apart using %s', (_name, driver, make) => {
    const { byPath } = mapPage([
      field('field_1', driver),
      field('field_2', 'Second driver given name'),
      field('field_3', make),
      field('field_4', 'Second auto make'),
    ]);

    expect(byPath.get('drivers[0].firstName')?.value).toBe('Avery');
    expect(byPath.get('drivers[1].firstName')?.value).toBe('Riley');
    expect(byPath.get('vehicles[0].make')?.value).toBe('Example Motors');
    expect(byPath.get('vehicles[1].make')?.value).toBe('Sample Auto');
  });

  it.each([['Additional details (optional)'], ['Classification code']])(
    'leaves the deliberately ambiguous %s field alone',
    (label) => {
      const { filledIds } = mapPage([field('field_1', label, 'select-one', 'select')]);

      expect(filledIds.has('field_1')).toBe(false);
    },
  );
});

describe('the review step', () => {
  it('never targets the prohibited submit control', () => {
    const { mapping } = mapPage([
      field('field_1', 'Mock submit — prohibited for automation', 'submit', 'button'),
    ]);

    expect(mapping.assignments).toHaveLength(0);
  });
});
