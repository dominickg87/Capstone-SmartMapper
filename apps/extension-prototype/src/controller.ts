import {
  ActionReceiptSchema,
  JobViewSchema,
  ObserveResponseSchema,
  PageObservationSchema,
  DiagnosticsResponseSchema,
  MappingStageSchema,
  DiagnosticCodeSchema,
  MAX_PAGE_ACTIONS,
  type MappingStage,
  type DiagnosticCode,
  type DiagnosticCounts,
  type DiagnosticEvent,
  type ActionBatch,
  type ActionReceipt,
  type JobView,
  type PageObservation,
} from '@smartmapper/contracts';
import { z } from 'zod';
import { carrierOriginAllowed } from '@smartmapper/automation-core/active-tab';
import { config } from './config.js';
import { shouldContinueAfterReceipt } from './batch-continuation.js';
import { canExecuteFreshNavigation } from './navigation-guard.js';
import { sanitizedCarrierPageUrl } from './carrier-url.js';
import { jobSession, miaToken, saveSession, type JobSession } from './session.js';
import { ProgressTracker, type MappingProgress } from './progress.js';
import { markerFromControl } from './training-overlay.js';

const JobResponse = z.object({ job: JobViewSchema });
const Started = JobResponse.extend({ token: z.string() });
const SearchResponse = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      client_name: z.string(),
      quote_number: z.string(),
      form_type: z.string(),
    }),
  ),
});
export type QuoteChoice = z.infer<typeof SearchResponse>['results'][number];
export type TestableMapping = { mappingId: string; mappingVersion: number };

const BatchExecutionResponseSchema = z
  .object({
    receipts: ActionReceiptSchema.array().max(MAX_PAGE_ACTIONS),
    stopReason: z.enum(['complete', 'cancelled', 'blocked', 'page_operation_failed']),
  })
  .strict();
const ExecutionProgressMessageSchema = z
  .object({
    type: z.literal('smartmapper-execution-progress'),
    contentVersion: z.string(),
    executionId: z.string().uuid(),
    index: z.number().int().min(1).max(MAX_PAGE_ACTIONS),
    total: z.number().int().min(1).max(MAX_PAGE_ACTIONS),
    phase: z.enum(['begin', 'end', 'error']),
    actionId: z.string().min(1).max(160),
    receipt: ActionReceiptSchema.optional(),
  })
  .strict();
const ExecutionReadyMessageSchema = z
  .object({
    type: z.literal('smartmapper-execution-ready'),
    contentVersion: z.string(),
    executionId: z.string().uuid(),
  })
  .strict();

class ApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
    public readonly code?: DiagnosticCode,
    public readonly stage?: MappingStage,
  ) {
    super(message);
  }
}

const expired = (error: unknown): boolean =>
  error instanceof ApiError && [401, 410].includes(error.status);

