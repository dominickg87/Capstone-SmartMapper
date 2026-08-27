import type { QuoteJob } from '@smartmapper/contracts';
import { describe, expect, it } from 'vitest';

import { InMemoryJobStore, InMemoryQueueService, PrototypeJobService } from './services.js';

function job(): QuoteJob {
  return {
    version: '1.0',
    jobId: 'job-api-test',
    tenantReference: 'tenant-synthetic',
    userReference: 'user-synthetic',
    quoteReference: 'quote-synthetic-complete',
    adapterId: 'mock-modern',
    adapterVersion: '1.0.0',
    executionMode: 'extension',
    state: 'created',
    reviewItems: [],
    createdAt: '2026-01-15T12:00:00.000Z',
    updatedAt: '2026-01-15T12:00:00.000Z',
    expiresAt: '2026-01-15T13:00:00.000Z',
  };
}

describe('prototype job service', () => {
  it('creates, queues, reads, and cancels a job', async () => {
    const queue = new InMemoryQueueService();
    const service = new PrototypeJobService(new InMemoryJobStore(), queue);
    expect((await service.create(job())).state).toBe('queued');
    expect(queue.queuedJobIds).toEqual(['job-api-test']);
    expect((await service.read('job-api-test'))?.state).toBe('queued');
    expect((await service.cancel('job-api-test'))?.state).toBe('cancelled');
  });
});
