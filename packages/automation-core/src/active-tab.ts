import {
  AutomationActionV2Schema,
  type AutomationActionV2,
  type JobBinding,
  type PageControl,
  type PageObservation,
  type SourceAnswer,
  type SourceAnswers,
} from '@smartmapper/contracts';

export function carrierOriginAllowed(
  origin: string,
  configured: ReadonlySet<string>,
  allowAnyCarrier = false,
): boolean {
  try {
    const url = new URL(origin);
    if (url.origin !== origin || origin.length > 255) return false;
    if (url.protocol === 'https:') return allowAnyCarrier || configured.has(origin);
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      configured.has(origin)
    );
  } catch {
    return false;
  }
}

export const humanActionPattern =
  /\b(next|continue|submit|bind|issue|sell|purchase|buy|pay|payment|checkout|sign|signature|attest|agree|consent|accept|authorize|authorization|captcha|password|passcode|log\s*in|sign\s*in|verify identity|verification code|security code|one.time code)\b/i;

export function controlIsHumanOnly(
  control: Pick<PageControl, 'label' | 'context' | 'inputType' | 'humanOnly'>,
): boolean {
  return (
    control.humanOnly ||
    ['password', 'submit', 'file', 'image'].includes(control.inputType) ||
    humanActionPattern.test([control.label, ...control.context].join(' '))
  );
}

export const ordinaryNextLabel = (label: string): boolean =>
  /^(next|continue)(\s+(page|step))?\s*[>»→]?$/i.test(label.trim());
export const commitmentPattern =
  /\b(bind|issue|sell|purchase|pay|payment|sign|signature|attest|agree|consent|accept|authorize|authorization|certify|acknowledge)\b/i;

export function pageReadyToAdvance(page: PageObservation): boolean {
  return (
    page.capture?.complete === true &&
    page.capture.unexpanded === 0 &&
    !page.headings.some((heading) => commitmentPattern.test(heading)) &&
    !/\bby\s+(?:clicking|selecting|continuing|proceeding)\b[^.]{0,200}\b(?:agree|consent|authorize|certify|acknowledge|bind|issue|purchase|pay)\b/i.test(
      page.pageText ?? '',
    ) &&
    !page.authenticationRequired &&
    !page.errors.length &&
    !page.omittedControls &&
    !page.unsupportedFrames &&
    page.controls.every((control) => {
      if (control.disabled) return true;
      if (control.errors.length) return false;
      if (control.humanOnly && ['input', 'textarea', 'select', 'custom'].includes(control.tag))
        return ['checkbox', 'radio'].includes(control.inputType) ||
          ['checkbox', 'radio'].includes(control.role)
          ? control.checked
          : !!control.value;
      if (!control.required) return true;
      if (control.requiredSatisfied !== undefined) return control.requiredSatisfied;
      if (
        ['checkbox', 'radio'].includes(control.inputType) ||
        ['checkbox', 'radio'].includes(control.role)
      )
        return control.checked;
      return !!control.value;
    })
  );
}

export function canonicalValue(value: string | number | boolean): string {
  return String(value).normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function targetValueUnchangedOrExpected(
  lastObserved: string | boolean | null,
  fresh: string | boolean | null,
  expected: string | boolean | null,
): boolean {
  if (expected === null) return true;
  if (lastObserved === null || fresh === null) return false;
  const freshValue = canonicalValue(fresh);
  return freshValue === canonicalValue(lastObserved) || freshValue === canonicalValue(expected);
}

export async function valueDigest(value: string | number | boolean): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalValue(value)),
  );
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function actionExpectedValue(action: AutomationActionV2): string | boolean | null {
  if (action.type === 'check') return action.checked;
  if (['fill', 'select'].includes(action.type) || action.purpose === 'select_option')
    return action.value;
  return null;
}

export function changesAnswer(action: AutomationActionV2): boolean {
  return ['fill', 'select', 'check'].includes(action.type) || action.purpose === 'select_option';
}

export type ActiveTabPolicyResult =
  | { allowed: false; reason: string }
  | {
      allowed: true;
      action: AutomationActionV2;
      sources: SourceAnswer[];
      control: PageControl | undefined;
    };

export function validatePageBinding(
  page: PageObservation,
  binding: JobBinding,
  now = Date.now(),
): string | null {
  if (Date.parse(binding.expiresAt) <= now) return 'job_expired';
  if (page.origin !== binding.carrierOrigin || page.tabId !== binding.tabId)
    return 'binding_mismatch';
  if (page.authenticationRequired) return 'authentication_required';
  const age = now - Date.parse(page.capturedAt);
  if (age > 180_000 || age < -30_000) return 'observation_expired';
  if (new Set(page.controls.map((control) => control.elementId)).size !== page.controls.length)
    return 'duplicate_control';
  return null;
}

