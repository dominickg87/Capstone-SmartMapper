import {
  type AutomationActionV2,
  type FieldReview,
  type MappingDisposition,
  type MappingPage,
  type MappingProfile,
  type MappingTransform,
  type PageControl,
  type PageObservation,
  type SourceAnswer,
  type SourceAnswers,
  type StableTargetLocator,
  type TrainingControlSnapshot,
} from '@smartmapper/contracts';

const text = (value: string): string => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
const knownInputTypes = new Set([
  '',
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'email',
  'file',
  'hidden',
  'image',
  'month',
  'number',
  'password',
  'radio',
  'range',
  'reset',
  'search',
  'select-multiple',
  'select-one',
  'submit',
  'tel',
  'text',
  'time',
  'url',
  'week',
]);
const knownRoles = new Set([
  '',
  'button',
  'checkbox',
  'combobox',
  'group',
  'listbox',
  'option',
  'radio',
  'radiogroup',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
]);

export function canonicalControlInputType(value: string): string {
  const normalized = text(value).toLowerCase();
  return knownInputTypes.has(normalized) ? normalized : '';
}

export function canonicalControlRole(value: string): string {
  const normalized = text(value).toLowerCase();
  return knownRoles.has(normalized) ? normalized : '';
}
const scalarText = (value: string | number | boolean): string => text(String(value));
type Scalar = string | number | boolean;
type SourceValue = Scalar | Scalar[];
const isRadio = (control: Pick<PageControl, 'inputType' | 'role'>): boolean =>
  control.inputType === 'radio' || control.role === 'radio';
const isCheckbox = (control: Pick<PageControl, 'inputType' | 'role'>): boolean =>
  control.inputType === 'checkbox' || control.role === 'checkbox';

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const semanticHashPrefix = 'sha256:';

/**
 * Produces the value-free identity used for carrier semantics. Training observations may send the
 * prefixed digest instead of the original carrier text; live observations are normalized and
 * digested here so both representations resolve to the same target.
 */
export async function semanticTextDigest(value: string): Promise<string> {
  const normalized = text(value).toLowerCase();
  const persisted = new RegExp(`^${semanticHashPrefix}([a-f0-9]{64})$`).exec(normalized);
  return persisted?.[1] ?? sha256(normalized);
}

export function isSemanticHash(value: string): boolean {
  return new RegExp(`^${semanticHashPrefix}[a-f0-9]{64}$`, 'i').test(text(value));
}

async function semanticTarget(
  value: Pick<
    PageControl,
    'tag' | 'inputType' | 'role' | 'label' | 'section' | 'context' | 'choiceGroup'
  >,
) {
  const choiceGroup = value.choiceGroup ?? null;
  return {
    tag: value.tag,
    inputType: canonicalControlInputType(value.inputType),
    role: canonicalControlRole(value.role),
    label: await semanticTextDigest(choiceGroup?.label || value.label),
    section: await semanticTextDigest(value.section),
    context: await Promise.all(value.context.filter((item) => text(item)).map(semanticTextDigest)),
    choiceGroup: choiceGroup
      ? {
          label: await semanticTextDigest(choiceGroup.label),
        }
      : null,
  };
}

export async function stableTargetSignature(
  value: Pick<
    PageControl,
    'tag' | 'inputType' | 'role' | 'label' | 'section' | 'context' | 'choiceGroup'
  >,
): Promise<string> {
  return sha256(JSON.stringify(await semanticTarget(value)));
}

function eligibleDataControl(
  control: Pick<PageControl, 'tag' | 'inputType' | 'ordinaryNext'>,
): boolean {
  return (
    ['input', 'textarea', 'select', 'custom'].includes(control.tag) &&
    !['hidden', 'button', 'reset', 'submit', 'file', 'image', 'password'].includes(
      control.inputType,
    ) &&
    !control.ordinaryNext
  );
}

export async function stablePageSignature(page: {
  controls: Array<PageControl | TrainingControlSnapshot>;
}): Promise<string> {
  // Page matching must survive client-side privacy redaction of labels, context, choice text and
  // option values. Per-field matching remains semantic; routeId is evaluated separately.
  const controls = page.controls
    .filter((control) => eligibleDataControl(control) || control.ordinaryNext)
    .map((control) => ({
      tag: control.tag,
      inputType: canonicalControlInputType(control.inputType),
      role: canonicalControlRole(control.role),
      required: control.required,
      ordinaryNext: !!control.ordinaryNext,
      choiceGroup: control.choiceGroup !== null,
      optionCount: control.options.length,
    }));
  return sha256(JSON.stringify({ controls }));
}

