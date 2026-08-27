import type { QuoteJob, ReviewItem } from '@smartmapper/contracts';

export interface QueueService {
  enqueue(job: QuoteJob): Promise<void>;
}

export interface JobStore {
  create(job: QuoteJob): Promise<QuoteJob>;
  get(jobId: string): Promise<QuoteJob | undefined>;
  update(job: QuoteJob): Promise<QuoteJob>;
}

export interface NotificationService {
  notifyStatus(job: QuoteJob, reasonCode: string): Promise<void>;
}

export interface BrowserSessionHandoffService {
  createHandoff(job: QuoteJob): Promise<{ handoffReference: string; expiresAt: string }>;
  revoke(jobId: string): Promise<void>;
}

export class InMemoryQueueService implements QueueService {
  public readonly queuedJobIds: string[] = [];

  public enqueue(job: QuoteJob): Promise<void> {
    this.queuedJobIds.push(job.jobId);
    return Promise.resolve();
  }
}

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, QuoteJob>();

  public create(job: QuoteJob): Promise<QuoteJob> {
    if (this.jobs.has(job.jobId)) {
      return Promise.reject(new Error('A job with this identifier already exists.'));
    }
    this.jobs.set(job.jobId, structuredClone(job));
    return Promise.resolve(structuredClone(job));
  }

  public get(jobId: string): Promise<QuoteJob | undefined> {
    const job = this.jobs.get(jobId);
    return Promise.resolve(job ? structuredClone(job) : undefined);
  }

  public update(job: QuoteJob): Promise<QuoteJob> {
    if (!this.jobs.has(job.jobId)) {
      return Promise.reject(new Error('Cannot update a job that does not exist.'));
    }
    this.jobs.set(job.jobId, structuredClone(job));
    return Promise.resolve(structuredClone(job));
  }
}

export class PrototypeJobService {
  public constructor(
    private readonly store: JobStore,
    private readonly queue: QueueService,
  ) {}

  public async create(job: QuoteJob): Promise<QuoteJob> {
    const created = await this.store.create(job);
    const queued: QuoteJob = {
      ...created,
      state: 'queued',
      updatedAt: new Date().toISOString(),
    };
    await this.store.update(queued);
    await this.queue.enqueue(queued);
    return queued;
  }

  public async read(jobId: string): Promise<QuoteJob | undefined> {
    return this.store.get(jobId);
  }

  public async cancel(jobId: string): Promise<QuoteJob | undefined> {
    const job = await this.store.get(jobId);
    if (!job || ['completed', 'failed', 'cancelled', 'expired'].includes(job.state)) {
      return job;
    }
    return this.store.update({
      ...job,
      state: 'cancelled',
      updatedAt: new Date().toISOString(),
    });
  }

  public async submitHumanResponse(
    jobId: string,
    reviewItemId: string,
  ): Promise<QuoteJob | undefined> {
    const job = await this.store.get(jobId);
    if (!job) {
      return undefined;
    }
    const remaining = job.reviewItems.filter((item) => item.reviewItemId !== reviewItemId);
    return this.store.update({
      ...job,
      reviewItems: remaining,
      state: remaining.some((item) => item.blocking) ? 'waiting_for_user' : 'running',
      updatedAt: new Date().toISOString(),
    });
  }

  public async reviewSummary(jobId: string): Promise<
    | {
        jobId: string;
        state: QuoteJob['state'];
        unresolved: Array<Pick<ReviewItem, 'reviewItemId' | 'reasonCode' | 'summary' | 'blocking'>>;
      }
    | undefined
  > {
    const job = await this.store.get(jobId);
    if (!job) {
      return undefined;
    }
    return {
      jobId,
      state: job.state,
      unresolved: job.reviewItems.map(({ reviewItemId, reasonCode, summary, blocking }) => ({
        reviewItemId,
        reasonCode,
        summary,
        blocking,
      })),
    };
  }
}
