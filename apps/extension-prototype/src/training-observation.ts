import {
  TrainingPageObservationSchema,
  type PageObservation,
  type TrainingControlSnapshot,
  type TrainingPageObservation,
} from '@smartmapper/contracts';
import {
  canonicalControlInputType,
  canonicalControlRole,
  semanticHashPrefix,
  semanticTextDigest,
} from '@smartmapper/automation-core/registry';

const redacted = '[redacted]';
const sensitivePatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b\d{3}-?\d{2}-?\d{4}\b/g,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b\d{1,6}\s+[A-Z0-9.' -]{2,40}\s(?:ST(?:REET)?|RD|ROAD|AVE(?:NUE)?|DR(?:IVE)?|LN|LANE|BLVD|BOULEVARD|CT|COURT|WAY|PKWY|PARKWAY)\b/gi,
  /\b[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\b/gi,
  /\b(?=[A-Z0-9_-]{12,}\b)(?=[A-Z0-9_-]*\d)[A-Z0-9_-]+\b/gi,
];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function scrub(value: string, enteredValues: string[]): string {
  let result = value;
  for (const entered of enteredValues)
    result = result.replace(new RegExp(escapeRegExp(entered), 'gi'), redacted);
  for (const pattern of sensitivePatterns) result = result.replace(pattern, redacted);
  return result.replace(/(?:\[redacted\]\s*){2,}/gi, `${redacted} `).trim();
}

function containsSensitive(value: string, enteredValues: string[]): boolean {
  return scrub(value, enteredValues) !== value;
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

async function persistedSemanticText(value: string): Promise<string> {
  const candidate = normalized(value);
  if (!candidate) return '';
  return semanticHashPrefix + (await semanticTextDigest(candidate));
}

async function persistedOpaqueKey(value: string): Promise<string> {
  return semanticHashPrefix + (await semanticTextDigest(value));
}

function addEntityType(
  control: PageObservation['controls'][number],
): TrainingControlSnapshot['addEntityType'] {
  if (control.tag !== 'button' || control.humanOnly) return null;
  const label = normalized(control.label);
  if (!/^(?:add|new)\s+(?:(?:another|a)\s+)?/i.test(label)) return null;
  if (/\b(?:driver|operator)\b/i.test(label)) return 'additionalDriver';
  if (/\bvehicle\b/i.test(label)) return 'vehicle';
  if (/\b(?:applicant|household member)\b/i.test(label)) return 'applicant';
  return null;
}

function operationalTarget(
  control: PageObservation['controls'][number],
): TrainingControlSnapshot['operationalTarget'] {
  const description = [control.section, control.label, ...control.context].join(' ');
  if (/\bcarrier\s*(?:code|id|identifier|number|name)\b/i.test(description))
    return 'carrier_operational';
  if (
    /\b(?:agency|agent|producer|office|branch)\s*(?:code|id|identifier|number|name)\b/i.test(
      description,
    )
  )
    return 'agency_operational';
  return null;
}

function repeatHint(
  control: PageObservation['controls'][number],
): TrainingControlSnapshot['repeatHint'] {
  const source = normalized([control.section, control.label, ...control.context].join(' '));
  const ordinals = [
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
  ];
  const ordinal =
    '(\\d{1,2}(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)';
  const kind = '(additional driver|driver|operator|vehicle|auto|applicant|named insured)';
  const after = new RegExp(`\\b${kind}\\s*(?:#\\s*)?${ordinal}\\b`, 'i').exec(source);
  const before = new RegExp(`\\b${ordinal}\\s+${kind}\\b`, 'i').exec(source);
  const unnumbered = new RegExp(`\\b${kind}\\b`, 'i').exec(source);
  const entity = after
    ? { kind: after[1]!, ordinal: after[2]! }
    : before
      ? { kind: before[2]!, ordinal: before[1]! }
      : unnumbered
        ? { kind: unnumbered[1]!, ordinal: '1' }
        : null;
  if (!entity) return null;
  const raw = entity.ordinal.toLowerCase().replace(/^(\d+)(?:st|nd|rd|th)$/i, '$1');
  const index = /^\d+$/.test(raw) ? Math.max(0, Number(raw) - 1) : ordinals.indexOf(raw);
  if (index < 0 || index > 99) return null;
  const entityKind = entity.kind.toLowerCase();
  return {
    entityType:
      entityKind === 'vehicle' || entityKind === 'auto'
        ? 'vehicle'
        : entityKind.includes('driver') || entityKind === 'operator'
          ? 'additionalDriver'
          : 'applicant',
    index,
  };
}

function knownEnteredValues(observation: PageObservation): string[] {
  return [
    ...new Set(
      observation.controls
        .filter(
          (control) =>
            !['radio', 'checkbox', 'button', 'submit'].includes(control.inputType.toLowerCase()) &&
            control.role.toLowerCase() !== 'radio' &&
            ['input', 'textarea', 'custom'].includes(control.tag),
        )
        .map((control) => control.value.trim())
        .filter((value) => value.length >= 3),
    ),
  ].sort((left, right) => right.length - left.length);
}

async function structuralControl(
  control: PageObservation['controls'][number],
  enteredValues: string[],
): Promise<TrainingControlSnapshot> {
  const radio =
    control.inputType.toLowerCase() === 'radio' || control.role.toLowerCase() === 'radio';
  const semanticText = [control.label, control.section, ...control.context].join(' ');
  const entitySelector =
    control.options.length > 0 &&
    (/\b(?:customer|client|named insured|policyholder|account holder)\b/i.test(semanticText) ||
      /\bselect\s+(?:an?\s+)?(?:applicant|driver|vehicle)\b/i.test(semanticText) ||
      /\b(?:applicant|driver|vehicle)\s+(?:name|record|selection)\b/i.test(semanticText) ||
      /^(?:applicant|driver|vehicle)$/i.test(control.label.trim()));
  const unsafeOptions = control.options.some(
    (option) =>
      containsSensitive(option.value, enteredValues) ||
      containsSensitive(option.label, enteredValues),
  );
  const unsafeChoice = radio && containsSensitive(control.value, enteredValues);
  const omitChoices = entitySelector || unsafeOptions || unsafeChoice;
  const label = await persistedSemanticText(control.label);
  const section = await persistedSemanticText(control.section);
  const context = await Promise.all(control.context.map(persistedSemanticText));
  const choiceGroup = control.choiceGroup
    ? {
        key: await persistedOpaqueKey(control.choiceGroup.key),
        label: await persistedSemanticText(control.choiceGroup.label),
      }
    : null;
  return {
    elementId: control.elementId,
    key: control.key,
    tag: control.tag,
    inputType: canonicalControlInputType(control.inputType),
    role: canonicalControlRole(control.role),
    label,
    section,
    context,
    required: control.required,
    disabled: control.disabled,
    humanOnly: control.humanOnly || omitChoices,
    addEntityType: addEntityType(control),
    operationalTarget: operationalTarget(control),
    repeatHint: repeatHint(control),
    ...(control.ordinaryNext === undefined ? {} : { ordinaryNext: control.ordinaryNext }),
    choiceGroup,
    choiceValue: radio && !omitChoices ? await persistedSemanticText(control.value) : null,
    options: omitChoices
      ? []
      : await Promise.all(
          control.options.map(async (option) => ({
            value: await persistedSemanticText(option.value),
            label: await persistedSemanticText(option.label),
          })),
        ),
    rect: { ...control.rect },
  };
}

/** Removes every customer-entered or validation value before training data crosses the API boundary. */
export async function structuralTrainingObservation(
  observation: PageObservation,
): Promise<TrainingPageObservation> {
  const enteredValues = knownEnteredValues(observation);
  return TrainingPageObservationSchema.parse({
    version: observation.version,
    tabId: observation.tabId,
    origin: observation.origin,
    pageStateId: observation.pageStateId,
    documentId: observation.documentId,
    routeId: observation.routeId,
    fingerprint: observation.fingerprint,
    title: '',
    headings: [],
    controls: await Promise.all(
      observation.controls.map((control) => structuralControl(control, enteredValues)),
    ),
    authenticationRequired: observation.authenticationRequired,
    unsupportedFrames: observation.unsupportedFrames,
    omittedControls: observation.omittedControls,
    capturedAt: observation.capturedAt,
  });
}
