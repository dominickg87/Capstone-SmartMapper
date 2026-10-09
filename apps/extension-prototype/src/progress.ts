import {
  DiagnosticEventSchema,
  DiagnosticApiReasonSchema,
  type ActionReceipt,
  type AutomationActionV2,
  diagnosticCode,
  type DiagnosticCounts,
  type DiagnosticEvent,
  type MappingStage,
} from '@smartmapper/contracts';

export const stageLabels: Record<MappingStage, string> = {
  authorize: 'Connecting your selected M.I.A. quote',
  discover: 'Discovering fields and expanding page sections',
  capture: 'Reading complete page structure',
  source: 'Checking the latest M.I.A. data',
  plan: 'Matching fields to the trained workflow',
  verify: 'Validating trained mappings',
  fill: 'Filling fields on the page',
  read_back: 'Checking what the carrier page saved',
  review: 'Reviewing the page for remaining fields',
  navigate: 'Opening the next page',
  pause: 'Pausing mapping',
  request: 'Waiting for the mapping service',
};
export interface MappingProgress {
  current: DiagnosticEvent | null;
  active: boolean;
  failure: DiagnosticEvent | null;
  events: DiagnosticEvent[];
}
export const emptyProgress: MappingProgress = {
  current: null,
  active: false,
  failure: null,
  events: [],
};

export class ProgressTracker {
  private state: MappingProgress = { ...emptyProgress, events: [] };
  private generation = 0;
  private backendVersion: string | undefined;
  public constructor(private readonly update: (state: MappingProgress) => void) {}
  public reset(): void {
    this.generation++;
    this.state = { ...emptyProgress, events: [] };
    this.publish();
  }
  public stop(): void {
    this.generation++;
    this.state = { ...this.state, active: false };
    this.publish();
  }
  public begin(
    stage: MappingStage,
    jobId: string | null,
    requestId = crypto.randomUUID(),
    counts?: DiagnosticCounts,
  ): DiagnosticEvent {
    const event = DiagnosticEventSchema.parse({
      id: crypto.randomUUID(),
      requestId,
      jobId,
      layer: 'extension',
      stage,
      phase: 'begin',
      at: new Date().toISOString(),
      elapsedMs: 0,
      ...(counts ? { counts } : {}),
    });
    this.state.failure = null;
    this.add(event, true);
    return event;
  }
  public finish(start: DiagnosticEvent, error?: unknown): void {
    if (
      error !== undefined &&
      start.stage === 'request' &&
      this.state.current?.requestId === start.requestId &&
      this.state.current.stage !== 'request'
    )
      start = this.state.current;
    const detail =
      error && typeof error === 'object' && 'apiReason' in error ? error.apiReason : undefined;
    const reason = DiagnosticApiReasonSchema.safeParse(detail);
    const event: DiagnosticEvent = {
      ...start,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      elapsedMs: Math.max(0, Date.now() - Date.parse(start.at)),
      phase: error === undefined ? 'end' : 'error',
      ...(reason.success ? { apiReason: reason.data } : {}),
      ...(error === undefined ? {} : { code: diagnosticCode(error) }),
    };
    const existingFailure = this.state.failure;
    this.add(event, error === undefined);
    if (existingFailure && error !== undefined) {
      this.state.failure = existingFailure;
      this.publish();
    }
  }
  public receipt(
    jobId: string,
    actionType: AutomationActionV2['type'],
    receipt: ActionReceipt,
    targetKey?: string,
  ): void {
    this.add(
      DiagnosticEventSchema.parse({
        id: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        jobId,
        layer: 'extension',
        stage: 'read_back',
        phase: 'info',
        at: new Date().toISOString(),
        elapsedMs: 0,
        actionType,
        receiptStatus: receipt.status,
        receiptReason: receipt.reason,
        ...(/^[a-f0-9]{64}$/.test(targetKey ?? '') ? { targetKey } : {}),
      }),
      false,
    );
  }
  public async step<T>(
    stage: MappingStage,
    jobId: string | null,
    work: () => Promise<T>,
    counts?: DiagnosticCounts,
  ): Promise<T> {
    const start = this.begin(stage, jobId, undefined, counts);
    const generation = this.generation;
    try {
      const result = await work();
      if (generation === this.generation) this.finish(start);
      return result;
    } catch (error) {
      if (generation === this.generation) this.finish(start, error);
      throw error;
    }
  }
  public merge(events: DiagnosticEvent[], activeRequestId?: string, buildVersion?: string): void {
    if (buildVersion && /^\d+\.\d+\.\d+$/.test(buildVersion)) this.backendVersion = buildVersion;
    const known = new Set(this.state.events.map((event) => event.id));
    for (const input of events) {
      const event = DiagnosticEventSchema.parse(input);
      if (known.has(event.id)) continue;
      this.state.events = [...this.state.events.slice(-149), event];
      if (event.requestId === activeRequestId && event.stage !== 'request') {
        this.state.current = event;
        if (event.phase === 'error') this.state.failure = event;
        // A finished server stage means the request is advancing, not that mapping is done.
        this.state.active = event.phase !== 'error';
      }
    }
    this.state.events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    this.publish();
  }
  public fail(error: unknown): void {
    if (this.state.failure) {
      this.stop();
      return;
    }
    const current = this.state.failure ?? this.state.current;
    if (current) this.finish(current, error);
    this.state.active = false;
    this.publish();
  }
  public report(): string {
    return JSON.stringify(
      {
        extensionVersion: chrome.runtime.getManifest().version,
        backendVersion: this.backendVersion ?? 'unavailable',
        exportedAt: new Date().toISOString(),
        events: this.state.events.map((event) => DiagnosticEventSchema.parse(event)),
      },
      null,
      2,
    );
  }
  private add(event: DiagnosticEvent, active: boolean): void {
    this.state = {
      ...this.state,
      current: event,
      active,
      events: [...this.state.events.slice(-149), event],
      ...(event.phase === 'error' ? { failure: event } : {}),
    };
    console.info('smartmapper.stage', event);
    this.publish();
  }
  private publish(): void {
    this.update({ ...this.state, events: [...this.state.events] });
  }
}
