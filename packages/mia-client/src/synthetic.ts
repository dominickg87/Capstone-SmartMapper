import type { MiaQuotePayload } from '@smartmapper/contracts';

export const syntheticQuote: MiaQuotePayload = {
  version: '1.0',
  applicant: {
    firstName: 'Avery',
    lastName: 'Example',
    dateOfBirth: '1990-04-12',
    email: 'avery@example.invalid',
    phone: '5550100000',
    maritalStatus: 'single',
    address: {
      line1: '100 Example Way',
      city: 'Sampleton',
      stateCode: 'IL',
      postalCode: '60601',
      countryCode: 'US',
    },
  },
  drivers: [
    {
      driverId: 'driver-synthetic-1',
      firstName: 'Avery',
      lastName: 'Example',
      dateOfBirth: '1990-04-12',
      relationshipToApplicant: 'self',
      licenseStatus: 'valid',
      licenseStateCode: 'IL',
    },
    {
      driverId: 'driver-synthetic-2',
      firstName: 'Riley',
      lastName: 'Sample',
      dateOfBirth: '1992-08-21',
      relationshipToApplicant: 'household-member',
      licenseStatus: 'valid',
      licenseStateCode: 'IL',
    },
  ],
  vehicles: [
    {
      vehicleId: 'vehicle-synthetic-1',
      year: 2022,
      make: 'Example Motors',
      model: 'Model One',
      annualMileage: 9000,
      usage: 'commute',
    },
    {
      vehicleId: 'vehicle-synthetic-2',
      year: 2019,
      make: 'Sample Auto',
      model: 'Model Two',
      annualMileage: 5000,
      usage: 'pleasure',
    },
  ],
  properties: [
    {
      propertyId: 'property-synthetic-1',
      address: {
        line1: '100 Example Way',
        city: 'Sampleton',
        stateCode: 'IL',
        postalCode: '60601',
        countryCode: 'US',
      },
      yearBuilt: 2005,
      occupancy: 'primary',
      constructionType: 'synthetic-frame',
      squareFeet: 1850,
      style: 'ranch',
      stories: 2.5,
      numberOfFamilies: 1,
    },
  ],
  priorInsurance: {
    currentlyInsured: true,
    carrierDisplayName: 'Synthetic Prior Provider',
    expirationDate: '2026-02-01',
    lapseInCoverage: false,
  },
  requestedCoverage: {
    lineOfBusiness: 'synthetic-personal',
    effectiveDate: '2026-02-02',
    stateCode: 'IL',
    limits: {
      syntheticLiability: '100/300',
    },
    deductibles: {
      syntheticComprehensive: '500',
    },
  },
  metadata: {
    quoteId: 'quote-synthetic-complete',
    tenantReference: 'tenant-synthetic',
    sourceSystem: 'mock-mia',
    retrievedAt: '2026-01-15T12:00:00.000Z',
    schemaVersion: '1.0',
  },
};

export const syntheticQuoteMissingPhone: MiaQuotePayload = {
  ...structuredClone(syntheticQuote),
  applicant: {
    ...structuredClone(syntheticQuote.applicant),
    phone: undefined,
  },
  metadata: {
    ...syntheticQuote.metadata,
    quoteId: 'quote-synthetic-missing-phone',
  },
};

export const syntheticQuotes = [syntheticQuote, syntheticQuoteMissingPhone] as const;
