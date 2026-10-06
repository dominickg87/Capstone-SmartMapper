import { describe, expect, it } from 'vitest';
import type { ActionBatch, ActionReceipt, JobView } from '@smartmapper/contracts';
import { canExecuteFreshNavigation } from './navigation-guard.js';

const next = {
  batchId: crypto.randomUUID(),
  action: { type: 'next_page' },
} as ActionBatch;
const job = {
  version: '2.0',
  jobId: crypto.randomUUID(),
  revision: 1,
  status: 'executing',
  binding: {
    tenantId: 'tenant',
    userId: 'user',
    quoteId: 'quote',
    carrierOrigin: 'https://carrier.test',
    tabId: 1,
    expiresAt: '2026-10-06T18:00:00.000Z',
  },
  verified: 0,
  failed: 0,
  reviews: [],
} satisfies JobView;

describe('ordinary navigation guard', () => {
  it('requires a fresh response containing only one guarded Next action', () => {
    expect(canExecuteFreshNavigation([next], null, job)).toBe(true);
    expect(canExecuteFreshNavigation([next, next], null, job)).toBe(false);
  });

  it('invalidates a planned Next after any field-entry execution', () => {
    const failed = [{ status: 'failed', reason: 'read_back_mismatch' }] as ActionReceipt[];
    const verified = [{ status: 'verified', reason: 'matched' }] as ActionReceipt[];

    expect(canExecuteFreshNavigation([next], failed, job)).toBe(false);
    expect(canExecuteFreshNavigation([next], verified, job)).toBe(false);
  });

  it('rejects navigation while any page review remains', () => {
    expect(
      canExecuteFreshNavigation([next], null, {
        ...job,
        reviews: [
          {
            elementId: null,
            question: 'Synthetic field',
            entity: 'Synthetic section',
            reason: 'read_back_mismatch',
          },
        ],
      }),
    ).toBe(false);
  });
});
