import {
  ApplicantSchema,
  AddressSchema,
  DriverSchema,
  IsoDateSchema,
  PropertySchema,
  VehicleSchema,
} from '@smartmapper/contracts';

export class ExtensionQuoteError extends Error {
  public constructor(public readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'ExtensionQuoteError';
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function read(source: unknown, path: string): unknown {
  let value = source;
  for (const key of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

// These are explicit correspondences from MIA's PersonalApplicantSchema, VehicleSchema,
// and home form. No search-result display names, defaults, or inferred driver ordering.
const aliases: Record<string, string> = {
  'applicant.firstName': 'applicant1.firstName',
  'applicant.lastName': 'applicant1.lastName',
  'applicant.dateOfBirth': 'applicant1.dob',
  'applicant.email': 'applicant1.email',
  'applicant.phone': 'applicant1.phone',
  'applicant.address.line1': 'applicant1.physicalAddress',
  'applicant.address.city': 'applicant1.physicalCity',
  'applicant.address.stateCode': 'applicant1.physicalState',
  'applicant.address.postalCode': 'applicant1.physicalZipCode',
  'vehicles[0].year': 'vehicles[0].vehicleYear',
  'vehicles[1].year': 'vehicles[1].vehicleYear',
  'vehicles[0].make': 'vehicles[0].vehicleMake',
  'vehicles[1].make': 'vehicles[1].vehicleMake',
  'properties[0].yearBuilt': 'yearBuilt',
  'properties[0].squareFeet': 'squareFootage',
  'properties[0].stories': 'numberOfStories',
};

const validators = {
  'applicant.firstName': ApplicantSchema.shape.firstName,
  'applicant.lastName': ApplicantSchema.shape.lastName,
  'applicant.dateOfBirth': IsoDateSchema,
  'applicant.email': ApplicantSchema.shape.email.unwrap(),
  'applicant.phone': ApplicantSchema.shape.phone.unwrap(),
  'applicant.address.line1': AddressSchema.shape.line1,
  'applicant.address.line2': AddressSchema.shape.line2.unwrap(),
  'applicant.address.city': AddressSchema.shape.city,
  'applicant.address.stateCode': AddressSchema.shape.stateCode,
  'applicant.address.postalCode': AddressSchema.shape.postalCode,
  'drivers[0].firstName': DriverSchema.shape.firstName,
  'drivers[1].firstName': DriverSchema.shape.firstName,
  'drivers[0].dateOfBirth': IsoDateSchema,
  'drivers[1].dateOfBirth': IsoDateSchema,
  'vehicles[0].year': VehicleSchema.shape.year,
  'vehicles[1].year': VehicleSchema.shape.year,
  'vehicles[0].make': VehicleSchema.shape.make,
  'vehicles[1].make': VehicleSchema.shape.make,
  'properties[0].yearBuilt': PropertySchema.shape.yearBuilt.unwrap(),
  'properties[0].squareFeet': PropertySchema.shape.squareFeet.unwrap(),
  'properties[0].style': PropertySchema.shape.style.unwrap(),
  'properties[0].stories': PropertySchema.shape.stories.unwrap(),
  'properties[0].numberOfFamilies': PropertySchema.shape.numberOfFamilies.unwrap(),
};

export function validateExtensionQuoteIdentity(quote: unknown, expectedId: string): void {
  if (!record(quote) || read(quote, 'id') !== expectedId || !expectedId) {
    throw new ExtensionQuoteError('quote_identity_mismatch');
  }
}

export function resolveExtensionQuoteField(
  quote: unknown,
  sourcePath: string,
): {
  value: string | number;
  sourceDataPath: string;
} {
  if (!Object.hasOwn(validators, sourcePath)) throw new ExtensionQuoteError('unsupported_source');
  const validator = validators[sourcePath as keyof typeof validators];
  const candidates: { value: unknown; path: string }[] = [
    { value: read(quote, sourcePath), path: sourcePath },
  ];
  const alias = aliases[sourcePath];
  const formType = read(quote, 'form_type');
  if (
    alias &&
    (formType === 'home' || formType === 'auto') &&
    (!sourcePath.startsWith('properties') || formType === 'home') &&
    (!sourcePath.startsWith('vehicles') || formType === 'auto')
  ) {
    let form: unknown = read(quote, 'form_data');
    if (typeof form === 'string') {
      try {
        form = JSON.parse(form) as unknown;
      } catch {
        throw new ExtensionQuoteError('invalid_source');
      }
    }
    candidates.push({ value: read(form, alias), path: 'form_data.' + alias });
    candidates.push({
      value: read(form, 'form_data.' + alias),
      path: 'form_data.form_data.' + alias,
    });
  }
  const present = candidates.filter(
    ({ value }) => value !== undefined && value !== null && value !== '',
  );
  if (!present.length) throw new ExtensionQuoteError('missing_source');
  const resolved = present.map(({ value, path }) => {
    let normalized = typeof value === 'string' ? value.trim() : value;
    if (sourcePath.endsWith('dateOfBirth') && typeof normalized === 'string') {
      const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
      if (us) normalized = us[3] + '-' + us[1] + '-' + us[2];
    }
    if (
      /\.(year|yearBuilt|squareFeet|stories|numberOfFamilies)$/.test(sourcePath) &&
      typeof normalized === 'string' &&
      /^\d+(?:\.\d+)?$/.test(normalized)
    )
      normalized = Number(normalized);
    const parsed = validator.safeParse(normalized);
    if (!parsed.success || parsed.data === '') throw new ExtensionQuoteError('invalid_source');
    return { value: parsed.data, sourceDataPath: path };
  });
  const first = resolved[0];
  if (!first) throw new ExtensionQuoteError('missing_source');
  if (resolved.some(({ value }) => value !== first.value))
    throw new ExtensionQuoteError('conflicting_source');
  return first;
}
