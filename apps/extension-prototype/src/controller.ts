import {
  ActionReceiptSchema,
  JobViewSchema,
  ObserveResponseSchema,
  PageObservationSchema,
  MappingChatMessageSchema,
  MappingChatResponseSchema,
  MAX_PAGE_IMAGES,
  MAX_SURVEY_BYTES,
  type ActionBatch,
  type ActionReceipt,
  type JobView,
  type PageObservation,
} from '@smartmapper/contracts';
import { z } from 'zod';
import { carrierOriginAllowed } from '@smartmapper/automation-core/active-tab';
import { config } from './config.js';
import { jobSession, miaToken, saveSession, type JobSession } from './session.js';

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

class ApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
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
): Promise<unknown> {
  const response = await fetch(new URL(path, origin), {
    method,
    redirect: 'error',
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(180_000),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new ApiError(
      response.status,
      response.status === 401
        ? 'Your connection expired. Reconnect to M.I.A. and start again.'
        : response.status === 410
          ? 'This mapping session expired. Select a quote and start again.'
          : response.status === 403
            ? 'This demo account or page is not enabled for SmartMapper.'
            : response.status === 409
              ? 'The page or job changed. Review it, then Resume mapping.'
              : response.status === 422
                ? 'This quote cannot be mapped. Select a supported Home or Auto quote.'
                : 'Mapping paused. Check the service connection and try Resume mapping.',
    );
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

let lastCaptureAt = 0;
const surveyContents = (page: PageObservation): string =>
  JSON.stringify({
    document: page.documentId,
    route: page.routeId,
    text: page.textFingerprint,
    controls: page.controls.map(({ rect: _rect, ...control }) => control),
    errors: page.errors,
    width: page.scroll?.width,
    height: page.scroll?.height,
    viewport: page.viewport,
  });

async function observePage(session: JobSession, halted = () => false): Promise<PageObservation> {
  const tab = await boundTab(session);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    files: ['content.js'],
  });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (halted()) throw new Error('Mapping paused.');
      const initial = PageObservationSchema.parse(
        await chrome.tabs.sendMessage(tab.id, { type: 'prepare-survey', tabId: tab.id }),
      );
      if (initial.authenticationRequired)
        throw new Error('Complete sign-in or verification yourself, then Resume mapping.');
      if (!initial.viewport || !initial.scroll)
        throw new Error('Reload SmartMapper to inspect this page.');
      const images: NonNullable<PageObservation['images']> = [];
      const positions = (total: number, viewport: number): number[] => {
        const result = [0];
        while (result[result.length - 1]! + viewport < total && result.length <= MAX_PAGE_IMAGES)
          result.push(Math.min(total - viewport, result[result.length - 1]! + viewport * 0.8));
        return result;
      };
      const xs = positions(initial.scroll.width, initial.viewport.width);
      const ys = positions(initial.scroll.height, initial.viewport.height);
      const targeted = config.sourceFormat === 'pdf';
      const targets = initial.controls.filter(
        (control) =>
          !control.disabled &&
          !control.humanOnly &&
          (!control.label.trim() || control.tag === 'custom'),
      );
      const surveyPositions = ys
        .flatMap((y) => xs.map((x) => ({ x, y })))
        .filter(
          ({ x, y }) =>
            !targeted ||
            (x === 0 && y === 0) ||
            targets.some(
              (control) =>
                control.rect.x >= x &&
                control.rect.y >= y &&
                control.rect.x + control.rect.width <= x + initial.viewport!.width &&
                control.rect.y + control.rect.height <= y + initial.viewport!.height,
            ),
        );
      let changed = false;
      let bytes = 0;
      for (const { x, y } of surveyPositions) {
        if (images.length >= MAX_PAGE_IMAGES || bytes >= MAX_SURVEY_BYTES) break;
        if (halted()) throw new Error('Mapping paused.');
        await boundTab(session);
        const current = PageObservationSchema.parse(
          await chrome.tabs.sendMessage(tab.id, { type: 'survey-position', tabId: tab.id, x, y }),
        );
        if (surveyContents(current) !== surveyContents(initial)) {
          changed = true;
          break;
        }
        // Chrome permits at most two visible-tab captures per second.
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, 550 - (Date.now() - lastCaptureAt))),
        );
        if (halted()) throw new Error('Mapping paused.');
        await boundTab(session);
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: 'jpeg',
          quality: 70,
        });
        lastCaptureAt = Date.now();
        await boundTab(session);
        bytes += screenshot.length;
        if (bytes >= MAX_SURVEY_BYTES) break;
        images.push({
          screenshot,
          x: current.scroll!.x,
          y: current.scroll!.y,
          width: current.viewport!.width,
          height: current.viewport!.height,
        });
        if (changed || images.length >= MAX_PAGE_IMAGES || bytes >= MAX_SURVEY_BYTES) break;
      }
      const page = PageObservationSchema.parse(
        await chrome.tabs.sendMessage(tab.id, {
          type: 'finish-survey',
          tabId: tab.id,
          complete:
            !changed &&
            images.length === surveyPositions.length &&
            (!targeted ||
              targets.every((control) =>
                images.some(
                  (image) =>
                    control.rect.x >= image.x &&
                    control.rect.y >= image.y &&
                    control.rect.x + control.rect.width <= image.x + image.width &&
                    control.rect.y + control.rect.height <= image.y + image.height,
                ),
              )),
          targeted,
        }),
      );
      if (changed || page.fingerprint !== initial.fingerprint) continue;
      if (!images.length)
        throw new Error('The page could not be captured. Review it, then Resume mapping.');
      page.images = images;
      page.screenshot = images[0]!.screenshot;
      await boundTab(session);
      return PageObservationSchema.parse(page);
    }
    throw new Error(
      'The page changed while it was being inspected. Let it finish loading, then Resume mapping.',
    );
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
    // A normal answer-triggered postback can destroy the reply channel before read-back.
    // Never claim that entry succeeded. Reinspect the same route and verify its saved value.
    if (!page.capture || !['fill', 'select', 'check'].includes(batch.action.type)) throw error;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (halted()) throw error;
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
      throw error;
    }
    throw error;
  }
}

