import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AutomationActionV2Schema,
  PageObservationSchema,
  SourceAnswersSchema,
} from '@smartmapper/contracts';
import {
  carrierOriginAllowed,
  evaluateActiveTabAction,
  validatePageBinding,
  valueDigest,
  targetValueUnchangedOrExpected,
  unchangedAfterEntry,
  pageReadyToAdvance,
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
  it('permits only an ordinary Next after a fully inspected page without gaps or human decisions', () => {
    const page = structuredClone(fixture.page);
    page.capture = { complete: true, unexpanded: 0 };
    page.controls[0]!.value = 'Alex';
    page.controls.push({
      ...page.controls[0]!,
      elementId: 'next',
      key: 'next',
      tag: 'button',
      inputType: 'submit',
      label: 'Next',
      value: '',
      required: false,
      humanOnly: true,
      ordinaryNext: true,
    });
    const next = {
      ...fixture.action,
      elementId: 'next',
      type: 'next_page',
      sourceAnswerIds: [],
      value: null,
    };
    expect(pageReadyToAdvance(page)).toBe(true);
    expect(evaluateActiveTabAction(next, page, fixture.source).allowed).toBe(true);
    for (const label of [
      'Bind',
      'Issue policy',
      'Sell policy',
      'Submit',
      'Continue and pay',
      'Next: accept terms',
    ]) {
      page.controls[1]!.label = label;
      expect(evaluateActiveTabAction(next, page, fixture.source).allowed).toBe(false);
    }
    page.controls[1]!.label = 'Next';
    for (const altered of [
      { ...page, capture: { complete: false, unexpanded: 0 } },
      { ...page, capture: { complete: true, unexpanded: 1 } },
      { ...page, errors: ['Required answer'] },
      { ...page, unsupportedFrames: 1 },
      { ...page, headings: ['Payment'] },
      { ...page, pageText: 'By clicking Next, you authorize the purchase.' },
      {
        ...page,
        controls: [{ ...page.controls[0]!, required: true, value: '' }, page.controls[1]!],
      },
      {
        ...page,
        controls: [
          { ...page.controls[0]!, inputType: 'checkbox', humanOnly: true, checked: false },
          page.controls[1]!,
        ],
      },
      {
        ...page,
        controls: [
          {
            ...page.controls[0]!,
            tag: 'select' as const,
            inputType: 'select-one',
            humanOnly: true,
            required: false,
            value: '',
          },
          page.controls[1]!,
        ],
      },
    ])
      expect(evaluateActiveTabAction(next, altered, fixture.source).allowed).toBe(false);
  });
  it('ignores answer, validation and global-text mutations between independent entries', () => {
    const before = structuredClone(fixture.page);
    before.controls.push({ ...before.controls[0]!, elementId: 'e1', key: 'last' });
    const after = structuredClone(before);
    after.controls[0]!.value = 'Alex';
    expect(unchangedAfterEntry(before, after, 'e0')).toBe(true);
    after.controls[1]!.value = 'Human edit';
    after.controls[0]!.errors = ['Please use the carrier format'];
    after.controls[0]!.requiredSatisfied = false;
    after.controls[0]!.rect = { x: 900, y: 1200, width: 400, height: 80 };
    after.errors = ['Please review the highlighted field'];
    after.pageText = 'The carrier rerendered the page with validation text.';
    after.textFingerprint = 'b'.repeat(64);
    after.fingerprint = 'c'.repeat(64);
    expect(unchangedAfterEntry(before, after, 'e0')).toBe(true);
  });
  it('does not overwrite a target changed after observation', () => {
    expect(targetValueUnchangedOrExpected('', '', 'Alex')).toBe(true);
    expect(targetValueUnchangedOrExpected('', 'Alex', 'Alex')).toBe(true);
    expect(targetValueUnchangedOrExpected('', 'Human edit', 'Alex')).toBe(false);
    expect(targetValueUnchangedOrExpected(false, true, false)).toBe(false);
    expect(targetValueUnchangedOrExpected(false, true, true)).toBe(true);
    expect(targetValueUnchangedOrExpected(null, 'Human edit', 'Alex')).toBe(false);
  });
  it('relocates a React-replaced and reordered control set by semantic keys', () => {
    const before = structuredClone(fixture.page);
    before.controls.push({
      ...before.controls[0]!,
      elementId: 'e1',
      key: 'last-name-key',
      label: 'Last name',
      value: '',
    });
    const after = structuredClone(before);
    after.controls = after.controls.reverse().map((control, index) => ({
      ...control,
      elementId: `replacement-${index}`,
      value: index === 0 ? 'Example' : 'Alex',
      rect: { x: 30 + index * 300, y: 500, width: 240, height: 36 },
    }));
    expect(unchangedAfterEntry(before, after, 'e0')).toBe(true);
  });
  it('detects route, heading and material control-set changes', () => {
    const before = structuredClone(fixture.page);
    const changedRoute = structuredClone(before);
    changedRoute.routeId = 'a'.repeat(64);
    expect(unchangedAfterEntry(before, changedRoute, 'e0')).toBe(false);

    const changedHeading = structuredClone(before);
    changedHeading.headings = [...before.headings, 'Payment'];
    expect(unchangedAfterEntry(before, changedHeading, 'e0')).toBe(false);

    const changedQuestion = structuredClone(before);
    changedQuestion.controls[0]!.label = 'Different underwriting question';
    expect(unchangedAfterEntry(before, changedQuestion, 'e0')).toBe(false);

    const changedOptions = structuredClone(before);
    changedOptions.controls[0]!.options = [{ value: 'yes', label: 'Yes' }];
    expect(unchangedAfterEntry(before, changedOptions, 'e0')).toBe(false);

    const addedControl = structuredClone(before);
    addedControl.controls.push({
      ...before.controls[0]!,
      elementId: 'new-control',
      key: 'new-semantic-key',
      label: 'Newly revealed field',
    });
    expect(unchangedAfterEntry(before, addedControl, 'e0')).toBe(false);
  });
  it('allows new HTTPS origins only when explicitly enabled and keeps the default list closed', () => {
    const configured = new Set(['https://listed.test', 'http://127.0.0.1:4173']);
    expect(carrierOriginAllowed('https://listed.test', configured)).toBe(true);
    expect(carrierOriginAllowed('https://new-carrier.test', configured)).toBe(false);
    expect(carrierOriginAllowed('https://new-carrier.test', configured, true)).toBe(true);
    expect(carrierOriginAllowed('http://127.0.0.1:4173', configured, true)).toBe(true);
    expect(carrierOriginAllowed('http://localhost:9000', configured, true)).toBe(false);
  });
  it.each([
    'http://carrier.test',
    'ftp://carrier.test',
    'chrome://settings',
    'file:///quote.html',
    'https://user:password@carrier.test',
    'https://carrier.test/path',
    'https://carrier.test?x=1',
    'https://carrier.test#fragment',
    'https://carrier.test/',
    '*',
    'not a URL',
  ])('refuses unsafe or non-origin targets even in any-carrier mode: %s', (origin) => {
    expect(carrierOriginAllowed(origin, new Set(), true)).toBe(false);
  });
  it('requires actual source provenance', () => {
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
  });
  it('allows only a provenance-backed trained Add Applicant entity control', () => {
    const page = structuredClone(fixture.page);
    Object.assign(page.controls[0]!, {
      tag: 'button',
      inputType: 'button',
      role: 'button',
      label: 'Add Applicant',
      required: false,
    });
    const action = {
      ...fixture.action,
      type: 'click',
      value: null,
      purpose: 'add_entity',
    };
    expect(evaluateActiveTabAction(action, page, fixture.source).allowed).toBe(true);
    page.controls[0]!.label = 'Add';
    expect(evaluateActiveTabAction(action, page, fixture.source).allowed).toBe(false);
    page.controls[0]!.label = 'Add Applicant';
    expect(
      evaluateActiveTabAction({ ...action, sourceAnswerIds: [] }, page, fixture.source).allowed,
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
