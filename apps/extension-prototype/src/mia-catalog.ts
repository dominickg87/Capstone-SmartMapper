import {
  MiaFieldCatalogSchema,
  type MiaCatalogField,
  type MiaFieldCatalog,
} from '@smartmapper/contracts';

export { MiaFieldCatalogSchema as MiaCatalogSchema };
export type MiaCatalog = MiaFieldCatalog;

export function catalogFieldLabel(field: MiaCatalogField): string {
  const entity = field.entity?.label || field.entity?.type || '';
  const location = [field.section, entity].filter(Boolean).join(' / ');
  const context = field.context.length ? ` · ${field.context.join(' / ')}` : '';
  return `${field.question}${location ? ` — ${location}` : ''}${context} · ${field.sourcePath}`;
}

export function groupCatalogFields(fields: MiaCatalogField[]): Array<{
  label: string;
  fields: MiaCatalogField[];
}> {
  const groups = new Map<string, MiaCatalogField[]>();
  for (const field of fields) {
    const label = [field.section || 'Other M.I.A. fields', field.entity?.label]
      .filter(Boolean)
      .join(' — ');
    const existing = groups.get(label) ?? [];
    existing.push(field);
    groups.set(label, existing);
  }
  return Array.from(groups, ([label, grouped]) => ({ label, fields: grouped }));
}