async function json(
  origin: string,
  path: string,
  token: string | null,
  method = 'GET',
  body?: unknown,
  options: { signal?: AbortSignal; requestId?: string; timeoutMs?: number } = {},
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(new URL(path, origin), {
      method,
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.any([
        AbortSignal.timeout(options.timeoutMs ?? (/\/observe$/.test(path) ? 30_000 : 20_000)),
        ...(options.signal ? [options.signal] : []),
      ]),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...(origin === config.backendOrigin
          ? { 'x-smartmapper-request-id': options.requestId ?? crypto.randomUUID() }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new ApiError(
        504,
        'This step timed out. Copy diagnostics, then review the page and Resume mapping.',
        'timeout',
      );
    throw error;
  }
  if (!response.ok) {
    const detail = z
      .object({
        diagnosticCode: DiagnosticCodeSchema.optional(),
        stage: MappingStageSchema.optional(),
        error: z.string().optional(),
      })
      .safeParse(await response.json().catch(() => null));
    throw new ApiError(
      response.status,
      response.status === 504
        ? 'The mapping service timed out on this step. Copy diagnostics, then review the page and Resume mapping.'
        : response.status === 401
          ? 'Your connection expired. Reconnect to M.I.A. and start again.'
          : response.status === 410
            ? 'This mapping session expired. Select a quote and start again.'
            : response.status === 403
              ? 'This demo account or page is not enabled for SmartMapper.'
              : response.status === 409
                ? detail.success && detail.data.error === 'mapping_not_trained'
                  ? 'No active mapping is available for this carrier and quote type. Open Train → Find saved training and mappings, open the saved version, and choose Test this mapping.'
                  : detail.success && detail.data.error === 'mapping_workflow_ambiguous'
                    ? 'More than one mapping matches this workflow. Open the exact saved version in Train and choose Test this mapping.'
                    : 'The page or job changed. Review it, then Resume mapping.'
                : response.status === 422
                  ? 'This quote cannot be mapped. Select a supported Home or Auto quote.'
                  : 'Mapping paused. Check the service connection and try Resume mapping.',
      detail.success ? detail.data.diagnosticCode : undefined,
      detail.success ? detail.data.stage : undefined,
    );
  }
  return (await response.json()) as unknown;
}

async function boundTab(
  session?: JobSession,
): Promise<chrome.tabs.Tab & { id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activatedId = new URLSearchParams(location.search).get('tabId');
  if (activatedId && tab?.id !== Number(activatedId))
    throw new Error('Return to the carrier tab where you opened SmartMapper, then Resume mapping.');
  if (tab?.id === undefined || !tab.url)
    throw new Error(
      'Open your carrier quote tab and click the SmartMapper toolbar icon, then try again.',
    );
  if (
    !carrierOriginAllowed(
      new URL(tab.url).origin,
      new Set(config.carrierOrigins),
      config.allowAnyCarrier,
    )
  )
    throw new Error(
      config.allowAnyCarrier
        ? 'Open an HTTPS carrier quote page, then click the SmartMapper toolbar icon.'
        : 'This website is not configured for SmartMapper.',
    );
  if (
    session &&
    (tab.id !== session.job.binding.tabId ||
      tab.windowId !== session.windowId ||
      new URL(tab.url).origin !== session.job.binding.carrierOrigin)
  )
    throw new Error('Return to the original quote tab, review it, then Resume mapping.');
  return { ...tab, id: tab.id, url: tab.url };
}

type PageProgress = <T>(
  stage: MappingStage,
  work: () => Promise<T>,
  counts?: DiagnosticCounts,
) => Promise<T>;
async function observePage(
  session: JobSession,
  halted = () => false,
  progress: PageProgress = (_stage, work) => work(),
): Promise<PageObservation> {
  const tab = await boundTab(session);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    files: ['content.js'],
  });
  try {
    if (halted()) throw new Error('Mapping paused.');
    const initial = PageObservationSchema.parse(
      await progress('discover', () =>
        chrome.tabs.sendMessage(tab.id, { type: 'prepare-survey', tabId: tab.id }),
      ),
    );
    if (initial.authenticationRequired)
      throw new Error('Complete sign-in or verification yourself, then Resume mapping.');
    if (halted()) throw new Error('Mapping paused.');
    const page = PageObservationSchema.parse(
      await chrome.tabs.sendMessage(tab.id, {
        type: 'finish-survey',
        tabId: tab.id,
        complete: true,
        targeted: false,
      }),
    );
    await boundTab(session);
    return page;
  } finally {
    await chrome.tabs.sendMessage(tab.id, { type: 'clear-markers' }).catch(() => undefined);
  }
}

async function waitForNextPage(
  session: JobSession,
  previous: PageObservation,
  halted: () => boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (halted()) throw new Error('Mapping paused.');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const tab = await boundTab(session);
    if (tab.status === 'loading') continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        files: ['content.js'],
      });
      const next = PageObservationSchema.parse(
        await chrome.tabs.sendMessage(tab.id, { type: 'observe', tabId: tab.id }),
      );
      await chrome.tabs.sendMessage(tab.id, { type: 'clear-markers' });
      if (
        next.documentId !== previous.documentId ||
        next.routeId !== previous.routeId ||
        next.fingerprint !== previous.fingerprint
      )
        return;
    } catch {
      /* A navigation can replace the document between these operations. */
    }
  }
  throw new Error(
    'Next/Continue did not open a new page. Review the carrier response, then Resume mapping.',
  );
}

async function executeEntry(
  session: JobSession,
  batch: ActionBatch,
  page: PageObservation,
  halted: () => boolean,
): Promise<ActionReceipt> {
  const tab = await boundTab(session);
  try {
    return ActionReceiptSchema.parse(
      await chrome.tabs.sendMessage(tab.id, { type: 'execute', batch }),
    );
  } catch (error) {
    return recoverInterruptedEntry(session, batch, page, halted, error);
  }
}

