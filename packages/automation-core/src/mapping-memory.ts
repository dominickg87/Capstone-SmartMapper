import {
  LearnedMappingSchema,
  MAPPING_DATE_FORMATS,
  MAPPING_JOIN_SEPARATORS,
  type AutomationActionV2,
  type LearnedMapping,
  type MappingActionType,
  type MappingDateFormat,
  type MappingRecipe,
  type PageControl,
  type PageObservation,
  type SourceAnswer,
  type SourceAnswers,
} from '@smartmapper/contracts';
import { canonicalValue, controlIsHumanOnly, valueDigest } from './active-tab.js';

// Human-approved mapping memory. Recipes are derived only from what a verified action actually
// entered, replayed deterministically, and still pass the normal policy, fact check and read-back.

export const MEMORY_FAILURE_LIMIT = 2;

export interface FieldIdentity {
  tag: string;
  inputType: string;
  role: string;
  section: string;
  label: string;
  name: string;
  id: string;
}

/** Position- and value-independent identity of a carrier control. */
export function fieldSignature(field: FieldIdentity): Promise<string> {
  return valueDigest(
    JSON.stringify([
      'smartmapper-field-v1',
      field.tag,
      field.inputType,
      field.role,
      field.section,
      field.label,
      field.name,
      field.id,
    ]),
  );
}

export interface DerivedMapping {
  actionType: MappingActionType;
  questionIds: string[];
  recipe: MappingRecipe;
}

type Answered = SourceAnswer & { value: string | number | boolean };

const answered = (answer: SourceAnswer | undefined): answer is Answered =>
  answer !== undefined && answer.status === 'answered' && answer.value !== null;

// A question answered for several people or vehicles is entity-dependent. Memory never chooses
// between them; the model and the independent fact check handle those fields.
function singleAnswer(source: SourceAnswers, questionId: string): Answered | null {
  const matches = source.answers.filter((answer) => answer.questionId === questionId);
  return matches.length === 1 && answered(matches[0]) ? matches[0] : null;
}

export function controlActionType(control: PageControl): MappingActionType | null {
  if (control.disabled || controlIsHumanOnly(control)) return null;
  if (control.tag === 'select') return 'select';
  if (control.tag === 'textarea') return 'fill';
  if (control.tag !== 'input') return null;
  if (['checkbox', 'radio'].includes(control.inputType)) return 'check';
  if (
    ['hidden', 'button', 'reset', 'submit', 'file', 'image', 'password'].includes(control.inputType)
  )
    return null;
  return 'fill';
}