export async function stableLocator(
  control: PageControl | TrainingControlSnapshot,
  occurrence: number,
  repeatIndex: number | null,
  groupKey: string | null,
  repeatEntityType: StableTargetLocator['repeatEntityType'] = null,
): Promise<StableTargetLocator> {
  const persist = async (value: string): Promise<string> =>
    value ? `${semanticHashPrefix}${await semanticTextDigest(value)}` : '';
  return {
    signature: await stableTargetSignature(control),
    occurrence,
    repeatIndex,
    repeatEntityType,
    groupKey,
    tag: control.tag,
    inputType: canonicalControlInputType(control.inputType),
    role: canonicalControlRole(control.role),
    label: await persist(control.label),
    section: await persist(control.section),
    context: await Promise.all(control.context.map(persist)),
    choiceGroup: control.choiceGroup
      ? {
          key: await persist(control.choiceGroup.key),
          label: await persist(control.choiceGroup.label),
        }
      : null,
    choiceValue:
      'choiceValue' in control && control.choiceValue !== null
        ? await persist(control.choiceValue)
        : null,
    operationalTarget: 'operationalTarget' in control ? control.operationalTarget : null,
    required: control.required,
    humanOnly: control.humanOnly,
    options: await Promise.all(
      control.options.map(async (option) => ({
        value: await persist(option.value),
        label: await persist(option.label),
      })),
    ),
  };
}

async function controlsBySignature(page: PageObservation): Promise<Map<string, PageControl[]>> {
  const result = new Map<string, PageControl[]>();
  for (const control of page.controls) {
    const signature = await stableTargetSignature(control);
    const group = result.get(signature) ?? [];
    group.push(control);
    result.set(signature, group);
  }
  return result;
}

async function optionsEqual(
  left: StableTargetLocator['options'],
  right: PageControl['options'],
): Promise<boolean> {
  const normalize = async (options: StableTargetLocator['options']) =>
    (
      await Promise.all(
        options.map(async (option) => [
          await semanticTextDigest(String(option.value)),
          await semanticTextDigest(option.label),
        ]),
      )
    ).sort(([leftValue, leftLabel], [rightValue, rightLabel]) =>
      `${leftValue}\0${leftLabel}`.localeCompare(`${rightValue}\0${rightLabel}`),
    );
  return JSON.stringify(await normalize(left)) === JSON.stringify(await normalize(right));
}

async function matchingCarrierChoice<T extends { value: string; label: string }>(
  output: string | boolean,
  choices: T[],
): Promise<T | undefined> {
  const wanted = scalarText(output).toLowerCase();
  for (const choice of choices) {
    if (
      scalarText(choice.value).toLowerCase() === wanted ||
      scalarText(choice.label).toLowerCase() === wanted
    )
      return choice;
    const valueDigest = semanticHashPrefix + (await semanticTextDigest(choice.value));
    const labelDigest = semanticHashPrefix + (await semanticTextDigest(choice.label));
    if (wanted === valueDigest || wanted === labelDigest) return choice;
  }
  return undefined;
}

function replaceWildcard(pattern: string, index: number): string {
  return pattern.replaceAll('*', String(index));
}

function entityLimitForField(
  profile: MappingProfile,
  target: StableTargetLocator,
  disposition: MappingDisposition,
) {
  const samePositionPatterns =
    disposition.kind === 'source'
      ? disposition.references
          .filter((reference) => reference.binding === 'same_position')
          .map((reference) => reference.sourcePathPattern)
      : [];
  return profile.entityLimits.find(
    (candidate) =>
      candidate.entityType === target.repeatEntityType ||
      samePositionPatterns.some(
        (pattern) =>
          pattern === candidate.sourcePattern || pattern.startsWith(`${candidate.sourcePattern}.`),
      ),
  );
}

