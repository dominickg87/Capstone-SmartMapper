import { describe, expect, it } from 'vitest';
import type { ActionReceipt } from '@smartmapper/contracts';
import { receiptStopReason, shouldContinueAfterReceipt } from './batch-continuation.js';

const receipt = (
  status: ActionReceipt['status'],
  reason: ActionReceipt['reason'],
): ActionReceipt => ({
  actionId: 'field-action',
  status,
  reason,
  observedHash: null,
});

describe('extension field-batch continuation', () => {
  it('continues an independent sibling after a field-local block', () => {
    expect(
      shouldContinueAfterReceipt(receipt('blocked', 'control_missing'), 'executing', false),
    ).toBe(true);
    expect(
      shouldContinueAfterReceipt(receipt('blocked', 'policy_blocked'), 'executing', false),
    ).toBe(true);
    expect(receiptStopReason(receipt('blocked', 'control_missing'), true)).toBeNull();
  });

  it.each(['page_changed', 'tab_changed', 'interrupted'] as const)(
    'stops and re-observes after %s',
    (reason) => {
      expect(shouldContinueAfterReceipt(receipt('blocked', reason), 'executing', false)).toBe(
        false,
      );
      expect(receiptStopReason(receipt('blocked', reason), false)).toBe('blocked');
    },
  );

  it('continues a failed read-back only while the backend still has queued work', () => {
    expect(
      shouldContinueAfterReceipt(receipt('failed', 'read_back_mismatch'), 'executing', false),
    ).toBe(true);
    expect(
      shouldContinueAfterReceipt(receipt('failed', 'read_back_mismatch'), 'running', false),
    ).toBe(false);
  });

  it('never continues after the user pauses', () => {
    expect(shouldContinueAfterReceipt(receipt('verified', 'matched'), 'executing', true)).toBe(
      false,
    );
    expect(receiptStopReason(receipt('verified', 'matched'), false)).toBe('cancelled');
  });
});
