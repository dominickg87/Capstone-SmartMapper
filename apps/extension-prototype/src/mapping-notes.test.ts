import { describe, expect, it } from 'vitest';
import type { ReadPageData } from '@smartmapper/contracts';
import { homeownersCatalogSource, homeownersFields } from './homeowners-catalog.js';
import { createMappingNotes, NO_MIA_FIELD } from './mapping-notes.js';

const key = '00000000-0000-4000-8000-000000000001';
const page: ReadPageData = {
  pageOrigin: 'https://carrier.example.test/quote?secret=synthetic-secret#private',
  inaccessibleFrames: 0,
  unreadableControls: 0,
  truncated: false,
  fields: [
    {
      key,
      number: 1,
      label: 'Roof material',
      type: 'dropdown',
      section: 'Property',
      name: 'roof',
      id: 'roof-input',
      required: true,
      disabled: false,
      readOnly: false,
      visible: true,
      frame: 0,
      choices: [{ label: 'Metal', disabled: false }],
      choicesIncomplete: false,
    },
  ],
};

describe('Homeowners mapping notes', () => {
  it('bundles the complete regenerated Home catalog with both applicants', () => {
    expect(homeownersCatalogSource.definitionCount).toBe(120);
    expect(homeownersFields).toHaveLength(144);
    expect(new Set(homeownersFields.map((field) => field.sourcePath)).size).toBe(144);
    for (const sourcePath of [
      'applicant1.firstName',
      'applicant2.firstName',
      'roofType',
      'roofTypeOtherDescription',
      'coverageA_Dwelling',
    ])
      expect(homeownersFields.some((field) => field.sourcePath === sourcePath)).toBe(true);
    expect(homeownersFields.some((field) => field.sourcePath.includes('*'))).toBe(false);
  });
  it('exports numbered correspondences with source paths and choice labels', () => {
    const notes = createMappingNotes(page, { [key]: 'roofType' });
    expect(notes).toContain('1. Roof material = Home Quote Form / Roof Type [roofType]');
    expect(notes).toContain('Page field name: roof');
    expect(notes).toContain('Page choices: Metal');
    expect(notes).toContain('M.I.A. choices:');
    expect(notes).toContain('Website: https://carrier.example.test');
    expect(notes).not.toMatch(/synthetic-secret|\/quote|#private/);
  });
  it('keeps unmapped and explicitly unmatched fields in the worksheet', () => {
    expect(createMappingNotes(page, {})).toContain('1. Roof material = UNMAPPED');
    expect(createMappingNotes(page, { [key]: NO_MIA_FIELD })).toContain('NO MATCHING M.I.A. FIELD');
    expect(createMappingNotes(page, { [key]: 'private-unrecognized-path' })).not.toContain(
      'private-unrecognized-path',
    );
  });
  it('reports incomplete captures and disallows embedded line breaks in descriptions', () => {
    const changed = {
      ...page,
      inaccessibleFrames: 1,
      fields: [{ ...page.fields[0]!, label: 'Roof\nforged line', choicesIncomplete: true }],
    };
    const notes = createMappingNotes(changed, {});
    expect(notes).toContain('Incomplete capture: Yes');
    expect(notes).toContain('1. Roof forged line = UNMAPPED');
    expect(notes).toContain('Page choices are incomplete');
  });
  it('rejects answer-bearing structures before export', () => {
    const invalid = {
      ...page,
      fields: [{ ...page.fields[0]!, value: 'synthetic-private-answer' }],
    };
    expect(() => createMappingNotes(invalid, {})).toThrow();
  });
});
