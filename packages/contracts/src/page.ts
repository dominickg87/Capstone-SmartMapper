import { z } from 'zod';

import {
  ActionTargetSchema,
  ContractVersionSchema,
  MappingEvidenceSchema,
  RiskClassificationSchema,
  SourcePathSchema,
} from './common.js';

export const AccessibleControlSchema = z
  .object({
    controlKey: z.string().min(1),
    role: z.string().min(1),
    label: z.string().optional(),
    accessibleName: z.string().optional(),
    name: z.string().optional(),
    stableId: z.string().optional(),
    inputType: z.string().optional(),
    required: z.boolean(),
    disabled: z.boolean(),
    readOnly: z.boolean().optional(),
    visible: z.boolean().optional(),
    placeholder: z.string().optional(),
    autocomplete: z.string().optional(),
    containerKey: z.string().min(1).optional(),
    containerLabel: z.string().min(1).optional(),
    options: z.array(z.object({ label: z.string(), value: z.string() }).strict()).optional(),
    nearbyText: z.array(z.string()),
  })
  .strict();
export type AccessibleControl = z.infer<typeof AccessibleControlSchema>;

export const IframeMetadataSchema = z
  .object({
    frameKey: z.string().min(1),
    title: z.string().optional(),
    urlOrigin: z.string().url().optional(),
    sameOrigin: z.boolean(),
  })
  .strict();

export const CarrierPageSnapshotSchema = z
  .object({
    version: ContractVersionSchema,
    url: z.string().url(),
    title: z.string(),
    headings: z.array(z.string()),
    controls: z.array(AccessibleControlSchema),
    labels: z.array(z.string()),
    options: z.array(z.string()),
    validationMessages: z.array(z.string()),
    iframes: z.array(IframeMetadataSchema),
    screenshotReference: z.string().min(1).optional(),
    capturedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type CarrierPageSnapshot = z.infer<typeof CarrierPageSnapshotSchema>;

export const PageFingerprintSchema = z
  .object({
    version: ContractVersionSchema,
    adapterId: z.string().min(1),
    adapterVersion: z.string().min(1),
    pageId: z.string().min(1),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    matchedSignals: z.array(z.string()),
  })
  .strict();
export type PageFingerprint = z.infer<typeof PageFingerprintSchema>;

export const FieldMappingCandidateSchema = z
  .object({
    version: ContractVersionSchema,
    sourcePath: SourcePathSchema,
    target: ActionTargetSchema,
    evidence: z.array(MappingEvidenceSchema).min(1),
    confidence: z.number().min(0).max(1),
    risk: RiskClassificationSchema,
    requiresReview: z.boolean(),
  })
  .strict();
export type FieldMappingCandidate = z.infer<typeof FieldMappingCandidateSchema>;
