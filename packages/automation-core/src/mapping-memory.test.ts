import { describe, expect, it } from 'vitest';
import type {
  AutomationActionV2,
  PageControl,
  PageObservation,
  SourceAnswer,
  SourceAnswers,
} from '@smartmapper/contracts';
import { directRepresentationMatches, evaluateActiveTabAction, valueDigest } from './active-tab.js';
import {
  approveMapping,
  deriveMapping,
  fieldSignature,
  mappingCovers,
  recordMappingOutcome,
  replayMapping,
  usableMapping,
  type DerivedMapping,
} from './mapping-memory.js';

const SIGNATURE = 'a'.repeat(64);

const answer = (overrides: Partial<SourceAnswer> = {}): SourceAnswer => ({
  answerId: 'dob',
  questionId: 'applicant-dob',
  sourcePath: 'applicant1.dateOfBirth',
  question: 'Date of Birth',
  section: 'Applicant',
  entity: 'Applicant 1',
  context: [],
  options: [],
  value: '1990-04-12',
  status: 'answered',
  dataType: 'date',
  ...overrides,
});
const sourceOf = (answers: SourceAnswer[]): SourceAnswers => ({
  version: '2.0',
  tenantId: 'demo',
  userId: '7',
  quoteId: 'quote-synthetic',
  formType: 'auto',
  revision: 'revision-1',
  answers,
  unavailablePaths: [],
});
const control = (overrides: Partial<PageControl> = {}): PageControl => ({
  elementId: 'e0',
  key: 'key-0',
  signature: SIGNATURE,
  tag: 'input',
  inputType: 'text',
  role: 'textbox',
  label: 'Birth date',
  section: 'Applicant',
  context: [],
  value: '',
  checked: false,
  required: true,
  disabled: false,
  humanOnly: false,
  options: [],
  errors: [],
  rect: { x: 0, y: 0, width: 100, height: 20 },
  ...overrides,
});
const pageOf = (controls: PageControl[]): PageObservation => ({
  version: '2.0',
  tabId: 42,
  origin: 'http://127.0.0.1:4173',
  pageStateId: 'page-1',
  documentId: 'doc-1',
  routeId: 'route-1',
  fingerprint: 'f'.repeat(64),
  title: 'Synthetic carrier',
  headings: [],
  controls,
  errors: [],
  authenticationRequired: false,
  unsupportedFrames: 0,
  omittedControls: 0,
  capturedAt: new Date().toISOString(),
  screenshot: null,
});
const act = (overrides: Partial<AutomationActionV2> = {}): AutomationActionV2 => ({
  version: '2.0',
  actionId: 'action-1',
  type: 'fill',
  pageStateId: 'page-1',
  elementId: 'e0',
  sourceAnswerIds: ['dob'],
  value: '04/12/1990',
  checked: null,
  key: null,
  purpose: null,
  direction: null,
  milliseconds: null,
  transformation: { kind: 'format', explanation: 'US date format.' },
  confidence: 0.99,
  ...overrides,
});
const NOW = '2026-10-01T12:00:00.000Z';

function learned(derived: DerivedMapping | null) {
  if (!derived) throw new Error('expected a derived mapping');
  return approveMapping(undefined, SIGNATURE, derived, NOW);
}

describe('field signatures', () => {
  const identity = {
    tag: 'input',
    inputType: 'text',
    role: 'textbox',
    section: 'Applicant',
    label: 'First Name',
    name: 'first',
    id: 'first',
  };
  it('is stable for the same control and changes when its layout identity changes', async () => {
    const original = await fieldSignature(identity);
    expect(await fieldSignature({ ...identity })).toBe(original);
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    expect(await fieldSignature({ ...identity, label: 'Given name' })).not.toBe(original);
    expect(await fieldSignature({ ...identity, name: 'given' })).not.toBe(original);
  });
  it('separates repeated records by their section', async () => {
    const driver1 = await fieldSignature({ ...identity, section: 'Driver 1' });
    expect(await fieldSignature({ ...identity, section: 'Driver 2' })).not.toBe(driver1);
  });
});