async function recoverInterruptedEntry(
  session: JobSession,
  batch: ActionBatch,
  page: PageObservation,
  halted: () => boolean,
  originalError: unknown,
): Promise<ActionReceipt> {
  // A normal answer-triggered postback can destroy the reply channel before read-back.
  // Never claim that entry succeeded. Reinspect the same route and verify its saved value.
  if (!page.capture || !['fill', 'select', 'check'].includes(batch.action.type))
    throw originalError;
  const tab = await boundTab(session);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (halted()) throw originalError;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const current = await boundTab(session);
    if (current.status === 'loading') continue;
    let next: PageObservation;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        files: ['content.js'],
      });
      next = PageObservationSchema.parse(
        await chrome.tabs.sendMessage(tab.id, { type: 'observe', tabId: tab.id }),
      );
      await chrome.tabs.sendMessage(tab.id, { type: 'clear-markers' });
    } catch {
      continue;
    }
    if (
      next.documentId !== page.documentId &&
      next.routeId === page.routeId &&
      !next.authenticationRequired
    )
      return {
        actionId: batch.action.actionId,
        status: 'blocked',
        reason: 'page_changed',
        observedHash: null,
      };
    throw originalError;
  }
  throw originalError;
}

export class ExtensionExecutor {
  private halted = true;
  private busy = false;
  private activeRequest: AbortController | undefined;
  private activeContentExecution:
    { tabId: number; executionId: string; port: chrome.runtime.Port } | undefined;
  private readonly progress: ProgressTracker;
  public constructor(
    private readonly update: (job: JobView | null, message: string) => void,
    progress: (state: MappingProgress) => void = () => undefined,
  ) {
    this.progress = new ProgressTracker(progress);
  }

  private cancelContentExecution(): void {
    const active = this.activeContentExecution;
    if (!active) return;
    void chrome.tabs
      .sendMessage(active.tabId, {
        type: 'cancel-execution',
        executionId: active.executionId,
      })
      .catch(() => undefined);
    active.port.disconnect();
  }

