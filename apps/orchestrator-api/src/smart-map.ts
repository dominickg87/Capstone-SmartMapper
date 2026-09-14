import { resolveSourceValue, transformValue } from '@smartmapper/automation-core';
import type { AccessibleControl, MiaQuotePayload } from '@smartmapper/contracts';
import { fieldDictionary, matchAll } from '@smartmapper/semantic-matcher';

/*
 * The MIA extension's own wire format.
 *
 * These shapes are dictated by apps/mia-chrome-extension: collectSmartMapSnapshot produces the
 * snapshot and applySmartMapAssignments consumes the assignments. They are deliberately NOT the
 * capstone contracts. This module is the adapter between the inherited extension protocol and the
 * shared matcher, which is what lets the extension map deterministically without changing how it
 * reads or fills a page.
 */
export interface MiaSnapshotField {
  id: string;
  tag?: string;
  type?: string;
  role?: string;
  label?: string;
  name?: string;
  htmlId?: string;
  placeholder?: string;
  autocomplete?: string;
  section?: string;
  nearbyText?: string[];
  previousCellText?: string;
  currentCellText?: string;
  nextCellText?: string;
  rowText?: string;
  required?: boolean;
  disabled?: boolean;
  hasValue?: boolean;
  options?: { label?: string; value?: string }[];
}

export interface MiaPageSnapshot {
  href?: string;
  host?: string;
  pageTitle?: string;
  headings?: string[];
  fields?: MiaSnapshotField[];
}

export interface MiaAssignment {
  field_id: string;
  value: string;
  confidence: number;
  source_path: string;
  evidence: string;
}

export interface MiaSkipped {
  field_id?: string;
  source_path?: string;
  reason: string;
}

export interface MiaMappingResponse {
  mapping: {
    provider: string;
    assignments: MiaAssignment[];
    skipped: MiaSkipped[];
    notes: string[];
  };
}

const PROVIDER_ID = 'deterministic-semantic-matcher';

/* Types the extension reports for a control whose value space is an option list. */
const OPTION_TYPES = new Set(['select', 'select-one', 'select-multiple', 'combobox', 'listbox']);

function text(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/*
 * Translate one MIA snapshot field into the accessible control the matcher scores.
 *
 * The extension flattens tag, ARIA role and input type into a single `type`, so the role is
 * recovered from the tag and the input type is kept separate. Table-cell context becomes adjacent
 * text, which is what rescues legacy table layouts.
 */
export function toAccessibleControl(field: MiaSnapshotField): AccessibleControl {
  const tag = (field.tag ?? 'input').toLowerCase();
  const type = (field.type ?? '').toLowerCase();
  const isOptionControl = OPTION_TYPES.has(type) || tag === 'select';

  const nearbyText = [
    field.previousCellText,
    field.currentCellText,
    field.nextCellText,
    ...(field.nearbyText ?? []),
  ]
    .map((entry) => text(entry))
    .filter((entry): entry is string => entry !== undefined);

  const options = (field.options ?? [])
    .map((option) => ({ label: option.label ?? '', value: option.value ?? '' }))
    .filter((option) => option.label.length > 0 || option.value.length > 0);

  const label = text(field.label);
  const name = text(field.name);
  const stableId = text(field.htmlId);
  const placeholder = text(field.placeholder);
  const autocomplete = text(field.autocomplete);
  const section = text(field.section);

  return {
    controlKey: field.id,
    role: isOptionControl ? 'select' : tag,
    required: field.required === true,
    disabled: field.disabled === true,
    nearbyText,
    ...(label !== undefined ? { label } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(stableId !== undefined ? { stableId } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(autocomplete !== undefined ? { autocomplete } : {}),
    ...(section !== undefined ? { containerKey: section, containerLabel: section } : {}),
    ...(!isOptionControl && type.length > 0 ? { inputType: type } : {}),
    ...(options.length > 0 ? { options } : {}),
  };
}

/*
 * Run the deterministic matcher over an extension page snapshot and produce the assignments the
 * inherited filler understands.
 *
 * Matching is page-wide rather than per section. A page with repeated blocks (Driver 1 / Driver 2)
 * therefore ties and reports unresolved instead of filling one applicant's name into both — the
 * safe outcome. Per-section expansion needs indexed source paths and is tracked in ADR 0006.
 *
 * Source values are resolved here, at the last possible moment, and only for a control the matcher
 * already approved. A field the quote has no value for is reported as skipped, never guessed.
 */
export function buildMapping(
  quote: MiaQuotePayload,
  snapshot: MiaPageSnapshot,
): MiaMappingResponse {
  const controls = (snapshot.fields ?? []).map(toAccessibleControl);

  const assignments: MiaAssignment[] = [];
  const skipped: MiaSkipped[] = [];
  const notes: string[] = [
    'Deterministic signal matching. No model was consulted and no network call was made.',
  ];

  for (const match of matchAll(fieldDictionary, controls)) {
    const sourcePath = match.definition.sourcePath;

    if (match.outcome === 'notFound') {
      continue;
    }

    if (match.outcome === 'ambiguous') {
      const tied = match.candidates
        .map((candidate) => candidate.control.label ?? candidate.control.controlKey)
        .join(', ');
      skipped.push({
        source_path: sourcePath,
        reason: 'Tied between ' + tied + '. Left for a human rather than guessed.',
      });
      continue;
    }

    /*
     * A native date input takes ISO regardless of what the field prefers for text boxes;
     * writing MM/DD/YYYY into one silently leaves it empty.
     */
    const isNativeDate = match.control.inputType === 'date';
    const transformation = isNativeDate ? 'identity' : match.definition.transformation;

    let value: string;
    try {
      const raw = resolveSourceValue(quote, sourcePath);
      value = transformValue(raw, transformation);
    } catch {
      skipped.push({
        field_id: match.control.controlKey,
        source_path: sourcePath,
        reason: 'The quote has no value at ' + sourcePath + '; left for a human.',
      });
      continue;
    }

    assignments.push({
      field_id: match.control.controlKey,
      value,
      confidence: match.score,
      source_path: sourcePath,
      evidence: match.evidence[0]?.detail ?? '',
    });
  }

  notes.push(
    'Resolved ' + String(assignments.length) + ' of ' + String(fieldDictionary.length) + ' fields.',
  );

  return { mapping: { provider: PROVIDER_ID, assignments, skipped, notes } };
}

/** The summary shape the side panel's quote list renders. */
export function toQuoteSummary(quote: MiaQuotePayload): Record<string, string> {
  return {
    id: quote.metadata.quoteId,
    client_name: quote.applicant.firstName + ' ' + quote.applicant.lastName,
    quote_number: quote.metadata.quoteId,
    form_type: quote.requestedCoverage.lineOfBusiness,
    status: 'synthetic',
  };
}
