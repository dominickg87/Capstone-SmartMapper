import { describe, expect, it } from 'vitest';

import { compareReadBack, resolveSourceValue, transformValue } from './values.js';

describe('source values and read-back validation', () => {
  it('resolves an indexed semantic source path', () => {
    expect(
      resolveSourceValue({ drivers: [{ dateOfBirth: '1991-02-03' }] }, 'drivers[0].dateOfBirth'),
    ).toBe('1991-02-03');
  });

  it('transforms a date deterministically', () => {
    expect(transformValue('1991-02-03', 'date_mm_dd_yyyy')).toBe('02/03/1991');
  });

  it('compares normalized phone read-back without logging the value', () => {
    const result = compareReadBack('(555) 010-0000', '5550100000', 'digits');
    expect(result.matches).toBe(true);
    expect(result.expectedHash).toHaveLength(64);
  });
});
