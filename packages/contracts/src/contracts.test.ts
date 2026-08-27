import { describe, expect, it } from 'vitest';

import {
  AutomationActionSchema,
  FieldMappingCandidateSchema,
  MiaQuotePayloadSchema,
  QuoteJobSchema,
} from './index.js';

const timestamp = '2026-01-15T12:00:00.000Z';

describe('versioned SmartMapper contracts', () => {
  it('accepts a normalized synthetic quote', () => {
    const result = MiaQuotePayloadSchema.safeParse({
      version: '1.0',
      applicant: {
        firstName: 'Avery',
        lastName: 'Example',
        dateOfBirth: '1990-04-12',
        address: {
          line1: '100 Example Way',
          city: 'Sampleton',
          stateCode: 'IL',
          postalCode: '60601',
          countryCode: 'US',
        },
      },
      drivers: [],
      vehicles: [],
      properties: [],
      requestedCoverage: {
        lineOfBusiness: 'synthetic-personal',
        effectiveDate: '2026-02-01',
        stateCode: 'IL',
        limits: {},
        deductibles: {},
      },
      metadata: {
        quoteId: 'quote-synthetic-1',
        tenantReference: 'tenant-synthetic',
        sourceSystem: 'mock-mia',
        retrievedAt: timestamp,
        schemaVersion: '1.0',
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects arbitrary script execution and final submission actions', () => {
    for (const type of ['executeScript', 'finalSubmit']) {
      const result = AutomationActionSchema.safeParse({
        version: '1.0',
        actionId: 'unsafe-1',
        type,
        risk: 'prohibited',
        rationale: 'Must never be accepted.',
        script: 'return document.cookie',
      });

      expect(result.success).toBe(false);
    }
  });

  it('requires a version on persisted jobs', () => {
    const result = QuoteJobSchema.safeParse({
      jobId: 'job-1',
      state: 'created',
    });

    expect(result.success).toBe(false);
  });

  it('rejects mapping confidence outside the normalized range', () => {
    const result = FieldMappingCandidateSchema.safeParse({
      version: '1.0',
      sourcePath: 'drivers[0].dateOfBirth',
      target: { label: 'Date of birth' },
      evidence: [{ kind: 'label', detail: 'Exact label', weight: 1 }],
      confidence: 1.1,
      risk: 'medium',
      requiresReview: false,
    });

    expect(result.success).toBe(false);
  });
});
