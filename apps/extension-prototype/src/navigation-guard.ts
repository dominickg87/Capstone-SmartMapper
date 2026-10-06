import type { ActionBatch, ActionReceipt, JobView } from '@smartmapper/contracts';

export function canExecuteFreshNavigation(
  batches: ActionBatch[],
  entryReceipts: ActionReceipt[] | null,
  job: JobView,
): boolean {
  // Navigation is never consumed from a response that also planned field entry. The controller
  // must re-observe the completed page and obtain one fresh guarded Next batch.
  if (entryReceipts !== null || batches.length !== 1) return false;
  const [batch] = batches;
  return (
    batch?.action.type === 'next_page' &&
    job.reviews.length === 0 &&
    ['executing', 'running'].includes(job.status)
  );
}
