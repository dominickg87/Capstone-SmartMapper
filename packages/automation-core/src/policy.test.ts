import { describe, expect, it } from 'vitest';

import { evaluateActionPolicy, evaluateMappingGate } from './policy.js';
import { evaluateSafeStop } from './review.js';

const baseAction = {
  version: '1.0',
  actionId: 'action-1',
  risk: 'low',
  rationale: 'Synthetic test.',
};

describe('action policy', () => {
  it('allows a schema-valid text fill with provenance', () => {
    expect(
      evaluateActionPolicy({
        ...baseAction,
        type: 'fillText',
        sourcePath: 'applicant.firstName',
        target: { label: 'First name' },
      }),
    ).toEqual({ disposition: 'allow', reasonCode: 'allowlisted_action' });
  });

  it.each([
    'Submit quote',
    'Bind policy',
    'Accept terms',
    'CAPTCHA bypass',
    'Consent',
    'Electronic signature',
    'Authorization',
    'Attestation',
    'I certify',
    'Acknowledgement',
  ])('blocks clickContinue targeting prohibited intent: %s', (accessibleName) => {
    expect(
      evaluateActionPolicy({
        ...baseAction,
        type: 'clickContinue',
        target: { accessibleName, role: 'button' },
      }).disposition,
    ).toBe('block');
  });

  it('blocks unknown and arbitrary script actions', () => {
    expect(
      evaluateActionPolicy({
        ...baseAction,
        type: 'executeScript',
        script: 'document.querySelector("button").click()',
      }),
    ).toEqual({ disposition: 'block', reasonCode: 'invalid_action_schema' });
  });

  it('requires review for confidence below the risk threshold', () => {
    expect(
      evaluateMappingGate({
        version: '1.0',
        sourcePath: 'vehicles[0].usage',
        target: { label: 'Vehicle usage' },
        evidence: [{ kind: 'semantic_similarity', detail: 'Semantic match', weight: 0.7 }],
        confidence: 0.9,
        risk: 'medium',
        requiresReview: false,
      }).disposition,
    ).toBe('review');
  });

  it('stops on any final submit intent', () => {
    expect(
      evaluateSafeStop({
        pageText: 'Mock submit — prohibited for automation',
        authenticationRequired: false,
        missingRequiredFields: false,
      }),
    ).toEqual({ shouldStop: true, reasonCode: 'final_or_legal_action_detected' });
  });
});
