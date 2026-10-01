import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AutomationActionV2Schema,
  PageObservationSchema,
  SourceAnswersSchema,
} from '@smartmapper/contracts';
import {
  directRepresentationMatches,
  evaluateActiveTabAction,
  validatePageBinding,
  valueDigest,
} from './active-tab.js';

const raw = JSON.parse(
  readFileSync(resolve('fixtures/mia-quotes/active-tab.synthetic.json'), 'utf8'),
) as Record<string, unknown>;
const fixture = {
  source: SourceAnswersSchema.parse(raw.source),
  page: PageObservationSchema.parse(raw.page),
  action: AutomationActionV2Schema.parse(raw.action),
};

describe('active tab policy', () => {
  it('requires actual source provenance and preserves identity values', () => {
    expect(evaluateActiveTabAction(fixture.action, fixture.page, fixture.source).allowed).toBe(
      true,
    );
    expect(
      evaluateActiveTabAction(
        { ...fixture.action, sourceAnswerIds: [] },
        fixture.page,
        fixture.source,
      ).allowed,
    ).toBe(false);
    expect(
      evaluateActiveTabAction(
        { ...fixture.action, sourceAnswerIds: ['unknown'] },
        fixture.page,
        fixture.source,
      ).allowed,
    ).toBe(false);
    expect(
      directRepresentationMatches({ ...fixture.action, value: 'Invented' }, fixture.source.answers),
    ).toBe(false);
  });
  it.each([
    'Bind',
    'Issue policy',
    'Sell policy',
    'Submit',
    'Next',
    'Continue',
    'I agree to the terms',
    'Signature',
    'Payment',
    'CAPTCHA',
  ])('blocks %s even when mislabeled as a fillable field', (label) => {
    const page = structuredClone(fixture.page);
    page.controls[0]!.label = label;
    expect(evaluateActiveTabAction(fixture.action, page, fixture.source).allowed).toBe(false);
  });
  it('rejects arbitrary actions, stale snapshots, contradictory fields, and missing answers', () => {
    for (const override of [
      { type: 'javascript' },
      { selector: '#submit' },
      { pageStateId: 'old' },
      { key: 'Enter' },
      { purpose: 'select_option' },
      { confidence: 0.5 },
    ]) {
      expect(
        evaluateActiveTabAction({ ...fixture.action, ...override }, fixture.page, fixture.source)
          .allowed,
      ).toBe(false);
    }
    const source = structuredClone(fixture.source);
    source.answers[0]!.status = 'missing';
    expect(evaluateActiveTabAction(fixture.action, fixture.page, source).allowed).toBe(false);
  });
  it('leaves section tabs for the human even when proposed as an expansion', () => {
    const page = structuredClone(fixture.page);
    Object.assign(page.controls[0]!, { tag: 'custom', role: 'tab', label: 'Open vehicles' });
    expect(
      evaluateActiveTabAction(
        {
          ...fixture.action,
          type: 'click',
          value: null,
          purpose: 'expand_section',
        },
        page,
        fixture.source,
      ).allowed,
    ).toBe(false);
  });
  it('pins tenant job actions to the tab origin and a fresh observation', () => {
    const page = { ...fixture.page, capturedAt: new Date().toISOString() };
    const binding = {
      tenantId: 'demo',
      userId: '7',
      quoteId: 'quote-synthetic',
      tabId: 42,
      carrierOrigin: page.origin,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    expect(validatePageBinding(page, binding)).toBeNull();
    expect(validatePageBinding({ ...page, tabId: 43 }, binding)).toBe('binding_mismatch');
    expect(validatePageBinding({ ...page, origin: 'https://elsewhere.test' }, binding)).toBe(
      'binding_mismatch',
    );
    expect(validatePageBinding({ ...page, authenticationRequired: true }, binding)).toBe(
      'authentication_required',
    );
  });
  it('normalizes representation whitespace without changing capitalization or facts', async () => {
    expect(await valueDigest(' Alex  Example ')).toBe(await valueDigest('Alex Example'));
    expect(await valueDigest('Alex')).not.toBe(await valueDigest('alex'));
  });
});
