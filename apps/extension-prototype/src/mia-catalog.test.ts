import { describe, expect, it } from 'vitest';
import { catalogFieldLabel, groupCatalogFields, MiaCatalogSchema } from './mia-catalog.js';

const field = {
  fieldId: 'mia:auto:additionalDrivers.4.dateOfBirth',
  sourcePath: 'additionalDrivers.4.dateOfBirth',
  sourcePattern: 'additionalDrivers.*.dateOfBirth',
  question: "What is this driver's date of birth?",
  section: 'Drivers',
  context: ['Additional driver'],
  options: [],
  conditions: [],
  conditionalReview: false,
  dataType: 'date' as const,
  entity: {
    key: 'additionalDrivers',
    type: 'additionalDriver',
    index: 4,
    position: 6,
    label: 'Driver 6',
  },
};

describe('M.I.A. training catalog', () => {
  it('keeps concrete repeated-entity fields and their human context', () => {
    const catalog = MiaCatalogSchema.parse({
      version: '2.0',
      schemaRevision: 'revision',
      formType: 'auto',
      entityLimits: [],
      templates: [],
      fields: [field],
    });
    expect(catalog.fields[0]?.sourcePath).toBe('additionalDrivers.4.dateOfBirth');
    expect(catalogFieldLabel(catalog.fields[0]!)).toBe(
      "What is this driver's date of birth? — Drivers / Driver 6 · Additional driver · additionalDrivers.4.dateOfBirth",
    );
    expect(groupCatalogFields(catalog.fields)[0]?.label).toBe('Drivers — Driver 6');
  });
});
