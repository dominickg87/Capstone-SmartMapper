import { z } from 'zod';

const id = z.string().min(1).max(160);
const shortText = z.string().max(2000);
const origin = z
  .string()
  .url()
  .refine((value) => new URL(value).origin === value, 'Expected an origin');
const scalar = z.union([z.string().max(8000), z.number().finite(), z.boolean()]);

export const SourceAnswerSchema = z
  .object({
    answerId: id,
    questionId: id,
    sourcePath: id,
    question: z.string().min(1).max(4000),
    section: shortText,
    entity: shortText,
    context: z.array(shortText).max(30),
    options: z.array(z.object({ value: scalar, label: shortText }).strict()).max(300),
    value: scalar.nullable(),
    status: z.enum(['answered', 'missing', 'conflicting', 'human_only']),
    dataType: z.enum(['text', 'date', 'number', 'boolean', 'enum']),
  })
  .strict();
export type SourceAnswer = z.infer<typeof SourceAnswerSchema>;

export const SourceAnswersSchema = z
  .object({
    version: z.literal('2.0'),
    tenantId: id,
    userId: id,
    quoteId: id,
    formType: id,
    revision: id,
    answers: z.array(SourceAnswerSchema).max(2000),
    unavailablePaths: z.array(id).max(2000),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.answers.map((answer) => answer.answerId)).size === value.answers.length,
    'Duplicate answer IDs',
  );
export type SourceAnswers = z.infer<typeof SourceAnswersSchema>;

export const PageControlSchema = z
  .object({
    elementId: id,
    key: id,
    tag: z.enum(['input', 'textarea', 'select', 'button', 'custom']),
    inputType: z.string().max(40),
    role: z.string().max(40),
    label: shortText,
    section: shortText,
    context: z.array(shortText).max(10),
    value: z.string().max(8000),
    checked: z.boolean(),
    required: z.boolean(),
    disabled: z.boolean(),
    humanOnly: z.boolean(),
    options: z.array(z.object({ value: z.string().max(2000), label: shortText }).strict()).max(300),
    errors: z.array(shortText).max(20),
    rect: z
      .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
      .strict(),
  })
  .strict();
export type PageControl = z.infer<typeof PageControlSchema>;

export const PageObservationSchema = z
  .object({
    version: z.literal('2.0'),
    tabId: z.number().int().nonnegative(),
    origin,
    pageStateId: id,
    documentId: id,
    routeId: id,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    title: shortText,
    headings: z.array(shortText).max(30),
    controls: z.array(PageControlSchema).max(400),
    errors: z.array(shortText).max(30),
    authenticationRequired: z.boolean(),
    unsupportedFrames: z.number().int().nonnegative(),
    omittedControls: z.number().int().nonnegative(),
    capturedAt: z.iso.datetime(),
    screenshot: z
      .string()
      .max(8_000_000)
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
      .nullable(),
  })
  .strict();
export type PageObservation = z.infer<typeof PageObservationSchema>;