  private async executeEntryBatch(
    session: JobSession,
    batches: ActionBatch[],
    page: PageObservation,
    offset: number,
    total: number,
  ): Promise<{
    receipts: ActionReceipt[];
    stopReason: 'complete' | 'cancelled' | 'blocked' | 'page_operation_failed';
    session: JobSession;
  }> {
    const tab = await boundTab(session);
    const executionId = crypto.randomUUID();
    const receipts = new Map<string, ActionReceipt>();
    let latestSession = session;
    let receiptError: unknown;
    let currentIndex = 1;
    let filling: DiagnosticEvent | undefined = this.progress.begin(
      'fill',
      session.job.jobId,
      undefined,
      { batchIndex: offset + 1, batchSize: total },
    );
    this.update(session.job, `Filling page: field ${offset + 1} of ${total}\u2026`);
    const recordReceipt = async (
      batch: ActionBatch,
      receipt: ActionReceipt,
      index: number,
    ): Promise<boolean> => {
      const checking = this.progress.begin('read_back', latestSession.job.jobId, undefined, {
        batchIndex: offset + index,
        batchSize: total,
      });
      try {
        const result = JobResponse.parse(
          await json(
            config.backendOrigin,
            '/v2/jobs/' + latestSession.job.jobId + '/receipts',
            latestSession.token,
            'POST',
            {
              revision: latestSession.job.revision,
              batchId: batch.batchId,
              receipt,
            },
            { requestId: checking.requestId },
          ),
        );
        if (this.halted) return false;
        this.progress.finish(checking);
        latestSession = { ...latestSession, job: result.job };
        receipts.set(receipt.actionId, receipt);
        await saveSession(latestSession);
        this.update(this.display(latestSession.job, page), this.statusMessage(latestSession.job));
        await this.showReviewMarkers(latestSession, page);
        return shouldContinueAfterReceipt(receipt, latestSession.job.status, this.halted);
      } catch (error) {
        receiptError = error;
        if (!this.halted) this.progress.finish(checking, error);
        return false;
      }
    };
    const port = chrome.tabs.connect(tab.id, {
      frameId: 0,
      name: 'smartmapper-execution:' + executionId,
    });
    let readySettled = false;
    let settleReady: (ready: boolean) => void = () => undefined;
    const ready = new Promise<boolean>((resolve) => {
      settleReady = (value) => {
        if (readySettled) return;
        readySettled = true;
        resolve(value);
      };
    });
    const readyTimer = setTimeout(() => settleReady(false), 2000);
    const acknowledge = (index: number, actionId: string, continueExecution: boolean): void => {
      try {
        port.postMessage({
          type: 'smartmapper-execution-ack',
          executionId,
          index,
          actionId,
          continue: continueExecution,
        });
      } catch {
        /* A closed panel cancels the content-side queue. */
      }
    };
    const listener = (input: unknown): void => {
      const readyMessage = ExecutionReadyMessageSchema.safeParse(input);
      if (
        readyMessage.success &&
        readyMessage.data.executionId === executionId &&
        readyMessage.data.contentVersion === chrome.runtime.getManifest().version
      ) {
        settleReady(true);
        return;
      }
      const parsed = ExecutionProgressMessageSchema.safeParse(input);
      if (
        !parsed.success ||
        parsed.data.contentVersion !== chrome.runtime.getManifest().version ||
        parsed.data.executionId !== executionId ||
        parsed.data.total !== batches.length
      )
        return;
      const batch = batches[parsed.data.index - 1];
      if (!batch || batch.action.actionId !== parsed.data.actionId) return;
      if (parsed.data.phase === 'begin') {
        if (parsed.data.index !== currentIndex) {
          if (filling) this.progress.finish(filling);
          currentIndex = parsed.data.index;
          filling = this.progress.begin('fill', session.job.jobId, undefined, {
            batchIndex: offset + currentIndex,
            batchSize: total,
          });
        }
        this.update(
          latestSession.job,
          `Filling page: field ${offset + parsed.data.index} of ${total}\u2026`,
        );
        acknowledge(parsed.data.index, parsed.data.actionId, !this.halted);
      } else if (parsed.data.phase === 'end' && parsed.data.receipt) {
        if (filling) this.progress.finish(filling);
        filling = undefined;
        void recordReceipt(batch, parsed.data.receipt, parsed.data.index)
          .then((continueExecution) =>
            acknowledge(parsed.data.index, parsed.data.actionId, continueExecution),
          )
          .catch(() => acknowledge(parsed.data.index, parsed.data.actionId, false));
      } else if (parsed.data.phase === 'error') {
        if (filling)
          this.progress.finish(
            filling,
            new Error('The carrier page could not complete this field operation.'),
          );
        filling = undefined;
        acknowledge(parsed.data.index, parsed.data.actionId, false);
      } else {
        acknowledge(parsed.data.index, parsed.data.actionId, false);
      }
    };
    const disconnected = (): void => settleReady(false);
    port.onMessage.addListener(listener);
    port.onDisconnect.addListener(disconnected);
    let result: z.infer<typeof BatchExecutionResponseSchema> | undefined;
    let sendError: unknown;
    try {
      if (!(await ready)) throw new Error('The carrier page execution channel did not open.');
      this.activeContentExecution = { tabId: tab.id, executionId, port };
      result = BatchExecutionResponseSchema.parse(
        await chrome.tabs.sendMessage(tab.id, {
          type: 'execute-batch',
          executionId,
          batches,
        }),
      );
    } catch (error) {
      sendError = error;
    } finally {
      clearTimeout(readyTimer);
      port.onMessage.removeListener(listener);
      port.onDisconnect.removeListener(disconnected);
      try {
        port.disconnect();
      } catch {
        /* The content document may already have closed the port. */
      }
      if (this.activeContentExecution?.executionId === executionId)
        this.activeContentExecution = undefined;
    }

    let stopReason = result?.stopReason ?? (this.halted ? 'cancelled' : 'page_operation_failed');
    if (receiptError && !this.halted) stopReason = 'page_operation_failed';
    if (sendError && !this.halted) {
      const interrupted = batches[currentIndex - 1];
      if (interrupted && !receipts.has(interrupted.action.actionId)) {
        try {
          const receipt = await recoverInterruptedEntry(
            session,
            interrupted,
            page,
            () => this.halted,
            sendError,
          );
          const recorded = await recordReceipt(interrupted, receipt, currentIndex);
          if (!recorded && receipt.status !== 'blocked') stopReason = 'page_operation_failed';
          stopReason = receipt.status === 'blocked' ? 'blocked' : stopReason;
        } catch {
          stopReason = 'page_operation_failed';
        }
      }
    }
    if (filling) {
      if (stopReason === 'page_operation_failed')
        this.progress.finish(
          filling,
          new Error('The carrier page could not complete this field operation.'),
        );
      else this.progress.finish(filling);
    }
    return {
      receipts: batches.flatMap((batch) => {
        const receipt = receipts.get(batch.action.actionId);
        return receipt ? [receipt] : [];
      }),
      stopReason,
      session: latestSession,
    };
  }

