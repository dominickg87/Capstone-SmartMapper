import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
  DiagnosticEventSchema,
  diagnosticCode,
  type DiagnosticCounts,
  type DiagnosticEvent,
  type MappingStage,
} from '@smartmapper/contracts';

interface RequestTrace {
  requestId: string;
  jobId: string | null;
  signal: AbortSignal;
  stage?: MappingStage;
}

export function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Operation cancelled', 'AbortError'),
      );
    signal.addEventListener('abort', aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
    if (signal.aborted) aborted();
  });
}

export class JobDiagnostics {
  private readonly context = new AsyncLocalStorage<RequestTrace>();
  private readonly jobs = new Map<string, { touched: number; events: DiagnosticEvent[] }>();
  public constructor(private readonly sink: (event: DiagnosticEvent) => void = () => undefined) {}

  public request<T>(trace: RequestTrace, work: () => Promise<T>): Promise<T> {
    return this.context.run(trace, work);
  }
  public current(): RequestTrace | undefined {
    return this.context.getStore();
  }
  public bind(jobId: string): void {
    const trace = this.current();
    if (trace) trace.jobId = jobId;
  }
  public events(jobId: string): DiagnosticEvent[] {
    this.prune();
    return [...(this.jobs.get(jobId)?.events ?? [])];
  }
  private prune(): void {
    for (const [id, job] of this.jobs)
      if (job.touched < Date.now() - 60 * 60_000) this.jobs.delete(id);
    while (this.jobs.size > 200) this.jobs.delete(this.jobs.keys().next().value!);
  }
  public emit(
    stage: MappingStage,
    phase: DiagnosticEvent['phase'],
    elapsedMs = 0,
    counts?: DiagnosticCounts,
    error?: unknown,
    context?: Pick<DiagnosticEvent, 'targetKey' | 'actionType' | 'receiptStatus' | 'receiptReason'>,
  ): void {
    const trace = this.current();
    if (!trace) return;
    const event = DiagnosticEventSchema.parse({
      id: randomUUID(),
      requestId: trace.requestId,
      jobId: trace.jobId,
      layer: 'backend',
      stage,
      phase,
      at: new Date().toISOString(),
      elapsedMs: Math.max(0, Math.round(elapsedMs)),
      ...(counts ? { counts } : {}),
      ...(error !== undefined ? { code: diagnosticCode(error) } : {}),
      ...context,
    });
    if (event.jobId) {
      this.prune();
      const job = this.jobs.get(event.jobId) ?? { touched: Date.now(), events: [] };
      job.touched = Date.now();
      job.events = [...job.events.slice(-99), event];
      this.jobs.set(event.jobId, job);
    }
    try {
      this.sink(event);
    } catch {
      /* Diagnostics cannot change mapping behavior. */
    }
  }
  public async stage<T>(
    stage: MappingStage,
    work: (signal?: AbortSignal) => Promise<T>,
    counts?: DiagnosticCounts,
  ): Promise<T> {
    const trace = this.current();
    if (trace) {
      trace.signal.throwIfAborted();
      trace.stage = stage;
    }
    const start = performance.now();
    this.emit(stage, 'begin', 0, counts);
    try {
      const pending = work(trace?.signal);
      const result = await (trace ? untilAborted(pending, trace.signal) : pending);
      this.emit(stage, 'end', performance.now() - start, counts);
      return result;
    } catch (error) {
      this.emit(stage, 'error', performance.now() - start, counts, error);
      throw error;
    }
  }
}
