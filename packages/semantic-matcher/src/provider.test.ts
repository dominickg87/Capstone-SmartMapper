import {
  evaluateMappingGate,
  resolveSourceValue,
  SourceValueNotFoundError,
} from '@smartmapper/automation-core';
import {
  SanitizedMappingRequestSchema,
  type SanitizedMappingRequest,
} from '@smartmapper/ai-mapper';
import { AccessibleControlSchema, type AccessibleControl } from '@smartmapper/contracts';
import { syntheticQuote } from '@smartmapper/mia-client';
import { describe, expect, it } from 'vitest';

import { DeterministicSemanticMatcher, toFieldMetadata } from './provider.js';

interface ControlSeed {
  controlKey: string;
  role?: string;
  label?: string;
  name?: string;
  inputType?: string;
  autocomplete?: string;
}

function control(seed: ControlSeed): AccessibleControl {
  return AccessibleControlSchema.parse({
    role: 'input',
    required: false,
    disabled: false,
    nearbyText: [],
    ...seed,
  });
}

/*
 * A synthetic carrier page carrying the applicant and property questions the dictionary
 * knows. Labels and autocomplete tokens only — no applicant values appear on the page
 * snapshot, which is what the sanitized boundary requires.
 */
const applicantPageControls: AccessibleControl[] = [
  control({ controlKey: 'c-last', label: 'Last name', autocomplete: 'family-name' }),
  control({ controlKey: 'c-first', label: 'First name', autocomplete: 'given-name' }),
  control({ controlKey: 'c-email', label: 'Email', inputType: 'email', autocomplete: 'email' }),
  control({ controlKey: 'c-phone', label: 'Phone', inputType: 'tel', autocomplete: 'tel' }),
  control({
    controlKey: 'c-dob',
    label: 'Date of birth',
    inputType: 'date',
    autocomplete: 'bday',
  }),
  control({ controlKey: 'c-line1', label: 'Street address', autocomplete: 'address-line1' }),
  control({ controlKey: 'c-city', label: 'City', autocomplete: 'address-level2' }),
  control({
    controlKey: 'c-state',
    role: 'select',
    label: 'State',
    autocomplete: 'address-level1',
  }),
  control({ controlKey: 'c-zip', label: 'ZIP code', autocomplete: 'postal-code' }),
  control({ controlKey: 'c-year', label: 'Year built', inputType: 'number' }),
  control({ controlKey: 'c-sqft', label: 'Finished square feet', inputType: 'number' }),
  control({ controlKey: 'c-style', role: 'select', label: 'Home style' }),
  control({ controlKey: 'c-stories', label: 'Number of stories', inputType: 'number' }),
  control({ controlKey: 'c-families', label: 'Number of families', inputType: 'number' }),
];

function request(controls: AccessibleControl[]): SanitizedMappingRequest {
  return SanitizedMappingRequestSchema.parse({
    version: '1.0',
    page: {
      version: '1.0',
      url: 'http://127.0.0.1:4173/modern',
      title: 'Synthetic carrier lab',
      headings: ['Applicant details'],
      controls,
      labels: controls.map((entry) => entry.label ?? ''),
      options: [],
      validationMessages: [],
      iframes: [],
      capturedAt: '2026-01-15T12:00:00.000Z',
    },
    fields: toFieldMetadata(),
    adapterHints: [],
    priorApprovedMappings: [],
  });
}

const matcher = new DeterministicSemanticMatcher();

describe('the sanitized mapper boundary', () => {
  it('sends vocabulary and risk, never a quote value', () => {
    const serialized = JSON.stringify(request(applicantPageControls));

    expect(serialized).not.toContain(syntheticQuote.applicant.lastName);
    expect(serialized).not.toContain(syntheticQuote.applicant.firstName);
    expect(serialized).not.toContain(syntheticQuote.applicant.address.postalCode);
  });

  it('reaches an identical proposal on repeated runs', async () => {
    const first = await matcher.proposeMappings(request(applicantPageControls));
    const second = await matcher.proposeMappings(request(applicantPageControls));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.provider).toBe('deterministic-semantic-matcher');
  });
});

describe('proposals against the execution policy gate', () => {
  it('produces candidates the policy gate allows outright', async () => {
    const proposal = await matcher.proposeMappings(request(applicantPageControls));

    expect(proposal.candidates.length).toBeGreaterThanOrEqual(14);
    for (const candidate of proposal.candidates) {
      expect(evaluateMappingGate(candidate).disposition).toBe('allow');
    }
  });

  it('sends a medium-risk field to review when only a weak signal supports it', async () => {
    // Date of birth carries medium risk, so the gate demands 0.95. A name/id token is 0.90.
    const proposal = await matcher.proposeMappings(
      request([control({ controlKey: 'c-dob', name: 'dob', inputType: 'text' })]),
    );

    const candidate = proposal.candidates.find(
      (entry) => entry.sourcePath === 'applicant.dateOfBirth',
    );
    expect(candidate?.confidence).toBe(0.9);
    expect(evaluateMappingGate(candidate!).disposition).toBe('review');
    expect(evaluateMappingGate(candidate!).reasonCode).toBe('confidence_below_threshold');
  });

  it('reports a tie as unresolved instead of proposing a guess', async () => {
    const proposal = await matcher.proposeMappings(
      request([
        control({ controlKey: 'c1', label: 'Last name' }),
        control({ controlKey: 'c2', label: 'Last name' }),
      ]),
    );

    expect(proposal.unresolvedSourcePaths).toContain('applicant.lastName');
    expect(proposal.candidates.some((entry) => entry.sourcePath === 'applicant.lastName')).toBe(
      false,
    );
    expect(proposal.notes.some((note) => note.includes('tied within the ambiguity margin'))).toBe(
      true,
    );
  });

  it('lets a reviewed adapter rule outrank anything inferred from the page', async () => {
    const base = request(applicantPageControls);
    const proposal = await matcher.proposeMappings({
      ...base,
      adapterHints: [
        {
          sourcePath: 'applicant.lastName',
          target: { label: 'Surname as mapped by the adapter', role: 'textbox' },
        },
      ],
    });

    const candidate = proposal.candidates.find(
      (entry) => entry.sourcePath === 'applicant.lastName',
    );
    expect(candidate?.evidence[0]?.kind).toBe('adapter_rule');
    expect(candidate?.target.label).toBe('Surname as mapped by the adapter');
  });
});

describe('running against the repository synthetic quote', () => {
  it('resolves every proposed source path to a real value', async () => {
    const proposal = await matcher.proposeMappings(request(applicantPageControls));

    for (const candidate of proposal.candidates) {
      expect(() => resolveSourceValue(syntheticQuote, candidate.sourcePath)).not.toThrow();
    }
  });

  it('reads the property attributes added to the quote contract', () => {
    expect(resolveSourceValue(syntheticQuote, 'properties[0].squareFeet')).toBe(1850);
    expect(resolveSourceValue(syntheticQuote, 'properties[0].style')).toBe('ranch');
    expect(resolveSourceValue(syntheticQuote, 'properties[0].stories')).toBe(2.5);
    expect(resolveSourceValue(syntheticQuote, 'properties[0].numberOfFamilies')).toBe(1);
  });

  it('leaves a field absent from the quote for a human rather than inventing one', () => {
    // The synthetic applicant has no second address line; nothing may be fabricated for it.
    expect(() => resolveSourceValue(syntheticQuote, 'applicant.address.line2')).toThrow(
      SourceValueNotFoundError,
    );
  });
});