/** The digest the executor reports on read-back for this kind of control. */
export function controlStateDigest(
  control: PageControl,
  actionType: MappingActionType,
): Promise<string> {
  return valueDigest(actionType === 'check' ? control.checked : control.value);
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseSourceDate(value: string | number | boolean): CalendarDate | null {
  const text = canonicalValue(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  // M.I.A. is a US system; a slash date in source data is month/day/year.
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : us
      ? [Number(us[3]), Number(us[1]), Number(us[2])]
      : null;
  if (!parts) return null;
  const [year = 0, month = 0, day = 0] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function formatDate(date: CalendarDate, format: MappingDateFormat): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = String(date.year);
  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${pad(date.month)}-${pad(date.day)}`;
    case 'MM/DD/YYYY':
      return `${pad(date.month)}/${pad(date.day)}/${year}`;
    case 'MM-DD-YYYY':
      return `${pad(date.month)}-${pad(date.day)}-${year}`;
    case 'M/D/YYYY':
      return `${date.month}/${date.day}/${year}`;
    case 'DD/MM/YYYY':
      return `${pad(date.day)}/${pad(date.month)}/${year}`;
  }
}

const choiceTypes: SourceAnswer['dataType'][] = ['enum', 'boolean'];

/**
 * Derives a replayable recipe from a verified action, or null when no allowlisted recipe
 * reproduces exactly what was entered (or more than one does).
 */
export async function deriveMapping(
  action: AutomationActionV2,
  control: PageControl,
  sources: SourceAnswer[],
  source: SourceAnswers,
): Promise<DerivedMapping | null> {
  const actionType = controlActionType(control);
  if (!actionType || actionType !== action.type || action.purpose !== null) return null;
  if (!sources.length || sources.length > 4) return null;
  const answers: Answered[] = [];
  for (const item of sources) {
    const answer = singleAnswer(source, item.questionId);
    if (!answer || answer.answerId !== item.answerId) return null;
    answers.push(answer);
  }
  const questionIds = answers.map((answer) => answer.questionId);
  if (new Set(questionIds).size !== questionIds.length) return null;
  const [first] = answers;
  if (!first) return null;

  if (actionType === 'check') {
    if (answers.length !== 1 || !choiceTypes.includes(first.dataType) || action.checked === null)
      return null;
    if (control.inputType === 'radio' && !action.checked) return null;
    return {
      actionType,
      questionIds,
      recipe: {
        kind: 'check',
        choices: [{ source: await valueDigest(first.value), checked: action.checked }],
      },
    };
  }

  const target = action.value;
  if (target === null) return null;
  if (answers.length === 1) {
    if (canonicalValue(first.value) === canonicalValue(target))
      return { actionType, questionIds, recipe: { kind: 'identity' } };
    if (actionType === 'select') {
      if (
        !choiceTypes.includes(first.dataType) ||
        !control.options.some((option) => option.value === target)
      )
        return null;
      return {
        actionType,
        questionIds,
        recipe: {
          kind: 'option',
          choices: [{ source: await valueDigest(first.value), target: await valueDigest(target) }],
        },
      };
    }
    const date = parseSourceDate(first.value);
    if (!date) return null;
    const formats = MAPPING_DATE_FORMATS.filter(
      (format) => formatDate(date, format) === canonicalValue(target),
    );
    const [format] = formats;
    return formats.length === 1 && format
      ? { actionType, questionIds, recipe: { kind: 'date', format } }
      : null;
  }

  if (actionType !== 'fill' || answers.some((answer) => answer.dataType !== 'text')) return null;
  const separators = MAPPING_JOIN_SEPARATORS.filter(
    (separator) =>
      answers.map((answer) => canonicalValue(answer.value)).join(separator) ===
      canonicalValue(target),
  );
  const [separator] = separators;
  return separators.length === 1 && separator
    ? { actionType, questionIds, recipe: { kind: 'join', separator } }
    : null;
}

export type ReplayResult =
  { kind: 'act'; action: AutomationActionV2 } | { kind: 'satisfied' } | null;

const transformationKinds = {
  identity: 'identity',
  date: 'format',
  join: 'compose',
  option: 'equivalent_option',
  check: 'equivalent_option',
} as const;

/**
 * Rebuilds the action a human approved for this control from the current quote's answers.
 * Returns 'satisfied' when the control already holds the expected entry, or null when memory
 * cannot decide (the model then handles the field as usual).
 */
export async function replayMapping(
  entry: LearnedMapping,
  control: PageControl,
  page: PageObservation,
  source: SourceAnswers,
): Promise<ReplayResult> {
  if (control.signature !== entry.signature || controlActionType(control) !== entry.actionType)
    return null;
  const answers: Answered[] = [];
  for (const questionId of entry.questionIds) {
    const answer = singleAnswer(source, questionId);
    if (!answer) return null;
    answers.push(answer);
  }
  const [first] = answers;
  if (!first) return null;
  const recipe = entry.recipe;
  let value: string | null = null;
  let checked: boolean | null = null;
  if (recipe.kind === 'join') {
    if (answers.length < 2) return null;
    value = answers.map((answer) => canonicalValue(answer.value)).join(recipe.separator);
  } else if (answers.length !== 1) return null;
  else if (recipe.kind === 'identity') value = canonicalValue(first.value);
  else if (recipe.kind === 'date') {
    const date = parseSourceDate(first.value);
    if (!date) return null;
    value = formatDate(date, recipe.format);
  } else {
    const sourceDigest = await valueDigest(first.value);
    if (recipe.kind === 'check') {
      const choice = recipe.choices.find((item) => item.source === sourceDigest);
      if (!choice) return null;
      checked = choice.checked;
    } else {
      const choice = recipe.choices.find((item) => item.source === sourceDigest);
      if (!choice) return null;
      for (const option of control.options)
        if ((await valueDigest(option.value)) === choice.target) {
          value = option.value;
          break;
        }
    }
  }
  if (entry.actionType === 'select' && value !== null) {
    const expected = value;
    value =
      control.options.find((option) => canonicalValue(option.value) === canonicalValue(expected))
        ?.value ?? null;
  }

  // Memory only fills untouched controls. Anything already holding a different entry (from the
  // human, the carrier or an earlier page) is left for the model and the human to judge.
  if (entry.actionType === 'check') {
    if (checked === null) return null;
    if (control.checked === checked) return { kind: 'satisfied' };
    if (!checked) return null;
    if (
      control.inputType === 'radio' &&
      page.controls.some(
        (other) =>
          other.inputType === 'radio' && other.section === control.section && other.checked,
      )
    )
      return null;
  } else {
    if (value === null) return null;
    if (canonicalValue(control.value) === canonicalValue(value) && !control.errors.length)
      return { kind: 'satisfied' };
    if (canonicalValue(control.value) !== '') return null;
  }
  return {
    kind: 'act',
    action: {
      version: '2.0',
      actionId: 'memory-' + crypto.randomUUID(),
      type: entry.actionType,
      pageStateId: page.pageStateId,
      elementId: control.elementId,
      sourceAnswerIds: answers.map((answer) => answer.answerId),
      value: entry.actionType === 'check' ? null : value,
      checked: entry.actionType === 'check' ? checked : null,
      key: null,
      purpose: null,
      direction: null,
      milliseconds: null,
      transformation: {
        kind: transformationKinds[recipe.kind],
        explanation: 'Applied a human-approved saved mapping (' + recipe.kind + ').',
      },
      confidence: 1,
    },
  };
}

const sameQuestions = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

function sameShape(entry: LearnedMapping, derived: DerivedMapping): boolean {
  const recipe = derived.recipe;
  return (
    entry.actionType === derived.actionType &&
    sameQuestions(entry.questionIds, derived.questionIds) &&
    entry.recipe.kind === recipe.kind &&
    (entry.recipe.kind !== 'date' ||
      (recipe.kind === 'date' && entry.recipe.format === recipe.format)) &&
    (entry.recipe.kind !== 'join' ||
      (recipe.kind === 'join' && entry.recipe.separator === recipe.separator))
  );
}

export const usableMapping = (entry: LearnedMapping): boolean =>
  entry.failures < MEMORY_FAILURE_LIMIT;

/** True when the saved entry already reproduces this derived mapping. */
export function mappingCovers(entry: LearnedMapping | undefined, derived: DerivedMapping): boolean {
  if (!entry || !usableMapping(entry) || !sameShape(entry, derived)) return false;
  const saved = entry.recipe;
  const recipe = derived.recipe;
  if (saved.kind === 'option' && recipe.kind === 'option')
    return recipe.choices.every((choice) =>
      saved.choices.some((item) => item.source === choice.source && item.target === choice.target),
    );
  if (saved.kind === 'check' && recipe.kind === 'check')
    return recipe.choices.every((choice) =>
      saved.choices.some(
        (item) => item.source === choice.source && item.checked === choice.checked,
      ),
    );
  return true;
}

/** Applies a human approval, merging option/check choices into a compatible saved entry. */
export function approveMapping(
  existing: LearnedMapping | undefined,
  signature: string,
  derived: DerivedMapping,
  now: string,
): LearnedMapping {
  const same = existing !== undefined && sameShape(existing, derived);
  let recipe: MappingRecipe = derived.recipe;
  if (same && existing.recipe.kind === 'option' && recipe.kind === 'option') {
    const added = recipe.choices;
    recipe = {
      kind: 'option',
      choices: [
        ...existing.recipe.choices.filter((item) => !added.some((c) => c.source === item.source)),
        ...added,
      ].slice(-100),
    };
  } else if (same && existing.recipe.kind === 'check' && recipe.kind === 'check') {
    const added = recipe.choices;
    recipe = {
      kind: 'check',
      choices: [
        ...existing.recipe.choices.filter((item) => !added.some((c) => c.source === item.source)),
        ...added,
      ].slice(-20),
    };
  }
  return LearnedMappingSchema.parse({
    version: '1.0',
    signature,
    questionIds: derived.questionIds,
    actionType: derived.actionType,
    recipe,
    approvals: same ? existing.approvals + 1 : 1,
    uses: same ? existing.uses : 0,
    failures: 0,
    approvedAt: now,
    lastUsedAt: same ? existing.lastUsedAt : null,
  });
}

export function recordMappingOutcome(
  entry: LearnedMapping,
  success: boolean,
  now: string,
): LearnedMapping {
  return success
    ? { ...entry, uses: entry.uses + 1, failures: 0, lastUsedAt: now }
    : { ...entry, failures: entry.failures + 1 };
}
