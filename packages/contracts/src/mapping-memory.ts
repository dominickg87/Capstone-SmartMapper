import { z } from 'zod';

// Human-approved mapping memory (proposed ADR 0007). Entries describe how a carrier control is
// filled from M.I.A. questions. They never contain answer values, page labels or option text:
// only the control signature, question IDs, a deterministic recipe, and value digests.

const id = z.string().min(1).max(160);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const MAPPING_DATE_FORMATS = [
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'MM-DD-YYYY',
  'M/D/YYYY',
  'DD/MM/YYYY',
] as const;
export type MappingDateFormat = (typeof MAPPING_DATE_FORMATS)[number];
export const MAPPING_JOIN_SEPARATORS = [' ', ', '] as const;

export const MappingRecipeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('identity') }).strict(),
  z.object({ kind: z.literal('date'), format: z.enum(MAPPING_DATE_FORMATS) }).strict(),
  z.object({ kind: z.literal('join'), separator: z.enum(MAPPING_JOIN_SEPARATORS) }).strict(),
  z
    .object({
      kind: z.literal('option'),
      choices: z
        .array(z.object({ source: digest, target: digest }).strict())
        .min(1)
        .max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal('check'),
      choices: z
        .array(z.object({ source: digest, checked: z.boolean() }).strict())
        .min(1)
        .max(20),
    })
    .strict(),
]);
export type MappingRecipe = z.infer<typeof MappingRecipeSchema>;
export type MappingRecipeKind = MappingRecipe['kind'];

export const MappingActionTypeSchema = z.enum(['fill', 'select', 'check']);
export type MappingActionType = z.infer<typeof MappingActionTypeSchema>;

export const LearnedMappingSchema = z
  .object({
    version: z.literal('1.0'),
    signature: digest,
    questionIds: z.array(id).min(1).max(4),
    actionType: MappingActionTypeSchema,
    recipe: MappingRecipeSchema,
    approvals: z.number().int().positive(),
    uses: z.number().int().nonnegative(),
    // Consecutive failures; a verified use resets it.
    failures: z.number().int().nonnegative(),
    approvedAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type LearnedMapping = z.infer<typeof LearnedMappingSchema>;

// What the job view exposes about a model-filled entry the human may approve at the end of a job.
export const MappingCandidateViewSchema = z
  .object({
    candidateId: z.string().uuid(),
    kind: z.enum(['identity', 'date', 'join', 'option', 'check']),
  })
  .strict();
export type MappingCandidateView = z.infer<typeof MappingCandidateViewSchema>;

export const ApproveMappingsRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    candidateIds: z.array(z.string().uuid()).max(100),
    // Batches filled from memory that the human later changed by hand.
    corrections: z.array(z.string().uuid()).max(200).default([]),
  })
  .strict()
  .refine(
    (value) => new Set(value.candidateIds).size === value.candidateIds.length,
    'Duplicate candidate IDs',
  );
