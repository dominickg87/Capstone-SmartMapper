import type { ActionReceipt, JobView } from '@smartmapper/contracts';

const pageWideStopReasons = new Set<ActionReceipt['reason']>([
  'page_changed',
  'tab_changed',
  'interrupted',
]);

/**
 * A rejected field must not discard independent sibling work that the server already queued.
 * Navigation/document loss still stops the in-page queue so the next pass can observe again.
 */
export function shouldContinueAfterReceipt(
  receipt: ActionReceipt,
  jobStatus: JobView['status'],
  halted: boolean,
): boolean {
  if (halted) return false;
  if (receipt.status === 'blocked')
    return jobStatus === 'executing' && !pageWideStopReasons.has(receipt.reason);
  if (receipt.status === 'failed') return jobStatus === 'executing';
  return true;
}

export function receiptStopReason(
  receipt: ActionReceipt,
  shouldContinue: boolean,
): 'blocked' | 'cancelled' | null {
  if (shouldContinue) return null;
  return receipt.status === 'blocked' ? 'blocked' : 'cancelled';
}
