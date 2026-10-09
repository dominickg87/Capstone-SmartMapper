import { z } from 'zod';
import { FieldReviewSchema } from './smartmapper.js';

export const MappingStageSchema = z.enum([
  'authorize',
  'discover',
  'capture',
  'source',
  'plan',
  'verify',
  'fill',
  'read_back',
  'review',
  'navigate',
  'pause',
  'request',
]);
export type MappingStage = z.infer<typeof MappingStageSchema>;
export const DiagnosticCodeSchema = z.enum([
  'timeout',
  'cancelled',
  'network_error',
  'rate_limited',
  'unauthorized',
  'conflict',
  'invalid_payload',
  'dependency_error',
  'service_error',
  'page_changed',
  'read_back_mismatch',
  'blocked',
  'unavailable',
]);
export type DiagnosticCode = z.infer<typeof DiagnosticCodeSchema>;
export const DiagnosticCountsSchema = z
  .object({
    controls: z.number().int().nonnegative().optional(),
    actions: z.number().int().nonnegative().optional(),
    verified: z.number().int().nonnegative().optional(),
    reviews: z.number().int().nonnegative().optional(),
    trainedFields: z.number().int().nonnegative().optional(),
    matchedFields: z.number().int().nonnegative().optional(),
    batchIndex: z.number().int().nonnegative().optional(),
    batchSize: z.number().int().nonnegative().optional(),
  })
  .strict();
export type DiagnosticCounts = z.infer<typeof DiagnosticCountsSchema>;
export const DiagnosticApiReasonSchema = z.enum([
  'revision_conflict',
  'receipt_conflict',
  'training_conflict',
  'conflict',
  'preview_page_changed',
  'invalid_preview_result',
  'mapping_not_trained',
  'mapping_workflow_ambiguous',
  'mapping_selection_unavailable',
  'mapping_not_testable',
  'mapping_carrier_mismatch',
  'preview_tab_changed',
  'preview_owner_changed',
  'mapping_unavailable',
]);
export const DiagnosticEventSchema = z
  .object({
    id: z.string().uuid(),
    requestId: z.string().uuid(),
    jobId: z.string().uuid().nullable(),
    layer: z.enum(['extension', 'backend']),
    stage: MappingStageSchema,
    phase: z.enum(['begin', 'end', 'error', 'info']),
    at: z.iso.datetime(),
    elapsedMs: z.number().int().nonnegative(),
    code: DiagnosticCodeSchema.optional(),
    apiReason: DiagnosticApiReasonSchema.optional(),
    clientRevision: z.number().int().nonnegative().optional(),
    serverRevision: z.number().int().nonnegative().optional(),
    counts: DiagnosticCountsSchema.optional(),
    reviewReasons: z
      .array(
        z
          .object({ reason: FieldReviewSchema.shape.reason, count: z.number().int().positive() })
          .strict(),
      )
      .max(30)
      .optional(),
    targetKey: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    actionType: z
      .enum(['fill', 'select', 'check', 'click', 'key', 'scroll', 'wait', 'next_page'])
      .optional(),
    receiptStatus: z
      .enum(['verified', 'already_correct', 'executed', 'failed', 'blocked'])
      .optional(),
    receiptReason: z
      .enum([
        'matched',
        'applied',
        'read_back_mismatch',
        'validation_error',
        'page_changed',
        'tab_changed',
        'policy_blocked',
        'control_missing',
        'interrupted',
      ])
      .optional(),
  })
  .strict();
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>;
export const DiagnosticsResponseSchema = z
  .object({
    events: z.array(DiagnosticEventSchema).max(100),
    buildVersion: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/)
      .optional(),
  })
  .strict();

// Deliberately never serialize arbitrary error messages, URLs, payloads or stack traces.
export function diagnosticCode(error: unknown): DiagnosticCode {
  const item =
    error && typeof error === 'object'
      ? (error as { name?: unknown; status?: unknown; code?: unknown })
      : {};
  if (['TimeoutError', 'APIConnectionTimeoutError'].includes(String(item.name))) return 'timeout';
  if (['AbortError', 'APIUserAbortError'].includes(String(item.name))) return 'cancelled';
  if (item.status === 429) return 'rate_limited';
  if (item.status === 401 || item.status === 403) return 'unauthorized';
  if (item.status === 409) return 'conflict';
  if (item.status === 504 || item.status === 408) return 'timeout';
  if (item.name === 'ZodError' || item.status === 400) return 'invalid_payload';
  if (item.name === 'TypeError' || item.name === 'APIConnectionError') return 'network_error';
  const code = DiagnosticCodeSchema.safeParse(item.code);
  if (code.success) return code.data;
  return typeof item.status === 'number' ? 'dependency_error' : 'service_error';
}