export function evaluateActiveTabAction(
  input: unknown,
  page: PageObservation,
  source: SourceAnswers,
): ActiveTabPolicyResult {
  const parsed = AutomationActionV2Schema.safeParse(input);
  const deny = (reason: string): ActiveTabPolicyResult => ({ allowed: false, reason });
  if (!parsed.success) return deny('invalid_action_schema');
  const action = parsed.data;
  if (action.type !== 'click' && action.purpose !== null) return deny('invalid_action_shape');
  if (action.type !== 'key' && action.key !== null) return deny('invalid_action_shape');
  if (action.type !== 'scroll' && action.direction !== null) return deny('invalid_action_shape');
  if (action.type !== 'wait' && action.milliseconds !== null) return deny('invalid_action_shape');
  if (action.type !== 'check' && action.checked !== null) return deny('invalid_action_shape');
  if (!changesAnswer(action) && action.value !== null) return deny('invalid_action_shape');
  if (action.type === 'check' && action.value !== null) return deny('invalid_action_shape');
  if (['scroll', 'wait'].includes(action.type) && action.elementId !== null)
    return deny('invalid_action_shape');
  if (action.pageStateId !== page.pageStateId) return deny('page_changed');
  if (page.authenticationRequired) return deny('authentication_required');
  if (action.confidence < 0.95) return deny('low_confidence');
  const control = page.controls.find((item) => item.elementId === action.elementId);
  if (!['scroll', 'wait'].includes(action.type) && !control) return deny('control_missing');
  if (action.type === 'next_page') {
    if (
      !control ||
      control.disabled ||
      !control.ordinaryNext ||
      !ordinaryNextLabel(control.label) ||
      commitmentPattern.test(control.context.join(' ')) ||
      !pageReadyToAdvance(page) ||
      action.sourceAnswerIds.length
    )
      return deny('navigation_not_ready');
  } else if (control && (control.disabled || controlIsHumanOnly(control)))
    return deny('human_only');
  const sources = action.sourceAnswerIds.map((answerId) =>
    source.answers.find((answer) => answer.answerId === answerId),
  );
  if (sources.some((answer) => !answer || answer.status !== 'answered' || answer.value === null))
    return deny('missing_source');
  const resolved = sources.filter((answer): answer is SourceAnswer => answer !== undefined);
  if (changesAnswer(action) && (!resolved.length || actionExpectedValue(action) === null))
    return deny('missing_provenance');
  if (action.purpose === 'add_entity' && !resolved.length) return deny('missing_provenance');
  if (new Set(action.sourceAnswerIds).size !== action.sourceAnswerIds.length)
    return deny('duplicate_source');
  if (
    action.type === 'fill' &&
    (!control ||
      !['input', 'textarea'].includes(control.tag) ||
      ['checkbox', 'radio', 'hidden', 'button', 'reset'].includes(control.inputType))
  )
    return deny('unsupported_control');
  if (
    action.type === 'select' &&
    (!control ||
      control.tag !== 'select' ||
      !control.options.some((option) => option.value === action.value))
  )
    return deny('unknown_option');
  if (
    action.type === 'check' &&
    (!control ||
      (!['checkbox', 'radio'].includes(control.inputType) &&
        !['checkbox', 'radio'].includes(control.role)))
  )
    return deny('unsupported_control');
  if (
    action.type === 'check' &&
    (control?.inputType === 'radio' || control?.role === 'radio') &&
    action.checked !== true
  )
    return deny('unsupported_control');
  if (
    action.type === 'key' &&
    (action.key !== 'Escape' || !control || !['combobox', 'listbox'].includes(control.role))
  )
    return deny('unsupported_key');
  if (action.type === 'click') {
    if (!control || !action.purpose) return deny('unsupported_click');
    const permitted = {
      open_control: control.role === 'combobox' || control.role === 'listbox',
      select_option: control.role === 'option' && action.value === control.value,
      add_entity:
        /^(add|new)\s+(another\s+|a\s+)?(applicant|driver|vehicle|property|address|household member)\b/i.test(
          control.label,
        ),
      expand_section: control.role !== 'tab' && /^(expand|show|open)\b/i.test(control.label),
      close_dialog: /^(close|dismiss|cancel)$/i.test(control.label.trim()),
    };
    if (!permitted[action.purpose]) return deny('unsupported_click');
  }
  if (action.type === 'scroll' && !action.direction) return deny('unsupported_scroll');
  if (action.type === 'wait' && (action.milliseconds === null || action.milliseconds < 100))
    return deny('unsupported_wait');
  return { allowed: true, action, sources: resolved, control };
}

export function unchangedAfterEntry(
  before: PageObservation,
  after: PageObservation,
  _elementId: string,
): boolean {
  const comparable = (page: PageObservation) => ({
    documentId: page.documentId,
    routeId: page.routeId,
    origin: page.origin,
    tabId: page.tabId,
    title: page.title,
    headings: page.headings,
    authenticationRequired: page.authenticationRequired,
    unsupportedFrames: page.unsupportedFrames,
    omittedControls: page.omittedControls,
    controls: semanticControlSet(page.controls),
  });
  return (
    !after.authenticationRequired &&
    JSON.stringify(comparable(before)) === JSON.stringify(comparable(after))
  );
}

// A control's semantic shape deliberately excludes its generated element ID, current answer,
// validation state and geometry. Those properties routinely change when controlled React inputs
// rerender and do not identify a different question. Policy is still evaluated against the fresh
// control before every action, so disabled/human-only changes remain material safety boundaries.
export function semanticControlShape(control: PageControl): Record<string, unknown> {
  return {
    key: control.key,
    tag: control.tag,
    inputType: control.inputType,
    role: control.role,
    label: control.label,
    section: control.section,
    required: control.required,
    disabled: control.disabled,
    humanOnly: control.humanOnly,
    ordinaryNext: control.ordinaryNext ?? false,
    options: control.options
      .map((option) => ({ value: option.value, label: option.label }))
      .sort((left, right) =>
        `${left.value}\u0000${left.label}`.localeCompare(`${right.value}\u0000${right.label}`),
      ),
  };
}

export function semanticControlSet(controls: PageControl[]): Record<string, unknown>[] {
  return controls
    .map(semanticControlShape)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
