import { randomUUID } from 'node:crypto';
import {
  AutomationActionV2Schema,
  MAX_PAGE_ACTIONS,
  SmartMapperPlanSchema,
  type PageObservation,
  type SmartMapperObservation,
} from '@smartmapper/contracts';
import { z } from 'zod';

// Provider-only encoding of the same action allowlist. Do not spend generated tokens on
// server-owned IDs, repeated page versions, or fields that must be null for this action.
const common = AutomationActionV2Schema.pick({
  elementId: true,
  sourceAnswerIds: true,
  transformation: true,
  confidence: true,
});
const shape = AutomationActionV2Schema.shape;
const compactAction = z.discriminatedUnion('type', [
  common.extend({ type: z.literal('fill'), value: shape.value.unwrap() }).strict(),
  common.extend({ type: z.literal('select'), value: shape.value.unwrap() }).strict(),
  common.extend({ type: z.literal('check'), checked: shape.checked.unwrap() }).strict(),
  common
    .extend({ type: z.literal('click'), purpose: shape.purpose.unwrap(), value: shape.value })
    .strict(),
  common.extend({ type: z.literal('key'), key: shape.key.unwrap() }).strict(),
  common.extend({ type: z.literal('scroll'), direction: shape.direction.unwrap() }).strict(),
  common.extend({ type: z.literal('wait'), milliseconds: shape.milliseconds.unwrap() }).strict(),
]);

export const CompactPlanSchema = SmartMapperPlanSchema.omit({ documentAnswers: true }).extend({
  actions: z.array(compactAction).max(MAX_PAGE_ACTIONS),
});

const compactPage = ({
  screenshot: _screenshot,
  images: _images,
  fingerprint: _fingerprint,
  textFingerprint: _textFingerprint,
  documentId: _documentId,
  routeId: _routeId,
  capturedAt: _capturedAt,
  ...page
}: PageObservation) => page;

export function compactObservation(request: SmartMapperObservation) {
  // Request-local aliases replace opaque hashes, never question wording, context or values.
  // Nothing is cached across jobs/quotes. All output aliases must resolve before policy checks.
  const answerIds = new Map(request.source.answers.map((answer, i) => ['s' + i, answer.answerId]));
  const page = compactPage(request.page);
  const observation = { ...request };
  delete observation.document;
  return {
    answerIds,
    input: {
      ...observation,
      page: {
        ...page,
        controls: page.controls.map((control) => ({ ...control, key: control.elementId })),
      },
      source: {
        formType: request.source.formType,
        unavailablePaths: request.source.unavailablePaths,
        answers: request.source.answers.map(({ questionId: _questionId, ...answer }, i) => ({
          ...answer,
          answerId: 's' + i,
        })),
      },
      attempts: Object.fromEntries(
        page.controls.map((control) => [control.elementId, request.attempts[control.key] ?? 0]),
      ),
      pageAttempts: request.attempts.__page__ ?? 0,
      verifiedControls: page.controls
        .filter((control) => request.verifiedControls.includes(control.key))
        .map((control) => control.elementId),
    },
  };
}

export function expandPlan(input: unknown, answerIds?: ReadonlyMap<string, string>) {
  const plan = CompactPlanSchema.parse(input);
  return SmartMapperPlanSchema.parse({
    ...plan,
    actions: plan.actions.map((action) => ({
      version: plan.version,
      pageStateId: plan.pageStateId,
      actionId: randomUUID(),
      value: null,
      checked: null,
      key: null,
      purpose: null,
      direction: null,
      milliseconds: null,
      ...action,
      sourceAnswerIds: action.sourceAnswerIds.map((id) => {
        if (!answerIds) return id;
        const original = answerIds.get(id);
        if (!original) throw new Error('unknown_source_alias');
        return original;
      }),
    })),
  });
}
