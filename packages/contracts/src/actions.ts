import { z } from 'zod';

import {
  ActionTargetSchema,
  ContractVersionSchema,
  RiskClassificationSchema,
  SourcePathSchema,
} from './common.js';

const ActionBaseSchema = z
  .object({
    version: ContractVersionSchema,
    actionId: z.string().min(1),
    risk: RiskClassificationSchema,
    rationale: z.string().min(1),
  })
  .strict();

const SourceActionBaseSchema = ActionBaseSchema.extend({
  sourcePath: SourcePathSchema,
  target: ActionTargetSchema,
}).strict();

export const AutomationActionSchema = z.discriminatedUnion('type', [
  SourceActionBaseSchema.extend({ type: z.literal('fillText') }).strict(),
  SourceActionBaseSchema.extend({ type: z.literal('selectOption') }).strict(),
  SourceActionBaseSchema.extend({
    type: z.literal('setRadio'),
    option: z.string().min(1),
  }).strict(),
  SourceActionBaseSchema.extend({
    type: z.literal('setCheckbox'),
    checkedWhen: z.enum(['truthy', 'falsy']),
  }).strict(),
  ActionBaseSchema.extend({
    type: z.literal('clickContinue'),
    target: ActionTargetSchema,
  }).strict(),
  ActionBaseSchema.extend({
    type: z.literal('waitForPage'),
    expectedPageId: z.string().min(1),
    timeoutMs: z.number().int().min(100).max(30_000),
  }).strict(),
  ActionBaseSchema.extend({
    type: z.literal('requestHumanInput'),
    fieldPath: SourcePathSchema.optional(),
    promptCode: z.string().min(1),
  }).strict(),
  ActionBaseSchema.extend({
    type: z.literal('pauseForAuthentication'),
    reasonCode: z.string().min(1),
  }).strict(),
  ActionBaseSchema.extend({
    type: z.literal('stop'),
    reasonCode: z.string().min(1),
  }).strict(),
]);
export type AutomationAction = z.infer<typeof AutomationActionSchema>;

export const AutomationActionResultSchema = z
  .object({
    version: ContractVersionSchema,
    actionId: z.string().min(1),
    status: z.enum(['executed', 'skipped', 'blocked', 'failed', 'requires_review']),
    reasonCode: z.string().min(1),
    sourcePath: SourcePathSchema.optional(),
    observedValueHash: z.string().optional(),
    readBackMatched: z.boolean().optional(),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type AutomationActionResult = z.infer<typeof AutomationActionResultSchema>;

export const ReviewItemSchema = z
  .object({
    version: ContractVersionSchema,
    reviewItemId: z.string().min(1),
    jobId: z.string().min(1),
    fieldPath: SourcePathSchema.optional(),
    reasonCode: z.enum([
      'missing_source',
      'conflicting_source',
      'unsupported_field',
      'low_confidence',
      'high_risk',
      'ambiguous_target',
      'read_back_mismatch',
      'authentication_required',
      'page_changed',
      'validation_error',
    ]),
    summary: z.string().min(1),
    risk: RiskClassificationSchema,
    blocking: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
