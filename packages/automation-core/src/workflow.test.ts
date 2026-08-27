import type { QuoteJob } from '@smartmapper/contracts';
import { describe, expect, it } from 'vitest';

import { InvalidJobTransitionError, WorkflowStateMachine } from './workflow.js';

function job(): QuoteJob {
  return {
    version: '1.0',
    jobId: 'job-synthetic-1',
    tenantReference: 'tenant-synthetic',
    userReference: 'user-synthetic',
    quoteReference: 'quote-synthetic-1',
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

describe('resumable workflow state machine', () => {
  it('persists and restores a paused job', () => {
    const machine = new WorkflowStateMachine(job());
    machine.transition('queued');
    machine.transition('provisioning');
    machine.transition('running');
    machine.transition('waiting_for_user');

    const restored = WorkflowStateMachine.restore(machine.serialize());
    expect(restored.job.state).toBe('waiting_for_user');
    expect(restored.transition('running').state).toBe('running');
  });

  it('rejects terminal-to-running transitions', () => {
    const machine = new WorkflowStateMachine(job());
    machine.transition('cancelled');

    expect(() => machine.transition('running')).toThrow(InvalidJobTransitionError);
  });
});