function resolveReferences(
  disposition: Extract<MappingDisposition, { kind: 'source' }>,
  target: StableTargetLocator,
  source: SourceAnswers,
):
  | { kind: 'resolved'; answers: SourceAnswer[] }
  | { kind: 'missing'; evidence: SourceAnswer[] }
  | { kind: 'not_applicable'; evidence: SourceAnswer[] } {
  const answers: SourceAnswer[] = [];
  const evidence: SourceAnswer[] = [];
  for (const reference of disposition.references) {
    const path =
      reference.binding === 'fixed'
        ? reference.sourcePath!
        : target.repeatIndex === null
          ? null
          : replaceWildcard(
              reference.sourcePathPattern,
              target.repeatIndex + (reference.sourceIndexBase ?? 0),
            );
    if (!path) return { kind: 'missing', evidence };
    if (reference.binding === 'same_position') {
      const star = reference.sourcePathPattern.indexOf('*');
      const concreteIndex = target.repeatIndex! + (reference.sourceIndexBase ?? 0);
      const prefix = reference.sourcePathPattern.slice(0, star) + concreteIndex;
      const entityPrefix = prefix.endsWith('.') ? prefix : `${prefix}.`;
      const entityEvidence = source.answers.filter((candidate) =>
        candidate.sourcePath.startsWith(entityPrefix),
      );
      if (!entityEvidence.length) return { kind: 'not_applicable', evidence: [] };
      evidence.push(...entityEvidence);
    }
    const answer = source.answers.find(
      (candidate) =>
        candidate.sourcePath === path &&
        candidate.status === 'answered' &&
        candidate.value !== null,
    );
    if (!answer) return { kind: 'missing', evidence };
    answers.push(answer);
  }
  return { kind: 'resolved', answers };
}

function dateParts(value: string | number | boolean): [string, string, string] | null {
  const raw = scalarText(value);
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(raw);
  if (match) return [match[1]!, match[2]!.padStart(2, '0'), match[3]!.padStart(2, '0')];
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  return us ? [us[3]!, us[1]!.padStart(2, '0'), us[2]!.padStart(2, '0')] : null;
}

