import { evaluateActionPolicy, evaluateMappingGate } from '@smartmapper/automation-core/browser';
import {
  AccessibleControlSchema,
  AutomationActionSchema,
  FieldMappingCandidateSchema,
  type AutomationAction,
} from '@smartmapper/contracts';
import { z } from 'zod';
import { fieldDictionary, type FieldSignalDefinition } from './field-dictionary.js';
import { AMBIGUITY_MARGIN, matchAll, scoreControl } from './matching.js';

export const ExtensionFieldSchema = z.object({
  id: z.string().min(1),
  tag: z.string(),
  type: z.string(),
  role: z.string().optional(),
  label: z.string(),
  accessibleName: z.string().optional(),
  name: z.string(),
  htmlId: z.string(),
  placeholder: z.string().optional(),
  autocomplete: z.string().optional(),
  section: z.string().optional(),
  nearbyText: z
    .union([z.string(), z.array(z.string())])
    .transform((text) => (typeof text === 'string' ? [text] : text))
    .optional(),
  previousCellText: z.string().optional(),
  currentCellText: z.string().optional(),
  nextCellText: z.string().optional(),
  required: z.boolean(),
  disabled: z.boolean(),
  readOnly: z.boolean().optional(),
  hasValue: z.boolean().optional(),
  options: z
    .array(
      z.union([
        z.string().transform((text) => ({ label: text, value: text, disabled: false })),
        z
          .object({
            label: z.string().optional(),
            text: z.string().optional(),
            value: z.string(),
            disabled: z.boolean().optional(),
          })
          .transform((option) => ({
            label: option.label ?? option.text ?? '',
            value: option.value,
            disabled: option.disabled === true,
          })),
      ]),
    )
    .optional(),
});
export const ExtensionSnapshotSchema = z.object({
  href: z.string().url(),
  fields: z.array(ExtensionFieldSchema).max(120),
  tabId: z.number().int().nonnegative(),
  documentId: z.string().min(1),
  fieldLimitReached: z.boolean().optional(),
});
export type ExtensionSnapshot = z.infer<typeof ExtensionSnapshotSchema>;
export interface ExtensionMappingStep {
  action: AutomationAction;
  field: z.infer<typeof ExtensionFieldSchema>;
  definition: FieldSignalDefinition;
  confidence: number;
}
export interface ExtensionReview {
  source_path?: string;
  field_id?: string;
  reason: string;
}

export class ExtensionMappingError extends Error {
  public constructor(
    public readonly reasonCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExtensionMappingError';
  }
}

export function planExtensionMappings(untrustedSnapshot: unknown): {
  snapshot: ExtensionSnapshot;
  steps: ExtensionMappingStep[];
  skipped: ExtensionReview[];
} {
  const parsed = ExtensionSnapshotSchema.safeParse(untrustedSnapshot);
  if (!parsed.success)
    throw new ExtensionMappingError('invalid_snapshot', 'Invalid page snapshot. Read Page again.');
  const snapshot = parsed.data;
  if (snapshot.fieldLimitReached)
    throw new ExtensionMappingError(
      'field_limit',
      'Page exceeds the field limit. Review this page manually.',
    );
  if (new Set(snapshot.fields.map(({ id }) => id)).size !== snapshot.fields.length) {
    throw new ExtensionMappingError(
      'duplicate_field_ids',
      'Duplicate page field identifiers. Read Page again.',
    );
  }
  const controls = snapshot.fields.map((field) =>
    AccessibleControlSchema.parse({
      controlKey: field.id,
      role: field.tag === 'select' ? 'select' : field.role || field.tag,
      inputType: field.type,
      label: field.label,
      accessibleName: field.accessibleName,
      name: field.name,
      stableId: field.htmlId,
      placeholder: field.placeholder,
      autocomplete: field.autocomplete,
      required: field.required,
      disabled: field.disabled,
      readOnly: field.readOnly,
      visible: true,
      options: field.options
        ?.filter((option) => !option.disabled)
        .map(({ label, value }) => ({ label, value })),
      nearbyText: [
        field.previousCellText,
        field.currentCellText,
        field.nextCellText,
        ...(field.nearbyText ?? []),
      ].filter((text): text is string => Boolean(text)),
    }),
  );
  const steps: ExtensionMappingStep[] = [];
  const skipped: ExtensionReview[] = [];
  for (const match of matchAll(fieldDictionary, controls)) {
    const sourcePath = match.definition.sourcePath;
    if (match.outcome === 'notFound') continue;
    if (match.outcome === 'ambiguous') {
      skipped.push({ source_path: sourcePath, reason: 'ambiguous_target' });
      continue;
    }
    const field = snapshot.fields.find(({ id }) => id === match.control.controlKey);
    if (!field) continue;
    const competingMeaning = fieldDictionary.some((definition) => {
      if (definition.sourcePath === sourcePath) return false;
      const other = scoreControl(definition, match.control);
      return other !== undefined && other.score >= match.score - AMBIGUITY_MARGIN;
    });
    if (competingMeaning) {
      skipped.push({
        source_path: sourcePath,
        field_id: field.id,
        reason: 'conflicting_target_signals',
      });
      continue;
    }
    // Custom widgets require their own executor; assigning textContent is not reliable entry.
    if (
      !['input', 'select', 'textarea'].includes(field.tag) ||
      (field.role === 'combobox' && field.tag !== 'select')
    ) {
      skipped.push({ source_path: sourcePath, field_id: field.id, reason: 'unsupported_control' });
      continue;
    }
    const context = [field.section, ...match.control.nearbyText].filter(Boolean).join(' ');
    const target = {
      role: field.tag === 'select' ? ('combobox' as const) : ('textbox' as const),
      ...(field.label ? { label: field.label } : {}),
      ...(field.name ? { name: field.name } : {}),
      ...(field.htmlId ? { stableId: field.htmlId } : {}),
      ...(context ? { nearbyText: context } : {}),
    };
    const candidate = FieldMappingCandidateSchema.parse({
      version: '1.0',
      sourcePath,
      target,
      evidence: match.evidence,
      confidence: match.score,
      risk: match.definition.risk,
      requiresReview: match.outcome === 'lowConfidence',
    });
    const action = AutomationActionSchema.parse({
      version: '1.0',
      actionId: 'semantic-' + field.id,
      sourcePath,
      target,
      type: field.tag === 'select' ? 'selectOption' : 'fillText',
      risk: match.definition.risk,
      rationale: 'Deterministic semantic field match',
    });
    const gate = evaluateMappingGate(candidate);
    const policy = evaluateActionPolicy(action);
    if (gate.disposition !== 'allow' || policy.disposition !== 'allow') {
      skipped.push({
        source_path: sourcePath,
        field_id: field.id,
        reason: gate.disposition !== 'allow' ? gate.reasonCode : policy.reasonCode,
      });
      continue;
    }
    steps.push({ action, field, definition: match.definition, confidence: match.score });
  }
  return { snapshot, steps, skipped };
}

// Ignore values when checking whether a page is still the one approved by Read Page.
export function extensionPageIdentity(snapshot: unknown): string {
  const parsed = ExtensionSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return '';
  return JSON.stringify({
    ...parsed.data,
    fields: parsed.data.fields.map(({ hasValue: _value, ...field }) => field),
  });
}
