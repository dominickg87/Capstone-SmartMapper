import type { CarrierPageSnapshot } from '@smartmapper/contracts';
import { describe, expect, it } from 'vitest';

import { DeterministicMockAiMapper, SanitizedMappingRequestSchema } from './index.js';

const page: CarrierPageSnapshot = {
  version: '1.0',
  url: 'http://127.0.0.1:4173/modern',
  title: 'Synthetic',
  headings: ['Applicant details'],
  controls: [
    {
      controlKey: 'given-name',
      role: 'input',
      label: 'Given name',
      accessibleName: 'Given name',
      required: true,
      disabled: false,
      nearbyText: [],
    },
  ],
  labels: ['Given name'],
  options: [],
  validationMessages: [],
  iframes: [],
  capturedAt: '2026-01-15T12:00:00.000Z',
};

describe('provider-neutral AI mapper boundary', () => {
  it('uses field metadata rather than applicant values', async () => {
    const request = SanitizedMappingRequestSchema.parse({
      version: '1.0',
      page,
      fields: [
        {
          sourcePath: 'applicant.firstName',
          displayName: 'Applicant given name',
          description: 'First name field',
          dataType: 'text',
          risk: 'low',
        },
      ],
      adapterHints: [],
      priorApprovedMappings: [],
    });

    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain('Avery');

    const proposal = await new DeterministicMockAiMapper().proposeMappings(request);
    expect(proposal.candidates[0]?.sourcePath).toBe('applicant.firstName');
    expect(proposal.candidates[0]?.requiresReview).toBe(true);
  });

  it('rejects extra value-bearing fields at the schema boundary', () => {
    const result = SanitizedMappingRequestSchema.safeParse({
      version: '1.0',
      page,
      fields: [
        {
          sourcePath: 'applicant.firstName',
          displayName: 'Applicant name',
          description: 'Name',
          dataType: 'text',
          risk: 'low',
          actualValue: 'Do Not Send',
        },
      ],
      adapterHints: [],
      priorApprovedMappings: [],
    });

    expect(result.success).toBe(false);
  });
});
