import { createHash } from 'node:crypto';

export class SourceValueNotFoundError extends Error {
  public constructor(public readonly sourcePath: string) {
    super('No source value is available for semantic path: ' + sourcePath);
    this.name = 'SourceValueNotFoundError';
  }
}

function pathSegments(sourcePath: string): Array<string | number> {
  return sourcePath
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

export function resolveSourceValue(source: unknown, sourcePath: string): unknown {
  let value: unknown = source;

  for (const segment of pathSegments(sourcePath)) {
    if (typeof segment === 'number') {
      if (!Array.isArray(value) || segment >= value.length) {
        throw new SourceValueNotFoundError(sourcePath);
      }
      value = value[segment];
      continue;
    }

    if (typeof value !== 'object' || value === null || !(segment in value)) {
      throw new SourceValueNotFoundError(sourcePath);
    }

    value = (value as Record<string, unknown>)[segment];
  }

  if (value === undefined || value === null || value === '') {
    throw new SourceValueNotFoundError(sourcePath);
  }

  return value;
}

export type Transformation =
  'identity' | 'uppercase' | 'digits_only' | 'date_mm_dd_yyyy' | 'boolean_yes_no' | 'stringify';

export function transformValue(value: unknown, transformation: Transformation): string {
  switch (transformation) {
    case 'identity':
      return String(value);
    case 'uppercase':
      return String(value).toUpperCase();
    case 'digits_only':
      return String(value).replace(/\D/g, '');
    case 'date_mm_dd_yyyy': {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
      if (!match) {
        throw new Error('Expected an ISO date for date_mm_dd_yyyy.');
      }
      return match[2] + '/' + match[3] + '/' + match[1];
    }
    case 'boolean_yes_no':
      if (typeof value !== 'boolean') {
        throw new Error('Expected a boolean for boolean_yes_no.');
      }
      return value ? 'yes' : 'no';
    case 'stringify':
      return JSON.stringify(value);
  }
}

export type Normalization = 'text' | 'case_insensitive' | 'digits' | 'date' | 'boolean';

export function normalizeValue(value: unknown, normalization: Normalization): string {
  const text = String(value).trim();

  switch (normalization) {
    case 'text':
      return text.replace(/\s+/g, ' ');
    case 'case_insensitive':
      return text.replace(/\s+/g, ' ').toLocaleLowerCase();
    case 'digits':
      return text.replace(/\D/g, '');
    case 'date': {
      const digits = text.replace(/\D/g, '');
      if (digits.length === 8 && /^\d{8}$/.test(digits)) {
        return digits;
      }
      return text.toLocaleLowerCase();
    }
    case 'boolean':
      return /^(true|yes|1|checked)$/i.test(text) ? 'true' : 'false';
  }
}

export interface ReadBackComparison {
  matches: boolean;
  expectedHash: string;
  observedHash: string;
}

function hashNormalized(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function compareReadBack(
  expected: unknown,
  observed: unknown,
  normalization: Normalization,
): ReadBackComparison {
  const normalizedExpected = normalizeValue(expected, normalization);
  const normalizedObserved = normalizeValue(observed, normalization);

  return {
    matches: normalizedExpected === normalizedObserved,
    expectedHash: hashNormalized(normalizedExpected),
    observedHash: hashNormalized(normalizedObserved),
  };
}
