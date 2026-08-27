import { z } from 'zod';

import { ReviewItemSchema } from './actions.js';
import { ContractVersionSchema } from './common.js';

export const ExecutionModeSchema = z.enum(['extension', 'remote_browser']);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const QuoteJobStateSchema = z.enum([
  'created',
  'queued',
  'provisioning',
  'waiting_for_login',
  'running',
  'waiting_for_user',
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'expired',
]);
export type QuoteJobState = z.infer<typeof QuoteJobStateSchema>;

export const QuoteJobSchema = z
  .object({
    version: ContractVersionSchema,
    jobId: z.string().min(1),
    tenantReference: z.string().min(1),
    userReference: z.string().min(1),
    quoteReference: z.string().min(1),
    adapterId: z.string().min(1),
    adapterVersion: z.string().min(1),
    executionMode: ExecutionModeSchema,
    state: QuoteJobStateSchema,
    currentPageId: z.string().optional(),
    reviewItems: z.array(ReviewItemSchema),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type QuoteJob = z.infer<typeof QuoteJobSchema>;

export const AuditEventSchema = z
  .object({
    version: ContractVersionSchema,
    eventId: z.string().min(1),
    jobId: z.string().min(1),
    eventType: z.enum([
      'job_state_changed',
      'page_recognized',
      'action_evaluated',
      'action_executed',
      'action_blocked',
      'read_back_compared',
      'review_item_created',
      'session_closed',
    ]),
    actor: z.enum(['user', 'extension_executor', 'remote_browser_executor', 'system']),
    sourcePath: z.string().optional(),
    reasonCode: z.string().min(1),
    detailHash: z.string().optional(),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type AuditEvent = z.infer<typeof AuditEventSchema>;
