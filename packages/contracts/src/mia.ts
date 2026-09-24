import { z } from 'zod';

import { ContractVersionSchema, IsoDateSchema } from './common.js';

export const AddressSchema = z
  .object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    stateCode: z.string().length(2),
    postalCode: z.string().regex(/^\d{5}(?:-\d{4})?$/),
    countryCode: z.literal('US'),
  })
  .strict();
export type Address = z.infer<typeof AddressSchema>;

export const ApplicantSchema = z
  .object({
    firstName: z.string().min(1),
    middleName: z.string().optional(),
    lastName: z.string().min(1),
    dateOfBirth: IsoDateSchema,
    email: z.email().optional(),
    phone: z.string().min(7).optional(),
    maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed', 'other']).optional(),
    address: AddressSchema,
  })
  .strict();
export type Applicant = z.infer<typeof ApplicantSchema>;

export const DriverSchema = z
  .object({
    driverId: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    dateOfBirth: IsoDateSchema,
    relationshipToApplicant: z.string().min(1),
    licenseStatus: z.enum(['valid', 'permit', 'suspended', 'revoked', 'unknown']),
    licenseStateCode: z.string().length(2).optional(),
    licenseNumber: z.string().min(1).optional(),
  })
  .strict();
export type Driver = z.infer<typeof DriverSchema>;

export const VehicleSchema = z
  .object({
    vehicleId: z.string().min(1),
    year: z.number().int().min(1900).max(2100),
    make: z.string().min(1),
    model: z.string().min(1),
    vin: z.string().length(17).optional(),
    annualMileage: z.number().int().nonnegative().optional(),
    usage: z.enum(['commute', 'pleasure', 'business', 'farm', 'other']).optional(),
  })
  .strict();
export type Vehicle = z.infer<typeof VehicleSchema>;

export const PropertySchema = z
  .object({
    propertyId: z.string().min(1),
    address: AddressSchema,
    yearBuilt: z.number().int().min(1700).max(2100).optional(),
    occupancy: z.enum(['primary', 'secondary', 'rental', 'vacant', 'other']).optional(),
    constructionType: z.string().optional(),
    squareFeet: z.number().int().positive().optional(),
    style: z.string().optional(),
    stories: z.number().positive().optional(),
    numberOfFamilies: z.number().int().positive().optional(),
  })
  .strict();
export type Property = z.infer<typeof PropertySchema>;

export const PriorInsuranceSchema = z
  .object({
    currentlyInsured: z.boolean(),
    carrierDisplayName: z.string().optional(),
    policyNumber: z.string().optional(),
    expirationDate: IsoDateSchema.optional(),
    lapseInCoverage: z.boolean().optional(),
  })
  .strict();
export type PriorInsurance = z.infer<typeof PriorInsuranceSchema>;

export const RequestedCoverageSchema = z
  .object({
    lineOfBusiness: z.string().min(1),
    effectiveDate: IsoDateSchema,
    stateCode: z.string().length(2),
    limits: z.record(z.string(), z.string()),
    deductibles: z.record(z.string(), z.string()),
  })
  .strict();
export type RequestedCoverage = z.infer<typeof RequestedCoverageSchema>;

export const QuoteMetadataSchema = z
  .object({
    quoteId: z.string().min(1),
    tenantReference: z.string().min(1),
    sourceSystem: z.literal('mock-mia'),
    retrievedAt: z.iso.datetime({ offset: true }),
    schemaVersion: z.string().min(1),
  })
  .strict();
export type QuoteMetadata = z.infer<typeof QuoteMetadataSchema>;

export const MiaQuotePayloadSchema = z
  .object({
    version: ContractVersionSchema,
    applicant: ApplicantSchema,
    drivers: z.array(DriverSchema),
    vehicles: z.array(VehicleSchema),
    properties: z.array(PropertySchema),
    priorInsurance: PriorInsuranceSchema.optional(),
    requestedCoverage: RequestedCoverageSchema,
    metadata: QuoteMetadataSchema,
  })
  .strict();
export type MiaQuotePayload = z.infer<typeof MiaQuotePayloadSchema>;
