import {
  ActionBatchSchema,
  SourceAnswerSchema,
  type ActionBatch,
  type PageControl,
  type PageObservation,
  type SourceAnswer,
} from '@smartmapper/contracts';
import { controlIsHumanOnly, valueDigest } from '@smartmapper/automation-core/active-tab';
import { homeDemoProfile, type HomeDemoField } from './home-demo-profile.js';

export { homeDemoProfile } from './home-demo-profile.js';
type Reader = (path: string) => unknown;
export interface HomeDemoRule {
  number: number;
  title: string;
  paths: string[];
  kind: 'fill' | 'select';
  format?: 'date' | 'phone';
  resolve: (read: Reader) => string;
}
class ReviewNeeded extends Error {}
const review = (message: string): never => {
  throw new ReviewNeeded(message);
};
const norm = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const text = (value: unknown): string =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : review('M.I.A. answer is missing or invalid.');
const amount = (value: unknown): number => {
  const raw = text(value);
  if (!/^\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(raw))
    return review('A valid nonnegative numeric answer is required.');
  const number = Number(raw.replace(/[$,]/g, ''));
  return Number.isFinite(number) && number <= 1e10
    ? number
    : review('Numeric answer is outside the supported range.');
};
const list = (value: unknown): string[] =>
  Array.isArray(value) &&
  value.length &&
  value.every((item) => typeof item === 'string' && item.trim())
    ? (value as string[])
    : review('M.I.A. selections are missing or invalid.');
const boolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : review('An explicit Yes or No answer is required.');
const alias = (value: unknown, choices: Record<string, string>): string => {
  const key = norm(text(value));
  return (
    Object.entries(choices).find(([source]) => norm(source) === key)?.[1] ??
    review('M.I.A. does not specify an equivalent carrier choice.')
  );
};
const money = (value: unknown): string =>
  '$' + amount(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const numeric = (path: string) => (read: Reader) => String(amount(read(path)));
const enumeration = (path: string, choices: Record<string, string>) => (read: Reader) =>
  alias(read(path), choices);
const percentage = (path: string, available: number[]) => (read: Reader) => {
  const dwelling = amount(read('coverageA_Dwelling'));
  const coverage = amount(read(path));
  if (dwelling <= 0)
    return review('A positive dwelling amount is required for percentage coverage.');
  const exact = available.filter(
    (percent) => Math.abs((dwelling * percent) / 100 - coverage) < 0.005,
  );
  return exact.length === 1
    ? `${exact[0]}%`
    : review('Coverage amount has no exact carrier percentage; no rounding is applied.');
};
const deductible = (path: string) => (read: Reader) => {
  const raw = text(read(path));
  return /^\d+(?:\.\d+)?%$/.test(raw) ? `${Number(raw.slice(0, -1))}%` : money(raw);
};

export const homeDemoRules: HomeDemoRule[] = [
  ...homeDemoProfile.fields
    .filter((field) => field.sourcePath)
    .map((field) => ({
      number: field.number,
      title: (
        {
          19: 'First name',
          21: 'Last name',
          22: 'Date of birth',
          23: 'Social Security number',
          24: 'Phone',
          25: 'Email',
          34: 'Property address',
          36: 'Property city',
          37: 'Property state',
          38: 'Property ZIP',
          74: 'Dwelling coverage',
        } as Record<number, string>
      )[field.number]!,
      paths: [
        field.sourcePath!,
        ...(field.number >= 34 && field.number <= 38 ? ['insuredLocationSameAsApplicant'] : []),
      ],
      kind: 'fill' as const,
      ...(field.number === 22
        ? { format: 'date' as const }
        : field.number === 24
          ? { format: 'phone' as const }
          : {}),
      resolve: (read: Reader) => {
        if (
          field.number >= 34 &&
          field.number <= 38 &&
          read('insuredLocationSameAsApplicant') === false
        )
          return review(
            'Insured location differs from the applicant address selected in the notes.',
          );
        if (field.number === 74) {
          const value = amount(read(field.sourcePath!));
          return value > 0 ? String(value) : review('Dwelling coverage must be positive.');
        }
        return text(read(field.sourcePath!));
      },
    })),
  {
    number: 75,
    title: 'Construction',
    paths: ['constructionType'],
    kind: 'select',
    resolve: enumeration('constructionType', {
      frame: 'Frame',
      masonry: 'Masonry',
      masonry_veneer: 'Masonry Veneer',
    }),
  },
  {
    number: 76,
    title: 'Other structures coverage',
    paths: ['coverageB_OtherStructures', 'coverageA_Dwelling'],
    kind: 'select',
    resolve: percentage('coverageB_OtherStructures', [0, 2, 10, 15, 20, 25, 30, 40, 50]),
  },
  {
    number: 77,
    title: 'Foundation',
    paths: ['foundationType', 'foundationOpenOrClosed'],
    kind: 'select',
    resolve: (read) => {
      const type = text(read('foundationType'));
      if (type === 'Slab') return 'Slab on Ground';
      if (type === 'Slab With Basement') return 'Basement';
      if (type === 'Raised')
        return alias(read('foundationOpenOrClosed'), {
          "Open Crawlspace < 2'": 'Pier and Beam - Open (Crawl Space)',
          "Open Crawlspace > 2'": 'Pier and Beam - Open (Crawl Space)',
          "Closed Crawlspace < 2'": 'Pier and Beam - Enclosed (Crawl Space)',
          "Closed Crawlspace > 2'": 'Pier and Beam - Enclosed (Crawl Space)',
        });
      return review('Foundation subtype is not sufficiently specified.');
    },
  },
  {
    number: 78,
    title: 'Personal property coverage',
    paths: ['coverageC_PersonalProperty', 'coverageA_Dwelling'],
    kind: 'select',
    resolve: percentage(
      'coverageC_PersonalProperty',
      [0, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75],
    ),
  },
  {
    number: 79,
    title: 'Living square feet',
    paths: ['squareFootage'],
    kind: 'fill',
    resolve: numeric('squareFootage'),
  },
  {
    number: 80,
    title: 'Loss of use coverage',
    paths: ['coverageD_LossOfUse', 'coverageA_Dwelling'],
    kind: 'select',
    resolve: percentage('coverageD_LossOfUse', [10, 15, 20, 25, 30]),
  },
  {
    number: 81,
    title: 'Stories',
    paths: ['numberOfStories'],
    kind: 'select',
    resolve: (read) => {
      const n = amount(read('numberOfStories'));
      return n >= 3.5 ? '3.5 +' : String(n);
    },
  },
  {
    number: 82,
    title: 'Liability coverage',
    paths: ['coverageE_Liability'],
    kind: 'select',
    resolve: (read) => money(read('coverageE_Liability')),
  },
  {
    number: 83,
    title: 'Exterior siding',
    paths: ['frameExteriorMaterials'],
    kind: 'select',
    resolve: (read) => {
      const materials = list(read('frameExteriorMaterials'));
      if (materials.length !== 1)
        return review('Multiple exterior materials need a carrier siding decision.');
      return alias(materials[0], {
        'Aluminum siding': 'Aluminum Siding',
        'Brick veneer': 'Brick Veneer',
        'Concrete block (CMU)': 'Concrete Block',
        'Exterior insulation + finish (EIFS)': 'EIFS or Dryvit',
        'Synthetic stucco (EIFS)': 'EIFS or Dryvit',
        'Fiber cement siding (Hardie board)': 'Cement Fiber, Hardi-Board/Plank',
        'Metal panels (standing seam / corrugated)': 'Metal Siding',
        'Steel siding': 'Metal Siding',
        'Natural stone (masonry)': 'Solid Stone',
        'Solid brick (masonry)': 'Solid Brick',
        'Stone veneer': 'Stone Veneer',
        'Wood lap siding (clapboard)': 'Clapboard',
        'Wood shingles / shakes (cedar)': 'Wood/Shakes/Shingles',
      });
    },
  },
  {
    number: 84,
    title: 'Medical payments',
    paths: ['coverageF_MedicalPayments'],
    kind: 'select',
    resolve: (read) => money(read('coverageF_MedicalPayments')),
  },
  {
    number: 85,
    title: 'Roof material',
    paths: ['roofType', 'roofTypeOtherDescription'],
    kind: 'select',
    resolve: (read) => {
      const type = text(read('roofType'));
      if (type === 'other') return text(read('roofTypeOtherDescription'));
      return alias(type, {
        architectural_shingle: 'Architectural Shingle',
        wood: 'Wood Shake/Shingle',
      });
    },
  },
  {
    number: 86,
    title: 'Roof shape',
    paths: ['roofShape', 'roofShapeOtherDescription'],
    kind: 'select',
    resolve: (read) => {
      const shape = text(read('roofShape'));
      if (shape === 'Other') return text(read('roofShapeOtherDescription'));
      return alias(shape, { Gabled: 'Gable', 'Full Hipped': 'Hip - 90%' });
    },
  },
  {
    number: 87,
    title: 'All other perils deductible',
    paths: ['allOtherPerilsDeductible'],
    kind: 'select',
    resolve: deductible('allOtherPerilsDeductible'),
  },
  {
    number: 89,
    title: 'Named storm deductible',
    paths: ['windHailNamedStormDeductible'],
    kind: 'select',
    resolve: deductible('windHailNamedStormDeductible'),
  },
  {
    number: 93,
    title: 'Payment plan',
    paths: ['homeInsurancePayor'],
    kind: 'select',
    resolve: enumeration('homeInsurancePayor', { 'Insured PIF': '1-Pay' }),
  },
  {
    number: 95,
    title: 'Payor',
    paths: ['homeInsurancePayor'],
    kind: 'select',
    resolve: enumeration('homeInsurancePayor', {
      'Insured PIF': 'Insured',
      'Insured Pay Plan': 'Insured',
    }),
  },
  {
    number: 97,
    title: 'Household size',
    paths: ['numberOfResidents'],
    kind: 'select',
    resolve: (read) => {
      const n = amount(read('numberOfResidents'));
      if (!Number.isInteger(n) || n < 1)
        return review('Household size must be a positive whole number.');
      return n >= 10 ? '10+' : String(n);
    },
  },
  {
    number: 98,
    title: 'Water heater update year',
    paths: ['h2oHeaterLastUpdateYear'],
    kind: 'fill',
    resolve: numeric('h2oHeaterLastUpdateYear'),
  },
  {
    number: 99,
    title: 'Marital status',
    paths: ['applicant1.maritalStatus'],
    kind: 'select',
    resolve: enumeration('applicant1.maritalStatus', { Single: 'Single', Married: 'Married' }),
  },
  {
    number: 102,
    title: 'Water heater location',
    paths: ['hotWaterHeaterType'],
    kind: 'select',
    resolve: enumeration('hotWaterHeaterType', {
      Tankless: 'Tankless Water Heater',
      'Tankless Water Heater': 'Tankless Water Heater',
      'Tank - Attic': 'Attic',
      Attic: 'Attic',
      'Tank - Garage': 'Garage',
      Garage: 'Garage',
      'Outside of Dwelling': 'Outside of Dwelling',
      'Interior - First Floor': 'Interior - First Floor',
      'Interior - Above First Floor': 'Interior - Above First Floor',
    }),
  },
  {
    number: 105,
    title: 'Residence type',
    paths: ['propertyType'],
    kind: 'select',
    resolve: enumeration('propertyType', {
      single_family: 'Single Family',
      townhouse: 'Townhouse Unit',
    }),
  },
  {
    number: 107,
    title: 'Occupancy',
    paths: ['propertyStatus'],
    kind: 'select',
    resolve: enumeration('propertyStatus', {
      'Owner Occupied (Primary)': 'Owner',
      'Tenant Occupied': 'Tenant',
    }),
  },
  {
    number: 108,
    title: 'Year built',
    paths: ['yearBuilt'],
    kind: 'fill',
    resolve: numeric('yearBuilt'),
  },
  {
    number: 109,
    title: 'Usage',
    paths: ['propertyStatus'],
    kind: 'select',
    resolve: enumeration('propertyStatus', { 'Owner Occupied (Primary)': 'Primary' }),
  },
  {
    number: 110,
    title: 'Purchase date',
    paths: ['purchaseDate'],
    kind: 'fill',
    format: 'date',
    resolve: (read) => text(read('purchaseDate')),
  },
  {
    number: 112,
    title: 'New purchase',
    paths: ['propertyStatus'],
    kind: 'select',
    resolve: enumeration('propertyStatus', {
      'New Purchase': 'Yes',
      'New Purchase - Bond for Deed': 'Yes',
    }),
  },
  {
    number: 115,
    title: 'Roof update year',
    paths: ['yearOfLastRoofUpdate'],
    kind: 'fill',
    resolve: numeric('yearOfLastRoofUpdate'),
  },
  {
    number: 119,
    title: 'Gated community',
    paths: ['hoaCoaSecurityFeatures'],
    kind: 'select',
    resolve: (read) =>
      list(read('hoaCoaSecurityFeatures')).includes('Gated Access') ? 'Yes' : 'No',
  },
  {
    number: 120,
    title: 'Burglar alarm',
    paths: ['alarmSystem', 'hasDeadbolts'],
    kind: 'select',
    resolve: (read) => {
      const alarm = text(read('alarmSystem'));
      if (alarm === 'No') return boolean(read('hasDeadbolts')) ? 'Level 1 - Deadbolts' : 'None';
      return alias(alarm, {
        'Yes - Local': 'Level 2 - Local Alarm',
        'Yes - Monitored Burglary': 'Level 3 - Central Reporting System',
        'Yes - Monitored Burglary & Fire': 'Level 3 - Central Reporting System',
      });
    },
  },
  {
    number: 121,
    title: 'Wood stove',
    paths: ['heatTypes'],
    kind: 'select',
    resolve: (read) => (list(read('heatTypes')).includes('Wood Stove') ? 'Yes' : 'No'),
  },
  {
    number: 123,
    title: 'Fortified certificate',
    paths: ['fortifiedRoofCertificate'],
    kind: 'select',
    resolve: enumeration('fortifiedRoofCertificate', {
      No: 'None',
      Gold: 'IBHS Gold',
      Silver: 'IBHS Silver',
    }),
  },
  {
    number: 127,
    title: 'Fire alarm',
    paths: ['alarmSystem', 'hasSmokeDetectors'],
    kind: 'select',
    resolve: (read) => {
      const alarm = text(read('alarmSystem'));
      if (alarm === 'Yes - Monitored Burglary & Fire')
        return 'Level 2 - Central Reporting Fire Alarm';
      if (!['No', 'Yes - Local', 'Yes - Monitored Burglary'].includes(alarm))
        return review('Alarm type is not supported.');
      return boolean(read('hasSmokeDetectors')) ? 'Level 1 - Smoke Detectors' : 'None';
    },
  },
  {
    number: 134,
    title: 'Plumbing update year',
    paths: ['plumbingLastUpdateYear'],
    kind: 'fill',
    resolve: numeric('plumbingLastUpdateYear'),
  },
  {
    number: 136,
    title: 'Heating update year',
    paths: ['hvacLastUpdateYear'],
    kind: 'fill',
    resolve: numeric('hvacLastUpdateYear'),
  },
  {
    number: 138,
    title: 'Electrical update year',
    paths: ['electricalLastUpdateYear'],
    kind: 'fill',
    resolve: numeric('electricalLastUpdateYear'),
  },
  {
    number: 167,
    title: 'Trust ownership',
    paths: ['isPropertyInEntityName'],
    kind: 'select',
    resolve: (read) =>
      boolean(read('isPropertyInEntityName'))
        ? review('An entity may be a trust, estate or LLC; trust status needs confirmation.')
        : 'No',
  },
  {
    number: 175,
    title: 'Protection class',
    paths: ['protectionClass'],
    kind: 'select',
    resolve: (read) => text(read('protectionClass')).toUpperCase(),
  },
  ...([180, 182, 183, 184] as const).map((number, index) => ({
    number,
    title: ['Prior address', 'Prior city', 'Prior state', 'Prior ZIP'][index]!,
    paths: [
      [
        'applicant1.priorAddress',
        'applicant1.priorCity',
        'applicant1.priorState',
        'applicant1.priorZipCode',
      ][index]!,
    ],
    kind: number === 183 ? ('select' as const) : ('fill' as const),
    resolve: (read: Reader) =>
      text(
        read(
          [
            'applicant1.priorAddress',
            'applicant1.priorCity',
            'applicant1.priorState',
            'applicant1.priorZipCode',
          ][index]!,
        ),
      ),
  })),
];
homeDemoRules.sort((a, b) => a.number - b.number);

export function homeDemoTitle(field: HomeDemoField): string {
  return (
    homeDemoRules.find((rule) => rule.number === field.number)?.title ??
    field.name
      .split('$')
      .at(-1)!
      .replace(/^(ddl|txt|dt)/, '')
      .replace(/Cd$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
  );
}
export function homeDemoDisposition(field: HomeDemoField): 'map' | 'ignore' | 'review' {
  if (
    !field.visible ||
    ['button', 'submit', 'reset', 'hidden'].includes(field.type) ||
    field.number === 12
  )
    return 'ignore';
  return homeDemoRules.some((rule) => rule.number === field.number) ? 'map' : 'review';
}
export function sourceAt(data: Record<string, unknown>, path: string): unknown {
  let value: unknown = data;
  for (const part of path.split('.')) {
    if (
      !value ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, part) ||
      ['__proto__', 'constructor', 'prototype'].includes(part)
    )
      return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
const identities = new Map<number, Promise<{ name: string; id: string }>>();
export async function findHomeDemoControls(
  page: PageObservation,
  field: HomeDemoField,
): Promise<PageControl[]> {
  let hints = identities.get(field.number);
  if (!hints) {
    hints = Promise.all([valueDigest(field.name), valueDigest(field.id)]).then(([name, id]) => ({
      name,
      id,
    }));
    identities.set(field.number, hints);
  }
  const expected = await hints;
  return page.controls.filter(
    (control) =>
      control.locatorHints?.id === expected.id && control.locatorHints.name === expected.name,
  );
}
function dateValue(raw: string, native: boolean): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const us = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (!iso && !us) return review('A complete valid date is required; no month or day is invented.');
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(us![3]), Number(us![1]), Number(us![2])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1800 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return review('The source date is invalid.');
  const m = String(month).padStart(2, '0'),
    d = String(day).padStart(2, '0');
  return native ? `${year}-${m}-${d}` : `${m}/${d}/${year}`;
}
export type HomeDemoPlan = { batch: ActionBatch; reason?: never } | { batch: null; reason: string };
export async function planHomeDemoField(
  rule: HomeDemoRule,
  page: PageObservation,
  data: Record<string, unknown>,
): Promise<HomeDemoPlan> {
  const field = homeDemoProfile.fields.find((item) => item.number === rule.number)!;
  const targets = await findHomeDemoControls(page, field);
  if (targets.length !== 1)
    return {
      batch: null,
      reason: targets.length ? 'Target is ambiguous.' : 'Target is hidden, missing or changed.',
    };
  const control = targets[0]!;
  if (control.disabled || controlIsHumanOnly(control))
    return { batch: null, reason: 'This field is disabled, read-only or requires a human.' };
  if (
    (rule.kind === 'select' && control.tag !== 'select') ||
    (rule.kind === 'fill' && control.tag !== 'input' && control.tag !== 'textarea')
  )
    return { batch: null, reason: 'Target control type changed.' };
  const sources: SourceAnswer[] = [];
  const read: Reader = (path) => {
    if (!rule.paths.includes(path)) return review('Unapproved source path.');
    const value = sourceAt(data, path);
    if (value === undefined || value === null || value === '') return undefined;
    if (!sources.some((source) => source.sourcePath === path)) {
      const parsed = SourceAnswerSchema.safeParse({
        answerId: `mia:home:${path}`,
        questionId: `mia:home:${path}`,
        sourcePath: path,
        question: path,
        section: 'Homeowners quote',
        entity: '',
        context: [],
        options: [],
        value,
        status: 'answered',
        dataType: Array.isArray(value)
          ? 'multiselect'
          : typeof value === 'boolean'
            ? 'boolean'
            : typeof value === 'number'
              ? 'number'
              : 'text',
      });
      if (!parsed.success) return review('M.I.A. answer has an unsupported shape.');
      sources.push(parsed.data);
    }
    return value;
  };
  try {
    let value = rule.resolve(read);
    if (rule.format === 'date') value = dateValue(value, control.inputType === 'date');
    if (rule.format === 'phone') {
      const digits = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      if (!/^\d{10}$/.test(digits))
        return { batch: null, reason: 'A ten-digit phone number is required.' };
      value = digits;
    }
    if (rule.kind === 'select') {
      if (!field.options.some((option) => norm(option.label) === norm(value)))
        return {
          batch: null,
          reason: 'Source has no supported carrier option; no closest option is chosen.',
        };
      const options = control.options.filter((option) => norm(option.label) === norm(value));
      if (options.length !== 1 || !options[0]!.value)
        return {
          batch: null,
          reason: 'Equivalent carrier option is missing, disabled or ambiguous.',
        };
      value = options[0]!.value;
    }
    if (!sources.length) return { batch: null, reason: 'A source answer is required.' };
    return {
      batch: ActionBatchSchema.parse({
        batchId: crypto.randomUUID(),
        sources,
        action: {
          version: '2.0',
          actionId: crypto.randomUUID(),
          type: rule.kind,
          pageStateId: page.pageStateId,
          elementId: control.elementId,
          sourceAnswerIds: sources.map((source) => source.answerId),
          value,
          checked: null,
          key: null,
          purpose: null,
          direction: null,
          milliseconds: null,
          transformation: {
            kind: rule.kind === 'select' ? 'equivalent_option' : 'format',
            explanation: `Home demo field ${rule.number}: ${rule.title}`,
          },
          confidence: 1,
        },
      }),
    };
  } catch (error) {
    return {
      batch: null,
      reason:
        error instanceof ReviewNeeded ? error.message : 'Source could not be represented safely.',
    };
  }
}
