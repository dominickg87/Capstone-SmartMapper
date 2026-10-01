import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  AutomationActionV2Schema,
  PageObservationSchema,
  SourceAnswersSchema,
  type SmartMapperObservation,
  type SmartMapperPlan,
  type SourceAnswers,
} from '@smartmapper/contracts';
import { valueDigest } from '@smartmapper/automation-core/active-tab';
import { z } from 'zod';
import { ActiveTabJobService } from './active-tab-service.js';
import { MemoryCheckpointStore } from './checkpoints.js';
import { MemoryMappingStore, type MappingMemoryStore } from './mapping-memory-store.js';

const fixture = z
  .object({
    source: SourceAnswersSchema,
    page: PageObservationSchema,
    action: AutomationActionV2Schema,
  })
  .parse(
    JSON.parse(readFileSync(resolve('fixtures/mia-quotes/active-tab.synthetic.json'), 'utf8')),
  );
const signature = fixture.page.controls[0]!.signature;

function setup(memory: MappingMemoryStore | null = new MemoryMappingStore()) {
  const principal = { userId: '7' };
  let source: SourceAnswers = fixture.source;
  const sources = {
    redeem: vi.fn(() =>
      Promise.resolve({
        version: '2.0' as const,
        binding: {
          tenantId: 'demo',
          userId: principal.userId,
          quoteId: 'quote-synthetic',
          tabId: 42,
          carrierOrigin: fixture.page.origin,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        sourceToken: 's'.repeat(43),
        source: { ...source, userId: principal.userId },
      }),
    ),
    read: vi.fn(() => Promise.resolve({ ...source, userId: principal.userId })),
    revoke: vi.fn(() => Promise.resolve()),
  };
  // A scripted model: fill the first-name field until it holds a value, then finish the page.
  const mapper = {
    providerId: 'synthetic',
    proposeMappings: vi.fn((request: SmartMapperObservation): Promise<SmartMapperPlan> =>
      Promise.resolve(
        request.page.controls[0]?.value
          ? {
              version: '2.0',
              pageStateId: request.page.pageStateId,
              outcome: 'page_complete',
              actions: [],
              reviews: [],
            }
          : {
              version: '2.0',
              pageStateId: request.page.pageStateId,
              outcome: 'act',
              actions: [fixture.action],
              reviews: [],
            },
      ),
    ),
  };
  const verifier = { verify: vi.fn(() => Promise.resolve(true)) };
  const service = new ActiveTabJobService(
    new MemoryCheckpointStore(),
    sources,
    mapper,
    verifier,
    {
      miaOrigins: new Set(['https://mia.test']),
      carrierOrigins: new Set([fixture.page.origin]),
      principals: new Set(['demo/7', 'demo/8']),
    },
    memory ?? undefined,
  );
  const start = () =>
    service.start({
      miaOrigin: 'https://mia.test',
      code: 'c'.repeat(43),
      verifier: 'v'.repeat(43),
      carrierOrigin: fixture.page.origin,
      tabId: 42,
    });
  const observation = (value = '', label = 'First Name') => {
    const page = { ...structuredClone(fixture.page), capturedAt: new Date().toISOString() };
    page.controls[0]!.value = value;
    page.controls[0]!.label = label;
    return page;
  };
  const observe = (job: { jobId: string }, token: string, revision: number, value = '') =>
    service.observe(job.jobId, token, { revision, resume: true, observation: observation(value) });
  const receipt = async (
    job: { jobId: string },
    token: string,
    planned: Awaited<ReturnType<typeof observe>>,
    value = 'Alex',
  ) =>
    service.receipt(job.jobId, token, {
      revision: planned.job.revision,
      batchId: planned.batch!.batchId,
      receipt: {
        actionId: planned.batch!.action.actionId,
        status: 'verified',
        reason: 'matched',
        observedHash: await valueDigest(value),
      },
    });
  const setSource = (next: SourceAnswers) => {
    source = next;
  };
  return {
    service,
    mapper,
    verifier,
    sources,
    memory,
    principal,
    start,
    observation,
    observe,
    receipt,
    setSource,
  };
}

/** Runs one model-filled job and approves its candidate. */
async function learn(test: ReturnType<typeof setup>) {
  const { job, token } = await test.start();
  const planned = await test.observe(job, token, job.revision);
  expect(planned.batch?.origin).toBe('model');
  const filled = await test.receipt(job, token, planned);
  expect(filled.candidates).toEqual([{ candidateId: planned.batch!.batchId, kind: 'identity' }]);
  const approved = await test.service.approveMappings(job.jobId, token, {
    revision: filled.revision,
    candidateIds: [planned.batch!.batchId],
  });
  expect(approved.saved).toBe(1);
  expect(approved.job.candidates).toEqual([]);
  await test.service.cancel(job.jobId, token);
}

describe('human-approved mapping memory', () => {
  it('learns only after approval, then fills from memory before asking the model', async () => {
    const test = setup();
    await learn(test);
    const stored = await test.memory!.list(
      // The partition is the job partition; read it back through a new job's token below.
      (await test.start()).token.split('.')[0]!,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ signature, questionIds: ['applicant-first-name'] });
    expect(JSON.stringify(stored)).not.toContain('Alex');
    expect(JSON.stringify(stored)).not.toContain('First Name');

    test.mapper.proposeMappings.mockClear();
    test.verifier.verify.mockClear();
    const { job, token } = await test.start();
    const planned = await test.observe(job, token, job.revision);
    expect(planned.batch?.origin).toBe('memory');
    expect(planned.batch?.action).toMatchObject({ type: 'fill', value: 'Alex' });
    expect(test.mapper.proposeMappings).not.toHaveBeenCalled();
    // The independent fact check still runs for remembered entries.
    expect(test.verifier.verify).toHaveBeenCalledOnce();
    const filled = await test.receipt(job, token, planned);
    expect(filled).toMatchObject({ verified: 1, remembered: 1, candidates: [] });
    // Once memory has nothing left to do, the model still checks the page once.
    const sweep = await test.observe(job, token, filled.revision, 'Alex');
    expect(test.mapper.proposeMappings).toHaveBeenCalledOnce();
    expect(sweep.job.status).toBe('page_complete');
    expect((await test.memory!.list(token.split('.')[0]!))[0]).toMatchObject({ uses: 1 });
  });

  it('saves nothing without an explicit approval', async () => {
    const test = setup();
    const { job, token } = await test.start();
    const planned = await test.observe(job, token, job.revision);
    await test.receipt(job, token, planned);
    await test.service.cancel(job.jobId, token);
    expect(await test.memory!.list(token.split('.')[0]!)).toEqual([]);
  });

  it('falls back to the model after a failed read-back and disables repeated failures', async () => {
    const test = setup();
    await learn(test);
    for (let failure = 1; failure <= 2; failure += 1) {
      test.mapper.proposeMappings.mockClear();
      const { job, token } = await test.start();
      const planned = await test.observe(job, token, job.revision);
      expect(planned.batch?.origin).toBe('memory');
      const failed = await test.receipt(job, token, planned, 'Wrong');
      expect(failed).toMatchObject({ failed: 1, remembered: 0 });
      const retry = await test.observe(job, token, failed.revision);
      // Same job: the model now owns the field.
      expect(retry.batch?.origin).toBe('model');
      expect(test.mapper.proposeMappings).toHaveBeenCalledOnce();
      expect((await test.memory!.list(token.split('.')[0]!))[0]?.failures).toBe(failure);
      await test.service.cancel(job.jobId, token);
    }
    const { job, token } = await test.start();
    expect((await test.observe(job, token, job.revision)).batch?.origin).toBe('model');
  });

  it('never guesses between people or vehicles and never touches human-only controls', async () => {
    const test = setup();
    await learn(test);
    const answer = fixture.source.answers[0]!;
    test.setSource({
      ...fixture.source,
      answers: [
        answer,
        { ...answer, answerId: 'first-name-2', entity: 'Applicant 2', value: 'Sam' },
      ],
    });
    const twoApplicants = await test.start();
    expect(
      (await test.observe(twoApplicants.job, twoApplicants.token, twoApplicants.job.revision)).batch
        ?.origin,
    ).toBe('model');

    test.setSource(fixture.source);
    test.mapper.proposeMappings.mockClear();
    const { job, token } = await test.start();
    const consent = await test.service.observe(job.jobId, token, {
      revision: job.revision,
      resume: true,
      observation: test.observation('', 'I agree to the terms'),
    });
    expect(consent.batch).toBeNull();
    expect(test.mapper.proposeMappings).toHaveBeenCalledOnce();
  });

  it('drops a candidate the human changed and records corrections to memory fills', async () => {
    const test = setup();
    const first = await test.start();
    const planned = await test.observe(first.job, first.token, first.job.revision);
    const filled = await test.receipt(first.job, first.token, planned);
    expect(filled.candidates).toHaveLength(1);
    const changed = await test.observe(first.job, first.token, filled.revision, 'Alexander');
    expect(changed.job.candidates).toEqual([]);
    await test.service.cancel(first.job.jobId, first.token);

    await learn(test);
    const { job, token } = await test.start();
    const remembered = await test.observe(job, token, job.revision);
    const done = await test.receipt(job, token, remembered);
    const result = await test.service.approveMappings(job.jobId, token, {
      revision: done.revision,
      candidateIds: [],
      corrections: [remembered.batch!.batchId],
    });
    expect(result.saved).toBe(0);
    expect((await test.memory!.list(token.split('.')[0]!))[0]?.failures).toBe(1);
  });

  it('rejects stale or in-flight approvals and ignores unknown candidates', async () => {
    const test = setup();
    const { job, token } = await test.start();
    const planned = await test.observe(job, token, job.revision);
    await expect(
      test.service.approveMappings(job.jobId, token, {
        revision: planned.job.revision,
        candidateIds: [],
      }),
    ).rejects.toThrow('approval_conflict');
    const filled = await test.receipt(job, token, planned);
    await expect(
      test.service.approveMappings(job.jobId, token, {
        revision: filled.revision - 1,
        candidateIds: [planned.batch!.batchId],
      }),
    ).rejects.toThrow('approval_conflict');
    const unknown = await test.service.approveMappings(job.jobId, token, {
      revision: filled.revision,
      candidateIds: [crypto.randomUUID()],
    });
    expect(unknown.saved).toBe(0);
    await expect(
      test.service.approveMappings(job.jobId, token.slice(0, -1) + '!', {
        revision: unknown.job.revision,
        candidateIds: [planned.batch!.batchId],
      }),
    ).rejects.toThrow('unauthorized');
  });

  it("keeps one user's mappings away from another user's jobs", async () => {
    const test = setup();
    await learn(test);
    test.principal.userId = '8';
    test.mapper.proposeMappings.mockClear();
    const { job, token } = await test.start();
    expect((await test.observe(job, token, job.revision)).batch?.origin).toBe('model');
    expect(test.mapper.proposeMappings).toHaveBeenCalledOnce();
  });

  it('keeps working through the model when memory storage fails or is not configured', async () => {
    const broken: MappingMemoryStore = {
      list: () => Promise.reject(new Error('storage_down')),
      get: () => Promise.reject(new Error('storage_down')),
      put: () => Promise.reject(new Error('storage_down')),
    };
    const failing = setup(broken);
    const started = await failing.start();
    expect(
      (await failing.observe(started.job, started.token, started.job.revision)).batch?.origin,
    ).toBe('model');

    const disabled = setup(null);
    const { job, token } = await disabled.start();
    const planned = await disabled.observe(job, token, job.revision);
    const filled = await disabled.receipt(job, token, planned);
    expect(filled.candidates).toEqual([]);
    await expect(
      disabled.service.approveMappings(job.jobId, token, {
        revision: filled.revision,
        candidateIds: [planned.batch!.batchId],
      }),
    ).rejects.toThrow('mapping_memory_unavailable');
  });

  it('treats a rejected fact check on a remembered entry as a failure', async () => {
    const test = setup();
    await learn(test);
    test.verifier.verify.mockResolvedValueOnce(false);
    const { job, token } = await test.start();
    const planned = await test.observe(job, token, job.revision);
    expect(planned.batch?.origin).toBe('model');
    expect((await test.memory!.list(token.split('.')[0]!))[0]?.failures).toBe(1);
  });
});
