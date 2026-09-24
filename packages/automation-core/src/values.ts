import { createHash } from 'node:crypto';
import { normalizeValue, type Normalization } from './value-operations.js';
export * from './value-operations.js';

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