describe('deriving a mapping from a verified action', () => {
  it('derives identity, date, join, option and check recipes without storing values', async () => {
    const source = sourceOf([answer()]);
    const date = await deriveMapping(act(), control(), [answer()], source);
    expect(date).toEqual({
      actionType: 'fill',
      questionIds: ['applicant-dob'],
      recipe: { kind: 'date', format: 'MM/DD/YYYY' },
    });
    expect(
      await deriveMapping(act({ value: '1990-04-12' }), control(), [answer()], source),
    ).toMatchObject({ recipe: { kind: 'identity' } });

    const first = answer({
      answerId: 'first',
      questionId: 'first',
      value: 'Alex',
      dataType: 'text',
    });
    const last = answer({
      answerId: 'last',
      questionId: 'last',
      value: 'Example',
      dataType: 'text',
    });
    expect(
      await deriveMapping(
        act({ value: 'Alex Example', sourceAnswerIds: ['first', 'last'] }),
        control({ label: 'Full name' }),
        [first, last],
        sourceOf([first, last]),
      ),
    ).toMatchObject({ questionIds: ['first', 'last'], recipe: { kind: 'join', separator: ' ' } });

    const marital = answer({
      answerId: 'marital',
      questionId: 'marital',
      value: 'Married',
      dataType: 'enum',
    });
    const select = control({
      tag: 'select',
      inputType: 'select-one',
      role: 'combobox',
      options: [
        { value: '', label: 'Choose' },
        { value: 'M', label: 'Married' },
        { value: 'S', label: 'Single' },
      ],
    });
    const option = await deriveMapping(
      act({ type: 'select', value: 'M', sourceAnswerIds: ['marital'] }),
      select,
      [marital],
      sourceOf([marital]),
    );
    expect(option).toEqual({
      actionType: 'select',
      questionIds: ['marital'],
      recipe: {
        kind: 'option',
        choices: [{ source: await valueDigest('Married'), target: await valueDigest('M') }],
      },
    });
    expect(JSON.stringify(option)).not.toContain('Married');

    const prior = answer({
      answerId: 'prior',
      questionId: 'prior',
      value: true,
      dataType: 'boolean',
    });
    const yes = control({ inputType: 'radio', label: 'Yes', section: 'Prior insurance' });
    expect(
      await deriveMapping(
        act({ type: 'check', value: null, checked: true, sourceAnswerIds: ['prior'] }),
        yes,
        [prior],
        sourceOf([prior]),
      ),
    ).toMatchObject({ actionType: 'check', recipe: { kind: 'check' } });
  });

  it('refuses ambiguous, extracted, multi-entity, human-only and unsupported entries', async () => {
    const source = sourceOf([answer()]);
    // 01/01 is both MM/DD and DD/MM, so the format cannot be learned from this entry.
    const newYear = answer({ value: '1990-01-01' });
    expect(
      await deriveMapping(act({ value: '01/01/1990' }), control(), [newYear], sourceOf([newYear])),
    ).toBeNull();
    // Extracting a year is not an allowlisted representation change.
    expect(await deriveMapping(act({ value: '1990' }), control(), [answer()], source)).toBeNull();
    const second = answer({ answerId: 'dob-2', entity: 'Applicant 2', value: '1992-02-03' });
    expect(
      await deriveMapping(act(), control(), [answer()], sourceOf([answer(), second])),
    ).toBeNull();
    expect(
      await deriveMapping(act(), control({ label: 'I agree to the terms' }), [answer()], source),
    ).toBeNull();
    expect(await deriveMapping(act(), control({ tag: 'custom' }), [answer()], source)).toBeNull();
    expect(
      await deriveMapping(
        act({ type: 'click', value: null, purpose: 'open_control' }),
        control(),
        [answer()],
        source,
      ),
    ).toBeNull();
    const text = answer({ answerId: 'occ', questionId: 'occ', value: 'Teacher', dataType: 'text' });
    expect(
      await deriveMapping(
        act({ type: 'select', value: 'T', sourceAnswerIds: ['occ'] }),
        control({ tag: 'select', options: [{ value: 'T', label: 'Teacher' }] }),
        [text],
        sourceOf([text]),
      ),
    ).toBeNull();
  });
});

