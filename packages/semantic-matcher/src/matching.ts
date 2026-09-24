import type { AccessibleControl, MappingEvidence } from '@smartmapper/contracts';

import type { FieldSignalDefinition } from './field-dictionary.js';

/*
 * Real carrier forms rarely use predictable names. `firstName` is the lucky case;
 * `ctl00$ContentPlaceHolder1$txtFName` and `q_87234` are normal. So rather than looking
 * for one thing, score several independent signals and take the strongest — and when two
 * controls score the same, refuse to choose.
 *
 * These weights are the entire matching policy. Strongest first:
 *
 *   0.98  autocomplete="family-name"   a web standard; when present it is definitive
 *   0.95  label "Last name"            what a human reads
 *   0.93  accessible name              what a screen reader reads
 *   0.90  name="last_name" / stable id developer intent, but inconsistent
 *   0.88  adjacent text                the label in the previous cell, or the span in a
 *                                      floating-label wrapper — visually a real label
 *   0.85  placeholder "Last name"      often decorative, sometimes all there is
 *
 * Anything below FILL_THRESHOLD is reported for a human rather than entered, and two
 * candidates within AMBIGUITY_MARGIN of each other are reported rather than guessed.
 * No value entered always beats a wrong value entered.
 */
export const SIGNAL_WEIGHTS = {
  autocomplete: 0.98,
  label: 0.95,
  accessible_name: 0.93,
  name: 0.9,
  nearby_text: 0.88,
  placeholder: 0.85,
} as const;

/*
 * Deliberately equal to the low-risk allow threshold in evaluateMappingGate: a candidate
 * this matcher considers fillable is exactly a candidate that policy will allow, and
 * anything weaker becomes a review item instead of an executed action.
 */
export const FILL_THRESHOLD = 0.85;
export const AMBIGUITY_MARGIN = 0.03;

/* Junk segments in name/id attributes that carry no meaning of their own. */
const NOISE_TOKEN =
  /^(ctl\d+|contentplaceholder\d*|txt|tb|input|field|form|frm|q|question|ctrl|el)$/;

/* Controls that are never a text-like destination for quote data. */
const SKIP_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'image', 'file']);
const SKIP_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'file',
  'password',
  'checkbox',
  'radio',
  'range',
  'color',
]);

/* Roles whose value space is a fixed option list rather than a typed input type. */
const OPTION_ROLES = new Set(['select', 'combobox', 'listbox', 'textarea']);

/** Split `ctl00$ContentPlaceHolder1$txtLName` into ['lname'], `last_name` into ['last','name']. */
export function tokenize(attribute: string | undefined): string[] {
  if (attribute === undefined) {
    return [];
  }

  return attribute
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !NOISE_TOKEN.test(token) && !/^\d+$/.test(token));
}

