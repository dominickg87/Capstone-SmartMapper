import { ReadPageDataSchema, type ReadPageData } from '@smartmapper/contracts';
import { homeownersCatalogSource, homeownersFields } from './homeowners-catalog.js';

export type MappingNotes = Record<string, string>;
export const NO_MIA_FIELD = '__no_mia_field__';
const line = (value: string): string => value.replace(/\p{Cc}/gu, ' ').trim();

/** Explicit local worksheet export. No answers, URL paths, tokens or browser state are read. */
export function createMappingNotes(data: ReadPageData, mappings: MappingNotes): string {
  const page = ReadPageDataSchema.parse(data);
  let origin = 'Unavailable';
  try {
    const url = new URL(page.pageOrigin);
    if (['http:', 'https:'].includes(url.protocol)) origin = url.origin;
  } catch {
    /* Synthetic/opaque documents have no web origin. */
  }
  const lines = [
    'SmartMapper - Homeowners mapping notes',
    `Website: ${origin}`,
    `M.I.A. catalog source revision: ${homeownersCatalogSource.revision}`,
    `Fields in this capture: ${page.fields.length}`,
    `Incomplete capture: ${page.truncated || page.inaccessibleFrames > 0 || page.unreadableControls > 0 || page.fields.some((field) => field.choicesIncomplete) ? 'Yes' : 'No'}`,
    'Numbers match the page markers and side-panel cards for this capture.',
    'Review worksheet only. Unmapped fields and missing/default answers need a decision before a demo.',
    'Only observed field descriptions and chosen M.I.A. source fields are included; no entered answers.',
    '',
  ];
  for (const field of page.fields) {
    const selection = mappings[field.key];
    const source = homeownersFields.find((item) => item.sourcePath === selection);
    const target = source
      ? `${source.section} / ${source.question} [${source.sourcePath}]`
      : selection === NO_MIA_FIELD
        ? 'NO MATCHING M.I.A. FIELD - review/default decision needed'
        : 'UNMAPPED';
    lines.push(
      `${field.number}. ${line(field.label)} = ${line(target)}`,
      `   Control: ${line(field.type)}; frame ${field.frame}; ${field.visible ? 'visible' : 'hidden'}; ${field.required ? 'required' : 'optional'}`,
      `   Page field name: ${line(field.name) || '(none)'}`,
      `   Page field ID: ${line(field.id) || '(none)'}`,
    );
    if (field.section) lines.push(`   Page section: ${line(field.section)}`);
    if (field.choices.length)
      lines.push(
        `   Page choices: ${field.choices.map((choice) => line(choice.label) + (choice.disabled ? ' (disabled)' : '')).join(' | ')}`,
      );
    if (field.choicesIncomplete)
      lines.push('   Page choices are incomplete; reveal the control and read again.');
    if (source?.options.length)
      lines.push(
        `   M.I.A. choices: ${source.options.map((choice) => `${line(choice.label)} [${line(String(choice.value))}]`).join(' | ')}`,
      );
    lines.push('');
  }
  return lines.join('\r\n');
}

export function downloadMappingNotes(data: ReadPageData, mappings: MappingNotes): void {
  const text = createMappingNotes(data, mappings);
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `smartmapper-homeowners-mapping-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