export class ExtensionExecutor {
  private halted = true;
  private busy = false;
  private chatting = false;
  private interaction = 0;
  public constructor(private readonly update: (job: JobView | null, message: string) => void) {}

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

  public async start(quoteId: string): Promise<void> {
    if (await jobSession())
      throw new Error('Cancel the current job before selecting another quote.');
    const token = await miaToken();
    if (!token) throw new Error('Connect to M.I.A. first.');
    const tab = await boundTab();
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
          ...(config.sourceFormat === 'pdf' ? { sourceFormat: 'pdf' } : {}),
        },
      ),
    );
    const result = Started.parse(
      await json(config.backendOrigin, '/v2/jobs', null, 'POST', {
        miaOrigin: config.miaOrigin,
        code,
        verifier,
        carrierOrigin,
        tabId: tab.id,
        ...(config.sourceFormat === 'pdf' ? { sourceFormat: 'pdf' } : {}),
      }),
    );
    await saveSession({ ...result, windowId: tab.windowId });
    this.update(result.job, 'Mapping this page…');
    await this.run(false);
  }

  public async pause(): Promise<void> {
    this.interaction += 1;
    this.halted = true;
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
    this.interaction += 1;
    this.halted = true;
    const session = await jobSession();
    if (session) {
      try {
        await json(config.backendOrigin, '/v2/jobs/' + session.job.jobId, session.token, 'DELETE');
      } catch (error) {
        if (!expired(error)) throw error;
      }
    }
    await chrome.storage.session.remove('job');
    this.update(null, 'Mapping cancelled.');
  }

  public halt(): void {
    this.halted = true;
  }

  public async sendChat(text: string): Promise<void> {
    if (this.chatting) throw new Error('Wait for the current reply.');
    const message = MappingChatMessageSchema.parse({ role: 'user', text });
    this.chatting = true;
    this.halted = true;
    try {
      await this.pause();
      const interaction = this.interaction;
      const session = await jobSession();
      if (!session) throw new Error('Start a mapping job before chatting about its page.');
      const conversation = [...session.conversation.slice(-18), message];
      const observation = await observePage(session);
      if (interaction !== this.interaction) return;
      this.update(session.job, 'Mapping paused. Reading your message and the current page…');
      const result = MappingChatResponseSchema.parse(
        await json(
          config.backendOrigin,
          '/v2/jobs/' + session.job.jobId + '/chat',
          session.token,
          'POST',
          { revision: session.job.revision, observation, conversation },
        ),
      );
      const latest = await jobSession();
      if (interaction !== this.interaction || latest?.job.jobId !== session.job.jobId) return;
      await saveSession({
        ...latest,
        job: result.job,
        conversation: [...conversation, { role: 'assistant', text: result.response.reply }],
      });
      this.update(result.job, 'Reply ready. Continue chatting or press Resume mapping.');
    } catch (error) {
      // The server may have advanced its revision even if inference failed.
      await this.restore().catch(() => undefined);
      throw error;
    } finally {
      this.chatting = false;
    }
  }

  public async clearChat(): Promise<void> {
    if (this.chatting) throw new Error('Wait for the current reply.');
    await this.pause();
    const session = await jobSession();
    if (session) await saveSession({ ...session, conversation: [] });
  }

  public async run(resume = true, skipElementId?: string): Promise<void> {
    if (this.chatting) throw new Error('Wait for the chat reply before resuming.');
    if (this.busy) return;
    this.busy = true;
    this.halted = false;
    try {
      let session = await jobSession();
      if (!session) throw new Error('Select a quote to start mapping.');
      let first = true;
      while (!this.halted) {
        this.update(session.job, 'Reading this page and opening its sections…');
        const page = await observePage(session, () => this.halted);
        if (this.halted) break;
        this.update(
          session.job,
          config.sourceFormat === 'pdf'
            ? 'Reading your M.I.A. quote sheet and planning this page…'
            : 'Planning this page against your M.I.A. answers…',
        );
        const response = ObserveResponseSchema.parse(
          await json(
            config.backendOrigin,
            '/v2/jobs/' + session.job.jobId + '/observe',
            session.token,
            'POST',
            {
              revision: session.job.revision,
              resume: first && resume,
              ...(first && skipElementId ? { skipElementId } : {}),
              observation: page,
              conversation: session.conversation,
            },
          ),
        );
        first = false;
        if (this.halted) break;
        session = { ...session, job: response.job };
        await saveSession(session);
        this.update(this.display(session.job, page), this.statusMessage(session.job));
        if (!response.batch) break;
        const batches = [response.batch, ...(response.followingBatches ?? [])];
        for (const [index, batch] of batches.entries()) {
          if (this.halted) break;
          this.update(
            session.job,
            batch.action.type === 'next_page'
              ? 'Page reviewed. Moving to the next page…'
              : `Filling page: field ${index + 1} of ${batches.length}…`,
          );
          await boundTab(session);
          const latest = JobResponse.parse(
            await json(config.backendOrigin, '/v2/jobs/' + session.job.jobId, session.token),
          );
          if (
            this.halted ||
            latest.job.revision !== session.job.revision ||
            latest.job.status !== 'executing'
          )
            break;
          const receipt = await executeEntry(session, batch, page, () => this.halted);
          const result = JobResponse.parse(
            await json(
              config.backendOrigin,
              '/v2/jobs/' + session.job.jobId + '/receipts',
              session.token,
              'POST',
              { revision: session.job.revision, batchId: batch.batchId, receipt },
            ),
          );
          if (this.halted) break;
          session = { ...session, job: result.job };
          await saveSession(session);
          this.update(session.job, this.statusMessage(session.job));
          if (batch.action.type === 'next_page' && receipt.status === 'executed') {
            await waitForNextPage(session, page, () => this.halted);
          }
          if (['blocked', 'failed'].includes(receipt.status)) break;
        }
        if (session.job.status !== 'running') break;
      }
    } catch (error) {
      if (this.halted) return;
      if (expired(error)) await this.clearExpired();
      else await this.pause().catch(() => undefined);
      throw error;
    } finally {
      this.busy = false;
      this.halted = true;
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