export function normalizeText(text: string | undefined): string {
  return (text ?? '')
    .toLocaleLowerCase()
    .replace(/[*:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Returns the phrase that hit, so the evidence trail can name it. */
function findPhrase(phrases: readonly string[], text: string | undefined): string | undefined {
  const normalized = normalizeText(text);
  if (normalized.length === 0) {
    return undefined;
  }

  return phrases.find((phrase) => normalized === phrase || normalized.includes(phrase));
}

function isFillable(control: AccessibleControl): boolean {
  if (control.disabled || control.readOnly === true) {
    return false;
  }

  /*
   * A control belonging to a step nobody is on, or to a collapsed accordion, is still in
   * the snapshot. Filling those is how a value lands silently on the wrong page.
   */
  if (control.visible === false) {
    return false;
  }

  if (SKIP_ROLES.has(control.role.toLocaleLowerCase())) {
    return false;
  }

  return !(
    control.inputType !== undefined && SKIP_INPUT_TYPES.has(control.inputType.toLocaleLowerCase())
  );
}

function typeAllowed(definition: FieldSignalDefinition, control: AccessibleControl): boolean {
  if (definition.inputTypes.length === 0) {
    return true;
  }

  if (OPTION_ROLES.has(control.role.toLocaleLowerCase())) {
    return true;
  }

  if (control.inputType === undefined) {
    return true;
  }

  return definition.inputTypes.includes(control.inputType.toLocaleLowerCase());
}

export interface ScoredControl {
  readonly control: AccessibleControl;
  readonly score: number;
  /** Strongest signal first. Never empty. */
  readonly evidence: readonly MappingEvidence[];
}

/*
 * Score one control against one field definition. Returns undefined when the control is
 * disqualified, otherwise the strongest signal found plus the full evidence trail — a
 * match that cannot be explained is a match that cannot be trusted.
 */
export function scoreControl(
  definition: FieldSignalDefinition,
  control: AccessibleControl,
): ScoredControl | undefined {
  if (!isFillable(control) || !typeAllowed(definition, control)) {
    return undefined;
  }

  /*
   * Disqualify on negative phrases, but only against text that identifies what the field
   * IS — not help text, which often mentions the very things being avoided ("Do not
   * include basements" on a square-footage field).
   */
  const identifying = normalizeText(
    [control.label, control.accessibleName, control.placeholder, control.nearbyText[0]]
      .filter((part): part is string => part !== undefined && part.length > 0)
      .join(' '),
  );
  if (definition.avoid.some((phrase) => identifying.includes(phrase))) {
    return undefined;
  }

  const evidence: MappingEvidence[] = [];

  const autocompleteTokens = (control.autocomplete ?? '')
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (definition.autocomplete.some((token) => autocompleteTokens.includes(token))) {
    evidence.push({
      kind: 'autocomplete',
      detail: 'autocomplete="' + autocompleteTokens.join(' ') + '"',
      weight: SIGNAL_WEIGHTS.autocomplete,
    });
  }

  const labelHit = findPhrase(definition.labels, control.label);
  if (labelHit !== undefined) {
    evidence.push({
      kind: 'label',
      detail: 'label "' + labelHit + '"',
      weight: SIGNAL_WEIGHTS.label,
    });
  }

  const accessibleNameHit = findPhrase(definition.labels, control.accessibleName);
  if (accessibleNameHit !== undefined) {
    evidence.push({
      kind: 'accessible_name',
      detail: 'accessible name "' + accessibleNameHit + '"',
      weight: SIGNAL_WEIGHTS.accessible_name,
    });
  }

  const attributeTokens = [...tokenize(control.name), ...tokenize(control.stableId)];
  const joined = attributeTokens.join('');
  const tokenHit = definition.nameTokens.find(
    (token) => attributeTokens.includes(token) || joined === token,
  );
  if (tokenHit !== undefined) {
    evidence.push({
      kind: 'name',
      detail: 'name/id token "' + tokenHit + '"',
      weight: SIGNAL_WEIGHTS.name,
    });
  }

  const nearbyHit = findPhrase(definition.labels, control.nearbyText.join(' '));
  if (nearbyHit !== undefined) {
    evidence.push({
      kind: 'nearby_text',
      detail: 'adjacent text "' + nearbyHit + '"',
      weight: SIGNAL_WEIGHTS.nearby_text,
    });
  }

  const placeholderHit = findPhrase(definition.labels, control.placeholder);
  if (placeholderHit !== undefined) {
    evidence.push({
      kind: 'placeholder',
      detail: 'placeholder "' + placeholderHit + '"',
      weight: SIGNAL_WEIGHTS.placeholder,
    });
  }

  const sorted = [...evidence].sort((left, right) => right.weight - left.weight);
  const strongest = sorted[0];
  if (strongest === undefined) {
    return undefined;
  }

  return { control, score: strongest.weight, evidence: sorted };
}

export type FieldMatch =
  | {
      readonly outcome: 'matched';
      readonly definition: FieldSignalDefinition;
      readonly control: AccessibleControl;
      readonly score: number;
      readonly evidence: readonly MappingEvidence[];
    }
  | {
      readonly outcome: 'lowConfidence';
      readonly definition: FieldSignalDefinition;
      readonly control: AccessibleControl;
      readonly score: number;
      readonly evidence: readonly MappingEvidence[];
    }
  | {
      readonly outcome: 'ambiguous';
      readonly definition: FieldSignalDefinition;
      readonly candidates: readonly ScoredControl[];
    }
  | { readonly outcome: 'notFound'; readonly definition: FieldSignalDefinition };

/** Match one field definition across one set of controls. */
export function matchField(
  definition: FieldSignalDefinition,
  controls: readonly AccessibleControl[],
): FieldMatch {
  const scored = controls
    .map((control) => scoreControl(definition, control))
    .filter((candidate): candidate is ScoredControl => candidate !== undefined)
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (best === undefined) {
    return { outcome: 'notFound', definition };
  }

  const runnerUp = scored[1];
  if (runnerUp !== undefined && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
    return {
      outcome: 'ambiguous',
      definition,
      candidates: scored.filter((candidate) => best.score - candidate.score < AMBIGUITY_MARGIN),
    };
  }

  if (best.score < FILL_THRESHOLD) {
    return {
      outcome: 'lowConfidence',
      definition,
      control: best.control,
      score: best.score,
      evidence: best.evidence,
    };
  }

  return {
    outcome: 'matched',
    definition,
    control: best.control,
    score: best.score,
    evidence: best.evidence,
  };
}

/*
 * Match every definition against one set of controls. Once a control is claimed by one
 * field it is removed from consideration for the rest, so "First name" and "Last name"
 * can never resolve to the same control.
 */
export function matchAll(
  definitions: readonly FieldSignalDefinition[],
  controls: readonly AccessibleControl[],
): FieldMatch[] {
  const claimed = new Set<string>();

  return definitions.map((definition) => {
    const available = controls.filter((control) => !claimed.has(control.controlKey));
    const match = matchField(definition, available);

    if (match.outcome === 'matched') {
      claimed.add(match.control.controlKey);
    }

    return match;
  });
}

export interface ContainerMatchGroup {
  readonly containerKey: string;
  readonly containerLabel: string;
  readonly matches: readonly FieldMatch[];
}

/*
 * Match per form section rather than per page. This matters for repeated blocks: a real
 * quote form has Driver 1 / Driver 2 / Vehicle 1, and page-wide matching resolves only
 * the single best "last name" on the whole document and silently skips the rest.
 *
 * Controls carrying no containerKey form one page-level group, so a snapshot produced
 * before that field existed behaves exactly as it did before.
 */
export function matchAllByContainer(
  definitions: readonly FieldSignalDefinition[],
  controls: readonly AccessibleControl[],
): ContainerMatchGroup[] {
  const groups = new Map<string, { label: string; controls: AccessibleControl[] }>();

  for (const control of controls) {
    const key = control.containerKey ?? 'page';
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { label: control.containerLabel ?? 'page', controls: [control] });
      continue;
    }
    existing.controls.push(control);
  }

  return [...groups.entries()].map(([containerKey, group]) => ({
    containerKey,
    containerLabel: group.label,
    matches: matchAll(definitions, group.controls),
  }));
}