// One bounded representation, shared by the provider, server policy and executor.
// Null fields are explicit so the same schema works with strict Structured Outputs.
export const AutomationActionV2Schema = z
  .object({
    version: z.literal('2.0'),
    actionId: id,
    type: z.enum(['fill', 'select', 'check', 'click', 'key', 'scroll', 'wait']),
    pageStateId: id,
    elementId: id.nullable(),
    sourceAnswerIds: z.array(id).max(10),
    value: z.string().max(8000).nullable(),
    checked: z.boolean().nullable(),
    key: z.enum(['ArrowDown', 'ArrowUp', 'Escape', 'Tab']).nullable(),
    purpose: z
      .enum(['open_control', 'select_option', 'add_entity', 'expand_section', 'close_dialog'])
      .nullable(),
    direction: z.enum(['up', 'down']).nullable(),
    milliseconds: z.number().int().min(0).max(3000).nullable(),
    transformation: z
      .object({
        kind: z.enum(['identity', 'format', 'equivalent_option', 'compose', 'extract']),
        explanation: shortText,
      })
      .strict(),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type AutomationActionV2 = z.infer<typeof AutomationActionV2Schema>;

export const FieldReviewSchema = z
  .object({
    elementId: id.nullable(),
    question: shortText,
    entity: shortText,
    reason: z.enum([
      'missing_source',
      'missing_question_context',
      'ambiguous_match',
      'human_only',
      'validation_error',
      'unsupported_control',
      'source_mismatch',
      'retry_limit',
      'page_changed',
    ]),
  })
  .strict();
export type FieldReview = z.infer<typeof FieldReviewSchema>;

export const SmartMapperPlanSchema = z
  .object({
    version: z.literal('2.0'),
    pageStateId: id,
    outcome: z.enum(['act', 'page_complete', 'human_input', 'blocked']),
    actions: z.array(AutomationActionV2Schema).max(1),
    reviews: z.array(FieldReviewSchema).max(100),
  })
  .strict();
export type SmartMapperPlan = z.infer<typeof SmartMapperPlanSchema>;

export const ActionReceiptSchema = z
  .object({
    actionId: id,
    status: z.enum(['verified', 'already_correct', 'executed', 'failed', 'blocked']),
    reason: z.enum([
      'matched',
      'applied',
      'read_back_mismatch',
      'validation_error',
      'page_changed',
      'tab_changed',
      'policy_blocked',
      'control_missing',
      'interrupted',
    ]),
    observedHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
export type ActionReceipt = z.infer<typeof ActionReceiptSchema>;

export const JobBindingSchema = z
  .object({
    tenantId: id,
    userId: id,
    quoteId: id,
    carrierOrigin: origin,
    tabId: z.number().int().nonnegative(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type JobBinding = z.infer<typeof JobBindingSchema>;

export const RedeemedGrantSchema = z
  .object({
    version: z.literal('2.0'),
    binding: JobBindingSchema,
    sourceToken: z.string().min(32).max(256),
    source: SourceAnswersSchema,
  })
  .strict();
export type RedeemedGrant = z.infer<typeof RedeemedGrantSchema>;

export const StartJobSchema = z
  .object({
    miaOrigin: origin,
    code: z.string().min(32).max(256),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    carrierOrigin: origin,
    tabId: z.number().int().nonnegative(),
  })
  .strict();
export type StartJob = z.infer<typeof StartJobSchema>;

export const MappingChatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string().trim().min(1).max(4000),
  })
  .strict();
export type MappingChatMessage = z.infer<typeof MappingChatMessageSchema>;
export const MappingConversationSchema = z.array(MappingChatMessageSchema).max(20);
export const MappingChatReplySchema = z
  .object({
    version: z.literal('2.0'),
    reply: z.string().trim().min(1).max(4000),
  })
  .strict();
export type MappingChatReply = z.infer<typeof MappingChatReplySchema>;
export const MappingChatRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    observation: PageObservationSchema,
    conversation: MappingConversationSchema.refine(
      (messages) =>
        messages.length > 0 &&
        messages.length % 2 === 1 &&
        messages.every(
          (message, index) => message.role === (index % 2 === 0 ? 'user' : 'assistant'),
        ),
      'Expected alternating conversation ending with a user message',
    ),
  })
  .strict();

export const ObserveRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    resume: z.boolean(),
    observation: PageObservationSchema,
    conversation: MappingConversationSchema.default([]),
  })
  .strict();

export const ReceiptRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    batchId: z.string().uuid(),
    receipt: ActionReceiptSchema,
  })
  .strict();

export const JobViewSchema = z
  .object({
    version: z.literal('2.0'),
    jobId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    status: z.enum([
      'ready',
      'planning',
      'executing',
      'running',
      'paused',
      'page_complete',
      'human_input',
      'blocked',
    ]),
    binding: JobBindingSchema,
    verified: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    reviews: z.array(FieldReviewSchema).max(100),
  })
  .strict();
export type JobView = z.infer<typeof JobViewSchema>;

export const MappingChatResponseSchema = z
  .object({
    job: JobViewSchema,
    response: MappingChatReplySchema,
  })
  .strict();
export type MappingChatResponse = z.infer<typeof MappingChatResponseSchema>;

export const ActionBatchSchema = z
  .object({
    batchId: z.string().uuid(),
    action: AutomationActionV2Schema,
    sources: z.array(SourceAnswerSchema).max(10),
  })
  .strict();
export type ActionBatch = z.infer<typeof ActionBatchSchema>;

export const ObserveResponseSchema = z
  .object({
    job: JobViewSchema,
    batch: ActionBatchSchema.nullable(),
  })
  .strict();
export type ObserveResponse = z.infer<typeof ObserveResponseSchema>;

export interface SmartMapperObservation {
  page: PageObservation;
  source: SourceAnswers;
  attempts: Record<string, number>;
  recentResults: ActionReceipt[];
  verifiedControls: string[];
  conversation?: MappingChatMessage[];
}

export interface MappingChatContext {
  page: PageObservation;
  source: SourceAnswers;
  conversation: MappingChatMessage[];
  recentResults: ActionReceipt[];
}