  public diagnostics(): string {
    return this.progress.report();
  }
  public reportFailure(error: unknown): void {
    this.progress.fail(error);
  }
  public async diagnosticReport(): Promise<string> {
    try {
      const health = z
        .object({ buildVersion: z.string().regex(/^\d+\.\d+\.\d+$/) })
        .parse(
          await json(config.backendOrigin, '/health', null, 'GET', undefined, { timeoutMs: 5000 }),
        );
      this.progress.merge([], undefined, health.buildVersion);
    } catch {
      /* Preserve local diagnostics even if the backend cannot be reached. */
    }
    const session = await jobSession();
    if (session) {
      try {
        const result = DiagnosticsResponseSchema.parse(
          await json(
            config.backendOrigin,
            '/v2/jobs/' + session.job.jobId + '/diagnostics',
            session.token,
            'GET',
            undefined,
            { timeoutMs: 5000 },
          ),
        );
        this.progress.merge(result.events, undefined, result.buildVersion);
      } catch {
        /* Local events are still useful when the service cannot be reached. */
      }
    }
    return this.progress.report();
  }

  private async showReviewMarkers(session: JobSession, page: PageObservation): Promise<void> {
    const tab = await boundTab(session);
    const markers = session.job.reviews.flatMap((review, index) => {
      if (!review.elementId) return [];
      const control = page.controls.find((item) => item.elementId === review.elementId);
      if (!control) return [];
      return [
        markerFromControl(
          review.elementId,
          index + 1,
          control,
          review.reason === 'human_only' || review.reason === 'human_required'
            ? 'human'
            : 'missing',
        ),
      ];
    });
    await chrome.tabs
      .sendMessage(tab.id, { type: 'show-training-overlay', markers })
      .catch(() => undefined);
  }

  public async focusReview(elementId: string): Promise<void> {
    const session = await jobSession();
    if (!session) return;
    const tab = await boundTab(session);
    await chrome.tabs
      .sendMessage(tab.id, { type: 'focus-training-field', fieldId: elementId })
      .catch(() => undefined);
  }

