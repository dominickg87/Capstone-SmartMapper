import type { ActionBatch, JobView, PageControl } from '@smartmapper/contracts';
import { z } from 'zod';
import { trustedStorage } from './session.js';

// Local, per-browser-session details for the end-of-job "remember these?" review. The backend
// only knows candidate IDs and digests; labels and question wording stay in this trusted storage
// and are cleared with the job. Answer values are never stored here.

const signature = z.string().regex(/^[a-f0-9]{64}$/);

export const HumanEditMessageSchema = z
  .object({ type: z.literal('human-edit'), signature })
  .strict();

const FillSchema = z.object({
  signature,
  label: z.string().max(300),
  section: z.string().max(300),
  questions: z.array(z.string().max(300)).max(4),
  origin: z.enum(['model', 'memory']),
  filledAt: z.number(),
});
const FillsSchema = z.record(z.string(), FillSchema);
const EditsSchema = z.record(z.string(), z.number());
type Fill = z.infer<typeof FillSchema>;

export interface MappingReviewItem {
  candidateId: string;
  kind: JobView['candidates'][number]['kind'];
  label: string;
  section: string;
  questions: string[];
  // The human changed the field after SmartMapper filled it, so it cannot be remembered.
  edited: boolean;
  known: boolean;
}

async function load(): Promise<{ fills: Record<string, Fill>; edits: Record<string, number> }> {
  await trustedStorage();
  const stored: Record<string, unknown> = await chrome.storage.session.get([
    'mappingFills',
    'mappingEdits',
  ]);
  const fills = FillsSchema.safeParse(stored.mappingFills ?? {});
  const edits = EditsSchema.safeParse(stored.mappingEdits ?? {});
  return { fills: fills.success ? fills.data : {}, edits: edits.success ? edits.data : {} };
}

const editedAfterFill = (fill: Fill, edits: Record<string, number>): boolean =>
  (edits[fill.signature] ?? 0) > fill.filledAt;

export async function recordFill(batch: ActionBatch, control: PageControl): Promise<void> {
  if (!['fill', 'select', 'check'].includes(batch.action.type)) return;
  const { fills } = await load();
  const fill: Fill = {
    signature: control.signature,
    label: control.label.slice(0, 300),
    section: control.section.slice(0, 300),
    questions: batch.sources.slice(0, 4).map((source) => source.question.slice(0, 300)),
    origin: batch.origin,
    filledAt: Date.now(),
  };
  const entries = Object.entries({ ...fills, [batch.batchId]: fill }).slice(-150);
  await chrome.storage.session.set({ mappingFills: Object.fromEntries(entries) });
}

export async function recordEdit(edited: string): Promise<void> {
  const { edits } = await load();
  const entries = Object.entries({ ...edits, [edited]: Date.now() }).slice(-300);
  await chrome.storage.session.set({ mappingEdits: Object.fromEntries(entries) });
}

export async function mappingReview(job: JobView): Promise<MappingReviewItem[]> {
  const { fills, edits } = await load();
  return job.candidates.map((candidate) => {
    const fill = fills[candidate.candidateId];
    return {
      candidateId: candidate.candidateId,
      kind: candidate.kind,
      label: fill?.label ?? '',
      section: fill?.section ?? '',
      questions: fill?.questions ?? [],
      edited: fill ? editedAfterFill(fill, edits) : false,
      known: fill !== undefined,
    };
  });
}

/** Entries filled from memory that the human changed afterwards. */
export async function mappingCorrections(): Promise<string[]> {
  const { fills, edits } = await load();
  return Object.entries(fills)
    .filter(([, fill]) => fill.origin === 'memory' && editedAfterFill(fill, edits))
    .map(([batchId]) => batchId)
    .slice(-200);
}

export async function clearMappingReview(): Promise<void> {
  await trustedStorage();
  await chrome.storage.session.remove(['mappingFills', 'mappingEdits']);
}
