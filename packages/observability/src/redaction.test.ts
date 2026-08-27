import { describe, expect, it } from 'vitest';

import { serializeSafeLog } from './index.js';

describe('PII-safe logging', () => {
  it('redacts sensitive structured values by default', () => {
    const line = serializeSafeLog({
      level: 'info',
      event: 'synthetic_redaction_test',
      fields: {
        applicantName: 'Avery Example',
        email: 'avery@example.invalid',
        phoneNumber: '555-010-0000',
        dateOfBirth: '1990-04-12',
        driversLicenseNumber: 'D1234567',
        policyNumber: 'POLICY-12345',
        vin: '1HGBH41JXMN109186',
        token: 'token_abcdefghijklmnopqrstuvwxyz',
        cookie: 'session=synthetic-cookie',
        password: 'synthetic-password',
      },
    });

    for (const secret of [
      'Avery Example',
      'avery@example.invalid',
      '555-010-0000',
      '1990-04-12',
      'D1234567',
      'POLICY-12345',
      '1HGBH41JXMN109186',
      'token_abcdefghijklmnopqrstuvwxyz',
      'session=synthetic-cookie',
      'synthetic-password',
    ]) {
      expect(line).not.toContain(secret);
    }
  });

  it('scrubs likely PII accidentally embedded in free text', () => {
    const line = serializeSafeLog({
      level: 'warn',
      event: 'message_scrub',
      fields: {
        message: 'Contact 555-010-0000 or avery@example.invalid; DOB 1990-04-12.',
      },
    });

    expect(line).not.toContain('555-010-0000');
    expect(line).not.toContain('avery@example.invalid');
    expect(line).not.toContain('1990-04-12');
  });
});