  private async jobRequest(session: JobSession, body: unknown): Promise<unknown> {
    const started = this.progress.begin('request', session.job.jobId);
    const controller = new AbortController();
    const polling = new AbortController();
    this.activeRequest = controller;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const result = DiagnosticsResponseSchema.parse(
          await json(
            config.backendOrigin,
            '/v2/jobs/' + session.job.jobId + '/diagnostics',
            session.token,
            'GET',
            undefined,
            { signal: polling.signal, timeoutMs: 5000 },
          ),
        );
        if (!done && !controller.signal.aborted)
          this.progress.merge(result.events, started.requestId, result.buildVersion);
      } catch {
        /* The main request reports failures; missed progress polls never stop mapping. */
      }
      if (!done)
        timer = setTimeout(() => {
          void poll();
        }, 2000);
    };
    timer = setTimeout(() => {
      void poll();
    }, 100);
    try {
      const result = await json(
        config.backendOrigin,
        '/v2/jobs/' + session.job.jobId + '/observe',
        session.token,
        'POST',
        body,
        { requestId: started.requestId, signal: controller.signal },
      );
      if (!controller.signal.aborted) this.progress.finish(started);
      return result;
    } catch (error) {
      if (!controller.signal.aborted)
        this.progress.finish(
          error instanceof ApiError && error.stage ? { ...started, stage: error.stage } : started,
          error,
        );
      throw error;
    } finally {
      done = true;
      clearTimeout(timer);
      polling.abort();
      if (this.activeRequest === controller) this.activeRequest = undefined;
    }
  }

  public async search(query: string): Promise<QuoteChoice[]> {
    const token = await miaToken();
    if (!token) throw new Error('Connect to M.I.A. first.');
    return SearchResponse.parse(
      await json(
        config.miaOrigin,
        '/api/extension/quotes/search?query=' + encodeURIComponent(query),
        token,
      ),
    ).results;
  }

  public async restore(): Promise<void> {
    const session = await jobSession();
    if (!session) return;
    this.update(session.job, 'Checking your saved mapping session…');
    try {
      const result = JobResponse.parse(
        await json(config.backendOrigin, '/v2/jobs/' + session.job.jobId, session.token),
      );
      await saveSession({ ...session, job: result.job });
      this.update(result.job, 'Review the current page, then Resume mapping.');
    } catch (error) {
      if (expired(error)) await this.clearExpired();
      else throw error;
    }
  }

  public async start(quoteId: string, mappingSelection?: TestableMapping): Promise<void> {
    if (await jobSession())
      throw new Error('Cancel the current job before selecting another quote.');
    const token = await miaToken();
    if (!token) throw new Error('Connect to M.I.A. first.');
    const tab = await boundTab();
    this.progress.reset();
    const authorizing = this.progress.begin('authorize', null);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    const challengeBytes = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    );
    const challenge = btoa(String.fromCharCode(...challengeBytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    const carrierOrigin = new URL(tab.url).origin;
    const carrierPageUrl = sanitizedCarrierPageUrl(tab.url);
    const { code } = z.object({ code: z.string() }).parse(
      await json(
        config.miaOrigin,
        '/api/extension/smartmapper/v2/quotes/' + encodeURIComponent(quoteId) + '/grants',
        token,
        'POST',
        {
          challenge,
          carrierOrigin,
          tabId: tab.id,
        },
      ),
    );
    const result = Started.parse(
      await json(
        config.backendOrigin,
        '/v2/jobs',
        null,
        'POST',
        {
          miaOrigin: config.miaOrigin,
          code,
          verifier,
          carrierOrigin,
          carrierPageUrl,
          tabId: tab.id,
          ...(mappingSelection
            ? { mappingSelection: { mode: 'testable', ...mappingSelection } }
            : {}),
        },
        { requestId: authorizing.requestId },
      ),
    );
    await saveSession({
      ...result,
      windowId: tab.windowId,
      ...(mappingSelection
        ? { mappingSelection: { mode: 'testable' as const, ...mappingSelection } }
        : {}),
    });
    this.progress.finish(authorizing);
    this.update(result.job, 'Mapping this page…');
    await this.run(false);
  }

  public async pause(): Promise<void> {
    this.halted = true;
    this.activeRequest?.abort();
    this.cancelContentExecution();
    this.progress.stop();
    const session = await jobSession();
    if (!session) return;
    const result = JobResponse.parse(
      await json(
        config.backendOrigin,
        '/v2/jobs/' + session.job.jobId + '/pause',
        session.token,
        'POST',
        {},
      ),
    );
    await saveSession({ ...session, job: result.job });
    this.update(result.job, 'Paused. Review the page, then Resume mapping.');
  }

  public async cancel(): Promise<void> {
    this.halted = true;
    this.activeRequest?.abort();
    this.cancelContentExecution();
    this.progress.stop();
    const session = await jobSession();
    if (session) {
      try {
        await json(config.backendOrigin, '/v2/jobs/' + session.job.jobId, session.token, 'DELETE');
      } catch (error) {
        if (!expired(error)) throw error;
      }
      const tab = await boundTab(session).catch(() => null);
      if (tab)
        await chrome.tabs
          .sendMessage(tab.id, { type: 'clear-training-overlay' })
          .catch(() => undefined);
    }
    await chrome.storage.session.remove('job');
    this.update(null, 'Mapping cancelled.');
  }

  public halt(): void {
    this.halted = true;
    this.activeRequest?.abort();
    this.cancelContentExecution();
    this.progress.stop();
  }

  public async run(resume = true, skipElementId?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.halted = false;
    try {
      const storedSession = await jobSession();
      if (!storedSession) throw new Error('Select a quote to start mapping.');
      let session: JobSession = storedSession;
      let first = true;
      while (!this.halted) {
        this.update(session.job, 'Reading this page and opening its sections…');
        const observing = session;
        const page = await this.progress.step(
          first ? 'discover' : 'review',
          session.job.jobId,
          () =>
            observePage(
              observing,
              () => this.halted,
              (stage, work, counts) => this.progress.step(stage, observing.job.jobId, work, counts),
            ),
        );
        if (this.halted) break;
        this.update(session.job, 'Matching this page to the trained carrier workflow…');
        const response = ObserveResponseSchema.parse(
          await this.jobRequest(session, {
            revision: session.job.revision,
            resume: first && resume,
            ...(first && skipElementId ? { skipElementId } : {}),
            observation: page,
          }),
        );
        first = false;
        if (this.halted) break;
        session = { ...session, job: response.job };
        await saveSession(session);
        this.update(this.display(session.job, page), this.statusMessage(session.job));
        await this.showReviewMarkers(session, page);
        if (!response.batch) break;
        const batches = [response.batch, ...(response.followingBatches ?? [])];
        const entryBatches = batches.filter((batch) => batch.action.type !== 'next_page');
        const entryExecution = entryBatches.length
          ? await this.executeEntryBatch(session, entryBatches, page, 0, batches.length)
          : undefined;
        if (entryExecution) session = entryExecution.session;
        if (this.halted) break;
        if (entryExecution?.stopReason === 'page_operation_failed')
          throw new Error(
            'The carrier page stopped responding while fields were being filled. Review the page, then Resume mapping.',
          );
        if (entryExecution && entryExecution.stopReason !== 'complete') {
          if (session.job.status === 'running') continue;
          break;
        }
        if (entryExecution) {
          // Discard every navigation action planned before field read-back. A complete entry batch
          // still requires a new whole-page observation and a fresh server-approved Next action.
          if (['executing', 'running'].includes(session.job.status)) continue;
          break;
        }
        if (!canExecuteFreshNavigation(batches, null, session.job)) break;
        for (const [index, batch] of batches.entries()) {
          if (this.halted) break;
          if (batch.action.type !== 'next_page') continue;
          const filling = this.progress.begin('navigate', session.job.jobId, undefined, {
            batchIndex: index + 1,
            batchSize: batches.length,
          });
          this.update(session.job, 'Page reviewed. Moving to the next page…');
          const receipt = await executeEntry(session, batch, page, () => this.halted);
          if (!this.halted) this.progress.finish(filling);
          const checking = this.progress.begin('read_back', session.job.jobId, undefined, {
            batchIndex: index + 1,
            batchSize: batches.length,
          });
          const result = JobResponse.parse(
            await json(
              config.backendOrigin,
              '/v2/jobs/' + session.job.jobId + '/receipts',
              session.token,
              'POST',
              { revision: session.job.revision, batchId: batch.batchId, receipt },
              { requestId: checking.requestId },
            ),
          );
          if (this.halted) break;
          this.progress.finish(checking);
          session = { ...session, job: result.job };
          await saveSession(session);
          this.update(this.display(session.job, page), this.statusMessage(session.job));
          if (batch.action.type === 'next_page' && receipt.status === 'executed') {
            const navigating = session;
            await this.progress.step('navigate', session.job.jobId, () =>
              waitForNextPage(navigating, page, () => this.halted),
            );
          }
          if (receipt.status === 'blocked') break;
        }
        if (session.job.status !== 'running') break;
      }
    } catch (error) {
      if (this.halted) return;
      if (expired(error)) await this.clearExpired();
      else await this.pause().catch(() => undefined);
      this.progress.fail(error);
      throw error;
    } finally {
      this.busy = false;
      this.halted = true;
      this.progress.stop();
    }
  }

  private async clearExpired(): Promise<void> {
    this.halted = true;
    await chrome.storage.session.remove('job');
    this.update(null, 'This mapping session ended. Select a quote to start again.');
  }

  private statusMessage(job: JobView): string {
    if (job.status === 'page_complete')
      return "I'm out of things to do on this page. Please review the result. If you move to another section, press Resume mapping.";
    if (job.status === 'human_input')
      return 'Please review the fields below. Make any corrections, then Resume mapping.';
    if (job.status === 'paused' || job.status === 'blocked')
      return 'Mapping paused. Review this page before resuming.';
    return 'Mapping this page…';
  }

  private display(job: JobView, page: PageObservation): JobView {
    return {
      ...job,
      reviews: job.reviews.map((review) => {
        const control = page.controls.find((item) => item.elementId === review.elementId);
        return control
          ? { ...review, question: control.label || review.question, entity: control.section }
          : review;
      }),
    };
  }
}
