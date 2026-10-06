import { afterEach, expect, it, vi } from 'vitest';
import type { DiagnosticEvent } from '@smartmapper/contracts';
import { ProgressTracker } from './progress.js';
const randomUUID = () => crypto.randomUUID();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
