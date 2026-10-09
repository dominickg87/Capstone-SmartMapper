import { afterEach, expect, it, vi } from 'vitest';
import type { DiagnosticEvent } from '@smartmapper/contracts';
import { ProgressTracker } from './progress.js';
const randomUUID = () => crypto.randomUUID();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  'mapping_not_trained',
  'mapping_workflow_ambiguous',
  'mapping_selection_unavailable',
  'mapping_not_testable',
  'mapping_carrier_mismatch',
  'preview_tab_changed',
  'preview_owner_changed',
])('retains %s when startup fails before a job exists', (apiReason) => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '0.3.6' }) } });
  const tracker = new ProgressTracker(() => undefined);
  tracker.finish(tracker.begin('authorize', null), {
    status: 409,
    apiReason,
    message: 'Customer-private answer',
  });
  const report = JSON.parse(tracker.report()) as { events: DiagnosticEvent[] };
  expect(report.events.at(-1)).toMatchObject({
    jobId: null,
    stage: 'authorize',
    code: 'conflict',
    apiReason,
  });
  expect(tracker.report()).not.toContain('Customer-private');
});

it('reports the backend step at timeout and exports only bounded metadata', () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '0.2.9' }) } });
  const update = vi.fn();
  const tracker = new ProgressTracker(update);
  const start = tracker.begin('request', randomUUID());
  const backend: DiagnosticEvent = {
    ...start,
    id: randomUUID(),
    stage: 'verify',
    layer: 'backend',
    counts: { actions: 4 },
  };
  tracker.merge([backend], start.requestId);
  tracker.finish(start, new DOMException('Synthetic secret Alex 555-0100', 'TimeoutError'));
  tracker.stop();
  expect(update.mock.calls.at(-1)?.[0]).toMatchObject({
    active: false,
    failure: { stage: 'verify', code: 'timeout' },
  });
  expect(tracker.report()).toContain('"stage": "verify"');
  expect(tracker.report()).not.toMatch(/Alex|555-0100|Synthetic secret/);
});

it('does not revive a stopped spinner when delayed browser work completes', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const update = vi.fn();
  const tracker = new ProgressTracker(update);
  let complete!: () => void;
  const waiting = tracker.step(
    'capture',
    randomUUID(),
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  tracker.stop();
  complete();
  await waiting;
  expect(update.mock.calls.at(-1)?.[0]).toMatchObject({ active: false });
});

it('exports actual blocked receipts and known conflict reasons without customer values', () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '0.3.4' }) } });
  const tracker = new ProgressTracker(() => undefined);
  const jobId = randomUUID();
  tracker.receipt(
    jobId,
    'fill',
    { actionId: 'synthetic', status: 'blocked', reason: 'page_changed', observedHash: null },
    'Customer-private field label',
  );
  const start = tracker.begin('request', jobId);
  tracker.finish(start, {
    status: 409,
    apiReason: 'receipt_conflict',
    message: 'Customer-private answer',
  });
  const report = JSON.parse(tracker.report()) as { events: DiagnosticEvent[] };
  expect(report.events[0]).toMatchObject({
    receiptStatus: 'blocked',
    receiptReason: 'page_changed',
  });
  expect(report.events[0]).not.toHaveProperty('targetKey');
  expect(report.events.at(-1)).toMatchObject({ code: 'conflict', apiReason: 'receipt_conflict' });
  expect(tracker.report()).not.toContain('Customer-private');
});
