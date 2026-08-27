import { QuoteJobSchema, type QuoteJob, type QuoteJobState } from '@smartmapper/contracts';

const transitions: Readonly<Record<QuoteJobState, readonly QuoteJobState[]>> = {
  created: ['queued', 'cancelled', 'expired'],
  queued: ['provisioning', 'cancelled', 'failed', 'expired'],
  provisioning: ['waiting_for_login', 'running', 'cancelled', 'failed', 'expired'],
  waiting_for_login: ['running', 'waiting_for_user', 'cancelled', 'failed', 'expired'],
  running: ['waiting_for_user', 'ready_for_review', 'cancelled', 'failed', 'expired'],
  waiting_for_user: ['running', 'ready_for_review', 'cancelled', 'failed', 'expired'],
  ready_for_review: ['running', 'completed', 'cancelled', 'expired'],
  completed: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export class InvalidJobTransitionError extends Error {
  public constructor(
    public readonly from: QuoteJobState,
    public readonly to: QuoteJobState,
  ) {
    super('Invalid SmartMapper job transition: ' + from + ' -> ' + to);
    this.name = 'InvalidJobTransitionError';
  }
}

export class WorkflowStateMachine {
  private currentJob: QuoteJob;

  public constructor(job: QuoteJob) {
    this.currentJob = QuoteJobSchema.parse(job);
  }

  public get job(): QuoteJob {
    return structuredClone(this.currentJob);
  }

  public canTransition(to: QuoteJobState): boolean {
    return transitions[this.currentJob.state].includes(to);
  }

  public transition(to: QuoteJobState, occurredAt = new Date().toISOString()): QuoteJob {
    if (!this.canTransition(to)) {
      throw new InvalidJobTransitionError(this.currentJob.state, to);
    }

    this.currentJob = QuoteJobSchema.parse({
      ...this.currentJob,
      state: to,
      updatedAt: occurredAt,
    });

    return this.job;
  }

  public serialize(): string {
    return JSON.stringify(this.currentJob);
  }

  public static restore(serializedJob: string): WorkflowStateMachine {
    return new WorkflowStateMachine(QuoteJobSchema.parse(JSON.parse(serializedJob)));
  }
}

export function allowedTransitions(state: QuoteJobState): readonly QuoteJobState[] {
  return transitions[state];
}
