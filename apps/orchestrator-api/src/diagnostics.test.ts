import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { type DiagnosticEvent } from '@smartmapper/contracts';
import { JobDiagnostics } from './diagnostics.js';
import { ApiError } from './active-tab-service.js';

it.each([
  'mapping_not_trained',
  'mapping_selection_unavailable',
  'preview_tab_changed',
  'preview_owner_changed',
])('logs %s before job creation without identifiers or source values', async (reason) => {
  const events: DiagnosticEvent[] = [];
  const log = new JobDiagnostics((event) => events.push(event));
  await log.request(
    { requestId: randomUUID(), jobId: null, signal: new AbortController().signal },
    () => {
      log.emit('request', 'error', 1, undefined, new ApiError(409, reason));
      return Promise.resolve();
    },
  );
  expect(events[0]).toMatchObject({ jobId: null, code: 'conflict', apiReason: reason });
});

it('keeps concurrent stage logs isolated and omits raw errors and source data', async () => {
  const events: DiagnosticEvent[] = [];
  const log = new JobDiagnostics((event) => events.push(event));
  const first = randomUUID(),
    second = randomUUID();
  const signal = new AbortController().signal;
  await Promise.all([
    log
      .request({ requestId: randomUUID(), jobId: first, signal }, () =>
        log.stage(
          'plan',
          async () => {
            await Promise.resolve();
            throw Object.assign(new Error('Synthetic secret: mia_ext_private Alex data:image'), {
              status: 429,
            });
          },
          { controls: 3 },
        ),
      )
      .catch(() => undefined),
    log.request({ requestId: randomUUID(), jobId: second, signal }, () =>
      log.stage('verify', () => Promise.resolve(true), { actions: 2 }),
    ),
  ]);
  expect(log.events(first).map((event) => event.stage)).toEqual(['plan', 'plan']);
  expect(log.events(second).map((event) => event.stage)).toEqual(['verify', 'verify']);
  expect(log.events(first)[1]).toMatchObject({ phase: 'error', code: 'rate_limited' });
  expect(JSON.stringify(events)).not.toMatch(/mia_ext_private|Alex|data:image/);
});

it('bounds event retention and ignores failures in the diagnostic sink', async () => {
  vi.useFakeTimers();
  try {
    const log = new JobDiagnostics(() => {
      throw new Error('sink unavailable');
    });
    const jobId = randomUUID();
    await log.request(
      { requestId: randomUUID(), jobId, signal: new AbortController().signal },
      async () => {
        for (let i = 0; i < 150; i++) log.emit('read_back', 'end', 1, { verified: i });
        expect(await log.stage('plan', () => Promise.resolve('ok'))).toBe('ok');
      },
    );
    expect(log.events(jobId)).toHaveLength(100);
    vi.advanceTimersByTime(60 * 60_000 + 1);
    expect(log.events(jobId)).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});

it('records redacted action context without field labels or values', async () => {
  const events: DiagnosticEvent[] = [];
  const log = new JobDiagnostics((event) => events.push(event));
  const targetKey = 'a'.repeat(64);
  await log.request(
    {
      requestId: randomUUID(),
      jobId: randomUUID(),
      signal: new AbortController().signal,
    },
    () => {
      log.emit('read_back', 'info', 0, { actions: 2, verified: 1 }, undefined, {
        targetKey,
        actionType: 'fill',
        receiptStatus: 'failed',
        receiptReason: 'read_back_mismatch',
      });
      return Promise.resolve();
    },
  );
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    targetKey,
    actionType: 'fill',
    receiptStatus: 'failed',
    receiptReason: 'read_back_mismatch',
  });
  expect(JSON.stringify(events)).not.toMatch(/First Name|Jordan|04\/15\/1987/);
});
