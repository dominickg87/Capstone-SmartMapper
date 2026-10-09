import type {
  MappingDisposition,
  MappingTransform,
  MiaCatalogField,
  TrainingField,
} from '@smartmapper/contracts';
import { isSemanticHash } from '@smartmapper/automation-core/registry';

export function carrierDisplayText(value: string, fallback: string): string {
  return !value || isSemanticHash(value) ? fallback : value;
}

export function carrierOptionDisplay(label: string, index: number): string {
  return carrierDisplayText(label, `Carrier option ${index + 1}`);
}

export function carrierBooleanTransform(field: TrainingField): MappingTransform {
  const targets = field.control.options;
  return {
    kind: 'boolean',
    trueValue: targets[0]?.value ?? true,
    falseValue: targets[1]?.value ?? false,
  };
}

export function carrierEnumCases(
  sources: MiaCatalogField['options'],
  field: TrainingField,
): Extract<MappingTransform, { kind: 'enum' }>['cases'] {
  const targets = field.control.options;
  return sources.map((source, index) => ({
    source: source.value,
    target: targets[index]?.value ?? targets[0]?.value ?? source.value,
  }));
}

export function defaultTransform(
  field: MiaCatalogField,
  carrierField?: TrainingField,
): MappingTransform {
  if (field.dataType === 'date') return { kind: 'date', format: 'MM/DD/YYYY' };
  if (field.dataType === 'multiselect') {
    const checkbox =
      carrierField?.control.inputType.toLowerCase() === 'checkbox' ||
      carrierField?.control.role.toLowerCase() === 'checkbox';
    const first = field.options[0];
    if (checkbox && first) return { kind: 'multiselect_membership', member: first.value };
    return { kind: 'multiselect_join', separator: ', ' };
  }
  return { kind: 'identity' };
}

const dispositionNames: Record<MappingDisposition['kind'], string> = {
  source: 'Map from M.I.A.',
  carrier_default: 'Keep carrier default',
  fixed_value: 'Use approved fixed value',
  human_required: 'Human entry required',
  ignore: 'Ignore / not applicable',
  leave_blank: 'Leave optional field blank',
};

export function mappingSummary(
  disposition: MappingDisposition | null,
  catalog: MiaCatalogField[],
): string {
  if (!disposition) return 'Missing mapping';
  if (disposition.kind !== 'source') return dispositionNames[disposition.kind];
  const reference = disposition.references[0];
  const field = reference
    ? catalog.find(
        (item) =>
          item.sourcePath === reference.sourcePath ||
          item.sourcePattern === reference.sourcePathPattern,
      )
    : undefined;
  const suffix = disposition.references.length > 1 ? ` +${disposition.references.length - 1}` : '';
  return field ? `${field.question}${suffix}` : `M.I.A. source${suffix}`;
}

export function carrierFieldMetadata(field: TrainingField): string {
  const logicalType = field.control.choiceGroup
    ? 'radio group'
    : field.control.inputType || field.control.tag;
  const choices = field.control.options.length
    ? ` · ${field.control.options.length} choice${field.control.options.length === 1 ? '' : 's'}`
    : '';
  const section =
    field.control.reference?.section ||
    carrierDisplayText(field.control.section, 'Carrier section');
  return `${[section, logicalType].filter(Boolean).join(' · ')}${choices}${
    field.control.required ? ' · required' : ' · optional'
  }`;
}

export function dispositionReady(
  field: TrainingField,
  disposition: MappingDisposition | null,
  repeatBinding?: {
    entityType: 'applicant' | 'additionalDriver' | 'vehicle';
    index: number;
  } | null,
): boolean {
  if (!disposition) return false;
  if (disposition.kind === 'leave_blank') return !field.control.required;
  if (disposition.kind === 'fixed_value') return String(disposition.value).trim().length > 0;
  if (disposition.kind !== 'source') return true;
  if (disposition.references.length === 0) return false;
  if (
    (repeatBinding === undefined ? field.repeatIndex : (repeatBinding?.index ?? null)) === null &&
    disposition.references.some((reference) => reference.binding === 'same_position')
  )
    return false;
  if (
    disposition.transform.kind === 'multiselect_membership' &&
    typeof disposition.transform.member === 'string' &&
    disposition.transform.member.trim().length === 0
  )
    return false;
  if (disposition.transform.kind === 'enum') {
    const targets = new Set(field.control.options.map((option) => String(option.value)));
    return (
      disposition.transform.cases.length > 0 &&
      disposition.transform.cases.every((entry) => targets.has(String(entry.target)))
    );
  }
  return true;
}
