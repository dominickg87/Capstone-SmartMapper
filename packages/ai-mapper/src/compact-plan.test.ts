import { describe, expect, it } from 'vitest';
import { MAX_PAGE_ACTIONS } from '@smartmapper/contracts';
import { compactObservation, expandPlan } from './compact-plan.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PageObservationSchema, SourceAnswersSchema } from '@smartmapper/contracts';
import { z } from 'zod';

const shared = {
  elementId: 'e1',
  sourceAnswerIds: ['source-1'],
  transformation: { kind: 'identity', explanation: 'Same fact.' },
  confidence: 0.99,
};
const plan = (actions: unknown[]) => ({
  version: '2.0',
  pageStateId: 'page-1',
  outcome: 'act',
  actions,
  reviews: [],
});

describe('compact provider action encoding', () => {
  it.each([
    { type: 'fill', value: 'Alex' },
    { type: 'select', value: 'own' },
    { type: 'check', checked: false },
    { type: 'click', purpose: 'select_option', value: 'own' },
    { type: 'click', purpose: 'open_control', value: null },
    { type: 'key', key: 'Escape' },
    { type: 'scroll', direction: 'down', elementId: null, sourceAnswerIds: [] },
    { type: 'wait', milliseconds: 200, elementId: null, sourceAnswerIds: [] },
  ])('preserves all supplied facts and parameters for $type', (action) => {
    const expanded = expandPlan(plan([{ ...shared, ...action }]));
    expect(expanded.actions[0]?.actionId).toEqual(expect.any(String));
    expect(expanded.actions[0]).toEqual({
      version: '2.0',
      pageStateId: 'page-1',
      actionId: expanded.actions[0]?.actionId,
      value: null,
      checked: null,
      purpose: null,
      key: null,
      direction: null,
      milliseconds: null,
      ...shared,
      ...action,
    });
  });
  it('assigns unique server IDs and keeps the explicit page revision', () => {
    const result = expandPlan(
      plan([
        { ...shared, type: 'fill', value: 'Alex' },
        { ...shared, elementId: 'e2', type: 'fill', value: 'Example' },
      ]),
    );
    expect(new Set(result.actions.map((action) => action.actionId)).size).toBe(2);
    expect(result.actions.every((action) => action.pageStateId === 'page-1')).toBe(true);
  });
  it('round-trips request-local aliases without dropping original questions, source facts or retry state', () => {
    const fixture = z
      .object({ source: SourceAnswersSchema, page: PageObservationSchema })
      .parse(
        JSON.parse(readFileSync(resolve('fixtures/mia-quotes/active-tab.synthetic.json'), 'utf8')),
      );
    const original = fixture.source.answers[0]!;
    const target = fixture.page.controls[0]!;
    const compact = compactObservation({
      ...fixture,
      attempts: { [target.key]: 5, __page__: 2 },
      verifiedControls: [target.key],
      recentResults: [],
    });
    expect(compact.input.source.answers[0]).toEqual({
      answerId: 's0',
      sourcePath: original.sourcePath,
      question: original.question,
      section: original.section,
      entity: original.entity,
      context: original.context,
      options: original.options,
      value: original.value,
      status: original.status,
      dataType: original.dataType,
    });
    expect(compact.input.page.controls[0]).toEqual({ ...target, key: target.elementId });
    expect(compact.input.attempts[target.elementId]).toBe(5);
    expect(compact.input.pageAttempts).toBe(2);
    expect(compact.input.verifiedControls).toContain(target.elementId);
    expect(compact.input.source.unavailablePaths).toEqual(fixture.source.unavailablePaths);
    expect(JSON.stringify(compact.input)).not.toContain('data:image');
    const actions = [{ ...shared, type: 'fill', value: original.value, sourceAnswerIds: ['s0'] }];
    expect(expandPlan(plan(actions), compact.answerIds).actions[0]?.sourceAnswerIds).toEqual([
      original.answerId,
    ]);
    const differentQuote = new Map([['s0', 'different-original-answer']]);
    expect(expandPlan(plan(actions), differentQuote).actions[0]?.sourceAnswerIds).toEqual([
      'different-original-answer',
    ]);
    expect(() => expandPlan(plan(actions), new Map())).toThrow('unknown_source_alias');
    expect(original.answerId).not.toBe('s0');
    expect(target.key).not.toBe(target.elementId);
  });
  it.each([
    { type: 'submit' },
    { type: 'fill' },
    { type: 'fill', value: 'Alex', key: 'Enter' },
    { type: 'fill', value: 'Alex', script: 'document.forms[0].submit()' },
    { type: 'fill', value: 'Alex', actionId: 'replay-id' },
    { type: 'fill', value: 'Alex', pageStateId: 'another-page' },
    { type: 'check', checked: 'false' },
    { type: 'click', purpose: 'select_option' },
    { type: 'wait', milliseconds: 60000 },
  ])('rejects forbidden or malformed compact output: %j', (action) => {
    expect(() => expandPlan(plan([{ ...shared, ...action }]))).toThrow();
  });
  it('retains bounded batches, review schema and protocol version validation', () => {
    expect(() =>
      expandPlan(
        plan(
          Array.from({ length: MAX_PAGE_ACTIONS + 1 }, () => ({
            ...shared,
            type: 'fill',
            value: 'Alex',
          })),
        ),
      ),
    ).toThrow();
    expect(() => expandPlan({ ...plan([]), version: '3.0' })).toThrow();
    expect(() => expandPlan({ ...plan([]), reviews: [{ reason: 'ignore_policy' }] })).toThrow();
  });
});