function transformValues(
  transform: MappingTransform,
  values: SourceValue[],
): string | boolean | null {
  if (!values.length) return null;
  if (transform.kind === 'multiselect_membership') {
    const selected = values[0];
    if (!Array.isArray(selected)) return null;
    const member = scalarText(transform.member).toLowerCase();
    return selected.some((item) => scalarText(item).toLowerCase() === member);
  }
  if (transform.kind === 'multiselect_join') {
    const selected = values[0];
    return Array.isArray(selected) ? selected.map(scalarText).join(transform.separator) : null;
  }
  if (values.some(Array.isArray)) return null;
  const scalars = values as Scalar[];
  if (transform.kind === 'compose') return scalars.map(scalarText).join(transform.separator);
  const value = scalars[0]!;
  if (transform.kind === 'identity') return typeof value === 'boolean' ? value : scalarText(value);
  if (transform.kind === 'enum') {
    const match = transform.cases.find(
      (item) => scalarText(item.source).toLowerCase() === scalarText(value).toLowerCase(),
    );
    return match
      ? typeof match.target === 'boolean'
        ? match.target
        : scalarText(match.target)
      : null;
  }
  if (transform.kind === 'boolean') {
    const truthy =
      value === true || ['true', 'yes', 'y', '1'].includes(scalarText(value).toLowerCase());
    const mapped = truthy ? transform.trueValue : transform.falseValue;
    return typeof mapped === 'boolean' ? mapped : scalarText(mapped);
  }
  if (transform.kind === 'phone') {
    const digits = scalarText(value).replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) return null;
    if (transform.format === 'digits') return digits;
    if (transform.format === 'dashes')
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (transform.kind === 'split') {
    const delimiters = { space: /\s+/, comma: /\s*,\s*/, hyphen: /\s*-\s*/, slash: /\s*\/\s*/ };
    return scalarText(value).split(delimiters[transform.delimiter])[transform.part] ?? null;
  }
  const date = dateParts(value);
  if (!date) return null;
  const [year, month, day] = date;
  if (transform.kind === 'date_part') {
    const part = transform.part === 'year' ? year : transform.part === 'month' ? month : day;
    return transform.pad || transform.part === 'year' ? part : String(Number(part));
  }
  if (transform.format === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
  if (transform.format === 'MM-DD-YYYY') return `${month}-${day}-${year}`;
  if (transform.format === 'M/D/YYYY') return `${Number(month)}/${Number(day)}/${year}`;
  return `${month}/${day}/${year}`;
}

function review(control: PageControl | undefined, reason: FieldReview['reason']): FieldReview {
  return {
    elementId: control?.elementId ?? null,
    // Carrier text is transient browser data. The extension enriches this generic review from the
    // current DOM for display; the durable checkpoint never retains labels or section text.
    question: 'Carrier field needs review',
    entity: '',
    reason,
  };
}

function fixedSource(fieldId: string, value: string | number | boolean): SourceAnswer {
  return {
    answerId: `registry:${fieldId}`,
    questionId: `registry:${fieldId}`,
    sourcePath: `registry:${fieldId}`,
    question: 'Approved fixed operational value',
    section: 'Registry',
    entity: '',
    context: [],
    options: [],
    value,
    status: 'answered',
    dataType:
      typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'text',
  };
}

async function actionFor(
  page: PageObservation,
  control: PageControl,
  fieldId: string,
  output: string | boolean,
  sources: SourceAnswer[],
  explanation: string,
  radioGroup: PageControl[] = [control],
): Promise<{ action: AutomationActionV2; sources: SourceAnswer[] } | FieldReview> {
  let type: AutomationActionV2['type'];
  let value: string | null = null;
  let checked: boolean | null = null;
  if (control.tag === 'select') {
    const option = await matchingCarrierChoice(output, control.options);
    if (!option) return review(control, 'changed_options');
    type = 'select';
    value = option.value;
  } else if (isCheckbox(control) || isRadio(control)) {
    if (isRadio(control)) {
      const option = await matchingCarrierChoice(output, radioGroup);
      if (!option) return review(control, 'changed_options');
      control = option;
      checked = true;
    } else
      checked =
        typeof output === 'boolean' ? output : ['true', 'yes', '1'].includes(output.toLowerCase());
    type = 'check';
  } else if (['input', 'textarea'].includes(control.tag)) {
    type = 'fill';
    value = scalarText(output);
  } else return review(control, 'unsupported_control');
  return {
    action: {
      version: '2.0',
      actionId: crypto.randomUUID(),
      type,
      pageStateId: page.pageStateId,
      elementId: control.elementId,
      sourceAnswerIds: sources.map((source) => source.answerId),
      value,
      checked,
      key: null,
      purpose: null,
      direction: null,
      milliseconds: null,
      transformation: { kind: 'format', explanation: `${explanation}; registry field ${fieldId}` },
      confidence: 1,
    },
    sources,
  };
}

export interface CompiledRegistryPage {
  mappingPage: MappingPage | null;
  actions: Array<{
    action: AutomationActionV2;
    sources: SourceAnswer[];
    mappingFieldId: string;
  }>;
  reviews: FieldReview[];
  recognizedControlIds: string[];
  missingTargets: Array<{
    mappingFieldId: string;
    repeatIndex: number;
    sourceAnswerIds: string[];
    sourcePathPatterns: string[];
  }>;
  locallyVerifiedFields: Array<{
    mappingFieldId: string;
    elementId: string;
    kind: 'carrier_default';
  }>;
}

async function selectMappingPage(
  profile: MappingProfile,
  observation: PageObservation,
  current: Map<string, PageControl[]>,
): Promise<MappingPage | null> {
  const signature = await stablePageSignature(observation);
  const route = profile.pages.filter((page) => page.routeId === observation.routeId);
  if (!route.length) return null;
  const score = (page: MappingPage): number =>
    [
      ...page.fields.map((field) => field.target),
      ...page.workflowControls.map((item) => item.target),
    ].filter((target) => current.has(target.signature)).length;
  const exact = route.filter((page) => page.signature === signature);
  if (exact.length === 1 && score(exact[0]!) > 0) return exact[0]!;
  const scored = route
    .map((page) => ({
      page,
      score: score(page),
    }))
    .sort((left, right) => right.score - left.score);
  if (!scored[0]?.score || scored[0].score === scored[1]?.score) return null;
  return scored[0].page;
}

export async function compileRegistryPage(
  profile: MappingProfile,
  observation: PageObservation,
  source: SourceAnswers,
): Promise<CompiledRegistryPage> {
  const current = await controlsBySignature(observation);
  const mappingPage = await selectMappingPage(profile, observation, current);
  if (!mappingPage)
    return {
      mappingPage: null,
      actions: [],
      reviews: [review(undefined, 'changed_target')],
      recognizedControlIds: [],
      missingTargets: [],
      locallyVerifiedFields: [],
    };
  const actions: CompiledRegistryPage['actions'] = [];
  const reviews: FieldReview[] = [];
  const recognizedControlIds = new Set<string>();
  const missingTargets: CompiledRegistryPage['missingTargets'] = [];
  const locallyVerifiedFields: CompiledRegistryPage['locallyVerifiedFields'] = [];
  for (const field of [...mappingPage.fields].sort((a, b) => a.sequence - b.sequence)) {
    const disposition = field.disposition;
    const resolution =
      disposition.kind === 'source' ? resolveReferences(disposition, field.target, source) : null;
    const matches = current.get(field.target.signature) ?? [];
    const radioGroup = isRadio(field.target) ? matches : [];
    const control = isRadio(field.target) ? radioGroup[0] : matches[field.target.occurrence];
    if (!control) {
      if (field.target.repeatIndex !== null && ['ignore', 'leave_blank'].includes(disposition.kind))
        continue;
      if (resolution?.kind === 'not_applicable') continue;
      const limit = entityLimitForField(profile, field.target, disposition);
      const concreteEntityPrefix =
        limit && field.target.repeatIndex !== null
          ? `${limit.sourcePattern.split('*')[0] ?? ''}${
              field.target.repeatIndex + limit.sourceIndexBase
            }.`
          : null;
      const entityEvidence = concreteEntityPrefix
        ? source.answers.filter((answer) => answer.sourcePath.startsWith(concreteEntityPrefix))
        : [];
      if (
        disposition.kind !== 'source' &&
        field.target.repeatIndex !== null &&
        limit &&
        !entityEvidence.length
      )
        continue;
      // A missing carrier control is expandable only when it is a catalog-backed repeated
      // entity. Numerals in ordinary labels (for example, Address Line 2) must never be
      // mistaken for rows that an Add Driver/Vehicle control can create.
      if (field.target.repeatIndex !== null && limit) {
        missingTargets.push({
          mappingFieldId: field.fieldId,
          repeatIndex: field.target.repeatIndex,
          sourceAnswerIds:
            disposition.kind !== 'source'
              ? entityEvidence.map((answer) => answer.answerId)
              : resolution?.kind === 'resolved'
                ? resolution.answers.map((answer) => answer.answerId)
                : (resolution?.evidence.map((answer) => answer.answerId) ?? []),
          sourcePathPatterns:
            disposition.kind === 'source'
              ? disposition.references.map((reference) => reference.sourcePathPattern)
              : limit
                ? [limit.sourcePattern]
                : [],
        });
      } else reviews.push(review(undefined, 'changed_target'));
      continue;
    }
    for (const recognized of radioGroup.length ? radioGroup : [control])
      recognizedControlIds.add(recognized.elementId);
    if (disposition.kind === 'ignore' || disposition.kind === 'leave_blank') continue;
    if (disposition.kind === 'human_required') {
      const satisfied = isRadio(control)
        ? radioGroup.some((option) => option.checked)
        : (control.requiredSatisfied ?? (isCheckbox(control) ? control.checked : !!control.value));
      if (!satisfied) reviews.push(review(control, 'human_required'));
      continue;
    }
    if (disposition.kind === 'carrier_default') {
      const evidenceControl = isRadio(control)
        ? radioGroup.find((option) => option.checked)
        : control;
      const satisfied = evidenceControl
        ? isCheckbox(evidenceControl) || isRadio(evidenceControl)
          ? evidenceControl.checked
          : scalarText(evidenceControl.value).length > 0
        : false;
      if (!satisfied || !evidenceControl) reviews.push(review(control, 'validation_error'));
      else {
        locallyVerifiedFields.push({
          mappingFieldId: field.fieldId,
          elementId: evidenceControl.elementId,
          kind: 'carrier_default',
        });
      }
      continue;
    }
    const liveOptions = isRadio(field.target)
      ? radioGroup.map((option) => ({ value: option.value, label: option.label }))
      : control.options;
    if (!(await optionsEqual(field.target.options, liveOptions))) {
      reviews.push(review(control, 'changed_options'));
      continue;
    }
    const sources =
      disposition.kind === 'fixed_value'
        ? [fixedSource(field.fieldId, disposition.value)]
        : resolution?.kind === 'resolved'
          ? resolution.answers
          : null;
    if (resolution?.kind === 'not_applicable') continue;
    if (!sources) {
      reviews.push(review(control, 'missing_source'));
      continue;
    }
    const values = sources.flatMap((answer) => (answer.value === null ? [] : [answer.value]));
    const transform =
      disposition.kind === 'source' ? disposition.transform : ({ kind: 'identity' } as const);
    const output = transformValues(transform, values);
    if (output === null) {
      reviews.push(review(control, 'source_mismatch'));
      continue;
    }
    const compiled = await actionFor(
      pageClone(observation),
      control,
      field.fieldId,
      output,
      sources,
      transform.kind,
      radioGroup,
    );
    if ('reason' in compiled) reviews.push(compiled);
    else actions.push({ ...compiled, mappingFieldId: field.fieldId });
  }
  for (const control of observation.controls) {
    if (
      eligibleDataControl(control) &&
      !control.disabled &&
      !control.humanOnly &&
      !recognizedControlIds.has(control.elementId)
    )
      reviews.push(review(control, 'missing_mapping'));
  }
  return {
    mappingPage,
    actions,
    reviews: reviews.slice(0, 100),
    recognizedControlIds: [...recognizedControlIds],
    missingTargets,
    locallyVerifiedFields,
  };
}

// Keeps action compilation visibly tied to the exact pageStateId supplied to policy evaluation.
function pageClone(page: PageObservation): PageObservation {
  return page;
}
