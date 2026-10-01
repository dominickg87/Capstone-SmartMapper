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
  carrierOriginAllowed,
  evaluateActiveTabAction,
  validatePageBinding,
  valueDigest,
  sectionActionsAllowed,
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
  it('allows clearly labeled fields outside targeted screenshots but requires images for unlabeled fields', () => {
    const page = structuredClone(fixture.page);
    page.coordinates = 'document';
    page.capture = { complete: true, unexpanded: 0, mode: 'targeted' };
    page.images = [{ screenshot: page.screenshot!, x: 0, y: 0, width: 800, height: 600 }];
    page.controls[0]!.rect.y = 1600;
    expect(sectionActionsAllowed([fixture.action], page)).toBe(true);
    page.controls[0]!.label = '';
    expect(sectionActionsAllowed([fixture.action], page)).toBe(false);
    page.images.push({ screenshot: page.screenshot!, x: 0, y: 1500, width: 800, height: 600 });
    expect(sectionActionsAllowed([fixture.action], page)).toBe(true);
    expect(
      sectionActionsAllowed([{ ...fixture.action, type: 'click' }, fixture.action], page),
    ).toBe(false);
  });
  it('plans across page sections only when every target has captured visual evidence', () => {
    const page = structuredClone(fixture.page);
    page.coordinates = 'document';
    page.capture = { complete: true, unexpanded: 0 };
    page.images = [
      { screenshot: page.screenshot!, x: 0, y: 0, width: 1000, height: 700 },
      { screenshot: page.screenshot!, x: 0, y: 600, width: 1000, height: 700 },
    ];
    page.controls.push({
      ...page.controls[0]!,
      elementId: 'lower',
      key: 'lower',
      section: 'Different section',
      rect: { x: 10, y: 800, width: 100, height: 30 },
    });
    const actions = [fixture.action, { ...fixture.action, actionId: 'a2', elementId: 'lower' }];
    expect(sectionActionsAllowed(actions, page)).toBe(true);
    page.images.pop();
    expect(sectionActionsAllowed(actions, page)).toBe(false);
    expect(sectionActionsAllowed([actions[1]!], page)).toBe(false);
  });
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
    ])
      expect(evaluateActiveTabAction(next, altered, fixture.source).allowed).toBe(false);
  });
  it('limits section plans to distinct, visible native entries in the same section', () => {
    const page = structuredClone(fixture.page);
    page.viewport = { width: 1000, height: 700 };
    page.controls.push({ ...page.controls[0]!, elementId: 'e1', key: 'last', label: 'Last name' });
    const actions = [fixture.action, { ...fixture.action, actionId: 'a2', elementId: 'e1' }];
    expect(sectionActionsAllowed(actions, page)).toBe(true);
    expect(sectionActionsAllowed([fixture.action, fixture.action], page)).toBe(false);
    expect(sectionActionsAllowed([fixture.action, { ...actions[1]!, type: 'click' }], page)).toBe(
      false,
    );
    page.controls[1]!.section = 'Other applicant';
    expect(sectionActionsAllowed(actions, page)).toBe(false);
    page.controls[1]!.section = page.controls[0]!.section;
    page.controls[1]!.rect.y = 800;
    expect(sectionActionsAllowed(actions, page)).toBe(false);
    delete page.viewport;
    expect(sectionActionsAllowed(actions, page)).toBe(false);
  });
  it('allows only the completed field value to change between section entries', () => {
    const before = structuredClone(fixture.page);
    before.controls.push({ ...before.controls[0]!, elementId: 'e1', key: 'last' });
    const after = structuredClone(before);
    after.controls[0]!.value = 'Alex';
    expect(unchangedAfterEntry(before, after, 'e0')).toBe(true);
    after.controls[1]!.value = 'Human edit';
    expect(unchangedAfterEntry(before, after, 'e0')).toBe(false);
    after.controls[1]!.value = '';
    after.controls[1]!.label = 'Changed question';
    expect(unchangedAfterEntry(before, after, 'e0')).toBe(false);
    after.controls[1]!.label = before.controls[1]!.label;
    after.textFingerprint = 'b'.repeat(64);
    expect(unchangedAfterEntry(before, after, 'e0')).toBe(false);
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
