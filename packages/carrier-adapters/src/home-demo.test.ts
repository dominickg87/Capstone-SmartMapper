import { describe, expect, it } from 'vitest';
import type { PageObservation } from '@smartmapper/contracts';
import { valueDigest } from '@smartmapper/automation-core/active-tab';
import {
  homeDemoProfile,
  homeDemoRules,
  homeDemoDisposition,
  planHomeDemoField,
  sourceAt,
} from './home-demo.js';
async function pageFor(number: number): Promise<PageObservation> {
  const field = homeDemoProfile.fields.find((field) => field.number === number)!;
  return {
    version: '2.0',
    tabId: 1,
    origin: 'https://carrier.example.test',
    pageStateId: 'state',
    documentId: 'doc',
    routeId: 'route',
    fingerprint: 'a'.repeat(64),
    title: 'Synthetic Home',
    headings: [],
    errors: [],
    authenticationRequired: false,
    unsupportedFrames: 0,
    omittedControls: 0,
    capturedAt: new Date().toISOString(),
    controls: [
      {
        elementId: 'field',
        key: 'field',
        tag: field.type === 'dropdown' ? 'select' : 'input',
        inputType: 'text',
        role: field.type === 'dropdown' ? 'combobox' : 'textbox',
        label: field.label,
        section: '',
        context: [],
        value: '',
        checked: false,
        required: false,
        disabled: false,
        humanOnly: false,
        options: field.options
          .filter((option) => !option.disabled)
          .map((option, index) => ({ label: option.label, value: 'carrier-code-' + index })),
        errors: [],
        rect: { x: 0, y: 0, width: 100, height: 20 },
        locatorHints: { id: await valueDigest(field.id), name: await valueDigest(field.name) },
      },
    ],
  };
}
async function mapped(number: number, data: Record<string, unknown>) {
  const page = await pageFor(number);
  return {
    page,
    plan: await planHomeDemoField(
      homeDemoRules.find((rule) => rule.number === number)!,
      page,
      data,
    ),
  };
}
describe('deterministic Home demo crosswalk', () => {
  it('classifies every captured field and preserves all eleven user mappings', () => {
    expect(homeDemoProfile.fields).toHaveLength(198);
    expect(homeDemoRules).toHaveLength(52);
    expect(new Set(homeDemoRules.map((rule) => rule.number)).size).toBe(52);
    for (const field of homeDemoProfile.fields) {
      expect(['map', 'review', 'ignore']).toContain(homeDemoDisposition(field));
      if (field.sourcePath)
        expect(homeDemoRules.find((rule) => rule.number === field.number)?.paths).toContain(
          field.sourcePath,
        );
    }
    for (const number of [101, 103, 128, 188, 194, 195, 198])
      expect(
        homeDemoDisposition(homeDemoProfile.fields.find((field) => field.number === number)!),
      ).not.toBe('map');
  });
  it.each([
    [75, { constructionType: 'masonry_veneer' }, 'Masonry Veneer'],
    [85, { roofType: 'architectural_shingle' }, 'Architectural Shingle'],
    [86, { roofShape: 'Gabled' }, 'Gable'],
    [99, { applicant1: { maritalStatus: 'Married' } }, 'Married'],
    [105, { propertyType: 'townhouse' }, 'Townhouse Unit'],
    [123, { fortifiedRoofCertificate: 'Gold' }, 'IBHS Gold'],
    [
      127,
      { alarmSystem: 'Yes - Monitored Burglary & Fire' },
      'Level 2 - Central Reporting Fire Alarm',
    ],
  ] as const)('maps exact supported equivalents for field %i', async (number, data, label) => {
    const { page, plan } = await mapped(number, data);
    expect(plan.batch).not.toBeNull();
    expect(
      page.controls[0]!.options.find((option) => option.value === plan.batch?.action.value)?.label,
    ).toBe(label);
    expect(plan.batch?.sources.length).toBeGreaterThan(0);
  });
  it('converts coverage amounts to an exact percentage with both source amounts', async () => {
    const { page, plan } = await mapped(76, {
      coverageA_Dwelling: 400000,
      coverageB_OtherStructures: 40000,
    });
    expect(
      page.controls[0]!.options.find((option) => option.value === plan.batch?.action.value)?.label,
    ).toBe('10%');
    expect(plan.batch?.sources.map((source) => source.sourcePath)).toEqual([
      'coverageA_Dwelling',
      'coverageB_OtherStructures',
    ]);
    expect(
      (await mapped(76, { coverageA_Dwelling: 400000, coverageB_OtherStructures: 41000 })).plan
        .batch,
    ).toBeNull();
    expect(
      (await mapped(76, { coverageA_Dwelling: 0, coverageB_OtherStructures: 0 })).plan.batch,
    ).toBeNull();
  });
  it.each([
    [85, { roofType: 'metal' }],
    [85, { roofType: 'tile' }],
    [85, { roofType: 'three_tab_shingle' }],
    [86, { roofShape: 'Flat' }],
    [86, { roofShape: 'Partial Hipped' }],
    [77, { foundationType: 'Raised', foundationOpenOrClosed: 'Open' }],
    [99, { applicant1: { maritalStatus: 'Divorced' } }],
    [109, { propertyStatus: 'Seasonal/Secondary' }],
    [95, { homeInsurancePayor: 'Mortgage' }],
    [93, { homeInsurancePayor: 'Insured Pay Plan' }],
    [84, { coverageF_MedicalPayments: '$2,000' }],
    [167, { isPropertyInEntityName: true }],
  ] as const)('holds unsupported or ambiguous facts for field %i', async (number, data) => {
    expect((await mapped(number, data)).plan.batch).toBeNull();
  });
  it('does not infer an answer from absence or mix up a fireplace and a stove', async () => {
    expect((await mapped(121, {})).plan.batch).toBeNull();
    const { page, plan } = await mapped(121, { heatTypes: ['Wood Burning Fireplace'] });
    expect(
      page.controls[0]!.options.find((option) => option.value === plan.batch?.action.value)?.label,
    ).toBe('No');
  });
  it('rejects wrong identities, ambiguous repeated identities and changed control types', async () => {
    const page = await pageFor(75),
      rule = homeDemoRules.find((rule) => rule.number === 75)!;
    page.controls[0]!.locatorHints!.id = 'b'.repeat(64);
    expect((await planHomeDemoField(rule, page, { constructionType: 'frame' })).batch).toBeNull();
    const duplicate = await pageFor(75);
    duplicate.controls.push({ ...duplicate.controls[0]!, elementId: 'duplicate' });
    expect(
      (await planHomeDemoField(rule, duplicate, { constructionType: 'frame' })).batch,
    ).toBeNull();
    const changed = await pageFor(75);
    changed.controls[0]!.tag = 'input';
    expect(
      (await planHomeDemoField(rule, changed, { constructionType: 'frame' })).batch,
    ).toBeNull();
  });
  it('rejects absent, duplicated, disabled and human-only target choices', async () => {
    const rule = homeDemoRules.find((rule) => rule.number === 75)!;
    for (const change of ['missing', 'duplicate', 'disabled', 'human'] as const) {
      const page = await pageFor(75);
      const field = page.controls[0]!;
      if (change === 'missing') field.options = [];
      if (change === 'duplicate')
        field.options.push({
          ...field.options.find((option) => option.label === 'Frame')!,
          value: 'duplicate',
        });
      if (change === 'disabled') field.disabled = true;
      if (change === 'human') field.humanOnly = true;
      expect((await planHomeDemoField(rule, page, { constructionType: 'frame' })).batch).toBeNull();
    }
  });
  it('formats dates without inventing month/day and protects property address conflicts', async () => {
    expect((await mapped(22, { applicant1: { dob: '1985-04-16' } })).plan.batch?.action.value).toBe(
      '04/16/1985',
    );
    expect((await mapped(22, { applicant1: { dob: '1985-02-30' } })).plan.batch).toBeNull();
    expect((await mapped(22, { applicant1: { dob: '1985' } })).plan.batch).toBeNull();
    expect(
      (
        await mapped(34, {
          applicant1: { physicalAddress: '123 Synthetic Ave' },
          insuredLocationSameAsApplicant: false,
        })
      ).plan.batch,
    ).toBeNull();
    expect(sourceAt({}, 'constructor.name')).toBeUndefined();
  });
});
