import {
  ActionReceiptSchema,
  JobViewSchema,
  ObserveResponseSchema,
  PageObservationSchema,
  MappingChatMessageSchema,
  MappingChatResponseSchema,
  type JobView,
  type PageObservation,
} from '@smartmapper/contracts';
import { z } from 'zod';
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
                ? 'This quote cannot be mapped with the current question catalog.'
                : 'Mapping paused. Check the service connection and try Resume mapping.',
    );
  return (await response.json()) as unknown;
}

async function boundTab(
  session?: JobSession,
): Promise<chrome.tabs.Tab & { id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !config.carrierOrigins.includes(new URL(tab.url).origin))
    throw new Error('Open an approved quote page in the active tab.');
  if (
    session &&
    (tab.id !== session.job.binding.tabId ||
      tab.windowId !== session.windowId ||
      new URL(tab.url).origin !== session.job.binding.carrierOrigin)
  )
    throw new Error('Return to the original quote tab, review it, then Resume mapping.');
  return { ...tab, id: tab.id, url: tab.url };
}

async function observePage(session: JobSession): Promise<PageObservation> {
  const tab = await boundTab(session);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [0] },
    files: ['content.js'],
  });
  const page = PageObservationSchema.parse(
    await chrome.tabs.sendMessage(tab.id, { type: 'observe', tabId: tab.id }),
  );
  try {
    if (page.authenticationRequired)
      throw new Error('Complete sign-in or verification yourself, then Resume mapping.');
    await boundTab(session);
    try {
      page.screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',
        quality: 70,
      });
    } catch {
      throw new Error(
        'Click the SmartMapper toolbar icon while this quote tab is active, then try again.',
      );
    }
    await boundTab(session);
    return page;
  } finally {
    await chrome.tabs.sendMessage(tab.id, { type: 'clear-markers' });
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
    const { code } = z
      .object({ code: z.string() })
      .parse(
        await json(
          config.miaOrigin,
          '/api/extension/smartmapper/v2/quotes/' + encodeURIComponent(quoteId) + '/grants',
          token,
          'POST',
          { challenge, carrierOrigin, tabId: tab.id },
        ),
      );
    const result = Started.parse(
      await json(config.backendOrigin, '/v2/jobs', null, 'POST', {
        miaOrigin: config.miaOrigin,
        code,
        verifier,
        carrierOrigin,
        tabId: tab.id,
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

  public async run(resume = true): Promise<void> {
    if (this.chatting) throw new Error('Wait for the chat reply before resuming.');
    if (this.busy) return;
    this.busy = true;
    this.halted = false;
    try {
      let session = await jobSession();
      if (!session) throw new Error('Select a quote to start mapping.');
      let first = true;
      while (!this.halted) {
        const page = await observePage(session);
        if (this.halted) break;
        this.update(session.job, 'Reading this page and choosing the next field…');
        const response = ObserveResponseSchema.parse(
          await json(
            config.backendOrigin,
            '/v2/jobs/' + session.job.jobId + '/observe',
            session.token,
            'POST',
            {
              revision: session.job.revision,
              resume: first && resume,
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
        const tab = await boundTab(session);
        const latest = JobResponse.parse(
          await json(config.backendOrigin, '/v2/jobs/' + session.job.jobId, session.token),
        );
        if (
          this.halted ||
          latest.job.revision !== session.job.revision ||
          latest.job.status !== 'executing'
        )
          break;
        const receipt = ActionReceiptSchema.parse(
          await chrome.tabs.sendMessage(tab.id, { type: 'execute', batch: response.batch }),
        );
        const result = JobResponse.parse(
          await json(
            config.backendOrigin,
            '/v2/jobs/' + session.job.jobId + '/receipts',
            session.token,
            'POST',
            { revision: session.job.revision, batchId: response.batch.batchId, receipt },
          ),
        );
        if (this.halted) break;
        session = { ...session, job: result.job };
        await saveSession(session);
        this.update(session.job, this.statusMessage(session.job));
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
      return "I'm out of things to do on this page. Review it, move to the next page or section, then press Resume mapping.";
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
