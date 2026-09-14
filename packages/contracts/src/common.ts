import { z } from 'zod';

export const ContractVersionSchema = z.literal('1.0');
export type ContractVersion = z.infer<typeof ContractVersionSchema>;

export const IsoDateSchema = z.iso.date();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const SourcePathSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z][a-zA-Z0-9]*(?:\[\d+\]|\.[a-zA-Z][a-zA-Z0-9]*)*$/);

export const RiskClassificationSchema = z.enum(['low', 'medium', 'high', 'prohibited']);
export type RiskClassification = z.infer<typeof RiskClassificationSchema>;

export const MappingEvidenceSchema = z
  .object({
    kind: z.enum([
      'adapter_rule',
      'label',
      'accessible_name',
      'role',
      'nearby_text',
      'name',
      'stable_id',
      'autocomplete',
      'placeholder',
      'prior_approved_mapping',
      'semantic_similarity',
    ]),
    detail: z.string().min(1),
    weight: z.number().min(0).max(1),
  })
  .strict();
export type MappingEvidence = z.infer<typeof MappingEvidenceSchema>;

export const ActionTargetSchema = z
  .object({
    label: z.string().min(1).optional(),
    accessibleName: z.string().min(1).optional(),
    role: z
      .enum(['textbox', 'combobox', 'radio', 'checkbox', 'button', 'link', 'spinbutton'])
      .optional(),
    name: z.string().min(1).optional(),
    stableId: z.string().min(1).optional(),
    nearbyText: z.string().min(1).optional(),
  })
  .strict()
  .refine((target) => Object.values(target).some(Boolean), {
    message: 'At least one stable target hint is required.',
  });
export type ActionTarget = z.infer<typeof ActionTargetSchema>;