describe('replaying an approved mapping', () => {
  it('rebuilds a policy-compliant action from the current quote', async () => {
    const entry = learned(await deriveMapping(act(), control(), [answer()], sourceOf([answer()])));
    const nextQuote = sourceOf([answer({ answerId: 'dob-new', value: '1985-11-30' })]);
    const page = pageOf([control()]);
    const replay = await replayMapping(entry, control(), page, nextQuote);
    expect(replay?.kind).toBe('act');
    if (replay?.kind !== 'act') return;
    expect(replay.action).toMatchObject({
      type: 'fill',
      value: '11/30/1985',
      sourceAnswerIds: ['dob-new'],
      transformation: { kind: 'format' },
    });
    const policy = evaluateActiveTabAction(replay.action, page, nextQuote);
    expect(policy.allowed).toBe(true);
    if (policy.allowed)
      expect(directRepresentationMatches(replay.action, policy.sources)).toBe(true);
  });

  it('maps a learned option and leaves unknown answers to the model', async () => {
    const marital = answer({
      answerId: 'marital',
      questionId: 'marital',
      value: 'Married',
      dataType: 'enum',
    });
    const select = control({
      tag: 'select',
      inputType: 'select-one',
      role: 'combobox',
      options: [
        { value: '', label: 'Choose' },
        { value: 'M', label: 'Married' },
        { value: 'S', label: 'Single' },
      ],
    });
    const entry = learned(
      await deriveMapping(
        act({ type: 'select', value: 'M', sourceAnswerIds: ['marital'] }),
        select,
        [marital],
        sourceOf([marital]),
      ),
    );
    const replay = await replayMapping(entry, select, pageOf([select]), sourceOf([marital]));
    expect(replay).toMatchObject({ kind: 'act', action: { type: 'select', value: 'M' } });
    const single = sourceOf([{ ...marital, value: 'Single' }]);
    expect(await replayMapping(entry, select, pageOf([select]), single)).toBeNull();
  });

  it('checks the learned radio only when the group is still unanswered', async () => {
    const prior = answer({
      answerId: 'prior',
      questionId: 'prior',
      value: true,
      dataType: 'boolean',
    });
    const yes = control({ inputType: 'radio', label: 'Yes', section: 'Prior insurance' });
    const no = control({
      elementId: 'e1',
      key: 'key-1',
      signature: 'b'.repeat(64),
      inputType: 'radio',
      label: 'No',
      section: 'Prior insurance',
    });
    const entry = learned(
      await deriveMapping(
        act({ type: 'check', value: null, checked: true, sourceAnswerIds: ['prior'] }),
        yes,
        [prior],
        sourceOf([prior]),
      ),
    );
    expect(await replayMapping(entry, yes, pageOf([yes, no]), sourceOf([prior]))).toMatchObject({
      kind: 'act',
      action: { type: 'check', checked: true },
    });
    expect(
      await replayMapping(entry, yes, pageOf([yes, { ...no, checked: true }]), sourceOf([prior])),
    ).toBeNull();
    expect(
      await replayMapping(entry, { ...yes, checked: true }, pageOf([yes]), sourceOf([prior])),
    ).toEqual({ kind: 'satisfied' });
  });

  it('never overwrites a different value, guesses an entity, or acts on changed controls', async () => {
    const source = sourceOf([answer()]);
    const entry = learned(await deriveMapping(act(), control(), [answer()], source));
    const page = pageOf([control()]);
    expect(await replayMapping(entry, control({ value: '01/02/1991' }), page, source)).toBeNull();
    expect(await replayMapping(entry, control({ value: '04/12/1990' }), page, source)).toEqual({
      kind: 'satisfied',
    });
    const twoApplicants = sourceOf([
      answer(),
      answer({ answerId: 'dob-2', entity: 'Applicant 2' }),
    ]);
    expect(await replayMapping(entry, control(), page, twoApplicants)).toBeNull();
    expect(await replayMapping(entry, control(), page, sourceOf([]))).toBeNull();
    expect(
      await replayMapping(
        entry,
        control(),
        page,
        sourceOf([answer({ status: 'missing', value: null })]),
      ),
    ).toBeNull();
    expect(
      await replayMapping(entry, control({ signature: 'c'.repeat(64) }), page, source),
    ).toBeNull();
    expect(
      await replayMapping(entry, control({ label: 'I agree to the terms' }), page, source),
    ).toBeNull();
    expect(await replayMapping(entry, control({ disabled: true }), page, source)).toBeNull();
  });
});

describe('approving and scoring entries', () => {
  it('merges option choices, replaces changed shapes, and tracks coverage', async () => {
    const marital = answer({
      answerId: 'marital',
      questionId: 'marital',
      value: 'Married',
      dataType: 'enum',
    });
    const select = control({
      tag: 'select',
      inputType: 'select-one',
      options: [
        { value: 'M', label: 'Married' },
        { value: 'S', label: 'Single' },
      ],
    });
    const derive = (value: string, target: string) =>
      deriveMapping(
        act({ type: 'select', value: target, sourceAnswerIds: ['marital'] }),
        select,
        [{ ...marital, value }],
        sourceOf([{ ...marital, value }]),
      );
    const married = await derive('Married', 'M');
    const single = await derive('Single', 'S');
    if (!married || !single) throw new Error('expected derived mappings');
    const first = approveMapping(undefined, SIGNATURE, married, NOW);
    expect(mappingCovers(first, married)).toBe(true);
    expect(mappingCovers(first, single)).toBe(false);
    const merged = approveMapping(first, SIGNATURE, single, NOW);
    expect(merged.approvals).toBe(2);
    expect(merged.recipe.kind === 'option' && merged.recipe.choices).toHaveLength(2);
    expect(mappingCovers(merged, single)).toBe(true);
    const replaced = approveMapping(merged, SIGNATURE, { ...married, questionIds: ['other'] }, NOW);
    expect(replaced.approvals).toBe(1);
    expect(replaced.questionIds).toEqual(['other']);
  });

  it('disables an entry after repeated failures and resets on a verified use', () => {
    const entry = approveMapping(
      undefined,
      SIGNATURE,
      { actionType: 'fill', questionIds: ['q'], recipe: { kind: 'identity' } },
      NOW,
    );
    const once = recordMappingOutcome(entry, false, NOW);
    expect(usableMapping(once)).toBe(true);
    const twice = recordMappingOutcome(once, false, NOW);
    expect(usableMapping(twice)).toBe(false);
    expect(
      mappingCovers(twice, {
        actionType: 'fill',
        questionIds: ['q'],
        recipe: { kind: 'identity' },
      }),
    ).toBe(false);
    const recovered = recordMappingOutcome(once, true, NOW);
    expect(recovered).toMatchObject({ failures: 0, uses: 1, lastUsedAt: NOW });
  });
});
