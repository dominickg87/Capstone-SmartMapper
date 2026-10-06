import { carrierOriginAllowed } from '@smartmapper/automation-core/active-tab';
import {
  ActivateMappingResponseSchema,
  CaptureTrainingPageRequestSchema,
  MiaFieldCatalogSchema,
  PageObservationSchema,
  PublishTrainingSessionResponseSchema,
  SaveTrainingPageRequestSchema,
  StartTrainingSessionSchema,
  TrainingPageResponseSchema,
  TrainingSessionResponseSchema,
  VerifyMappingRequestSchema,
  type MappingDisposition,
  type MappingLineOfBusiness,
  type MiaFieldCatalog,
  type MappingProfile,
  type TrainingPage,
  type TrainingSessionView,
} from '@smartmapper/contracts';
import { z } from 'zod';
import { config } from './config.js';
import { stableCarrierBaseUrl } from './carrier-url.js';
import { miaToken, trustedStorage } from './session.js';
import { markerFromControl, type TrainingMarker } from './training-overlay.js';
import { structuralTrainingObservation } from './training-observation.js';

const TrainingBrowserSessionSchema = z
  .object({
    training: z.custom<TrainingSessionView>(),
    token: z.string().min(1),
    catalog: z.custom<MiaFieldCatalog>(),
    publishedMapping: z.custom<MappingProfile>().optional(),
    windowId: z.number().int(),
  })
  .strict();
export type TrainingBrowserSession = z.infer<typeof TrainingBrowserSessionSchema>;

const GrantResponseSchema = z.object({ code: z.string().min(32).max(256) }).strict();

class TrainingApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

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
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const detail = z
      .object({ error: z.string().optional(), message: z.string().optional() })
      .passthrough()
      .safeParse(await response.json().catch(() => null));
    const serverMessage = detail.success ? detail.data.message || detail.data.error : undefined;
    throw new TrainingApiError(
      response.status,
      response.status === 401
        ? 'Your M.I.A. or training connection expired. Reconnect and resume training.'
        : response.status === 403
          ? 'This account is not authorized to train SmartMapper mappings.'
          : response.status === 409
            ? 'The training draft changed. Reload the draft before saving again.'
            : response.status === 422
              ? serverMessage === 'mapping_test_coverage_incomplete'
                ? 'This test has not covered every trained page and mapped field yet. Continue the carrier workflow, then Resume mapping.'
                : serverMessage === 'mapping_test_not_clean'
                  ? 'This mapping test still has missing or failed fields. Resolve them before activation.'
                  : serverMessage || 'Complete every captured carrier field before publishing.'
              : serverMessage || 'The training service could not complete this request.',
    );
  }
  return (await response.json()) as unknown;
}

async function activeCarrierTab(
  session?: TrainingBrowserSession,
): Promise<chrome.tabs.Tab & { id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activatedId = new URLSearchParams(location.search).get('tabId');
  if (activatedId && tab?.id !== Number(activatedId))
    throw new Error('Return to the carrier tab where you opened SmartMapper.');
  if (tab?.id === undefined || !tab.url)
    throw new Error('Open the carrier page and click the SmartMapper toolbar icon.');
  const carrierOrigin = new URL(tab.url).origin;
  if (!carrierOriginAllowed(carrierOrigin, new Set(config.carrierOrigins), config.allowAnyCarrier))
    throw new Error(
      config.allowAnyCarrier
        ? 'Open an HTTPS carrier page and click the SmartMapper toolbar icon.'
        : 'This carrier origin is not enabled for SmartMapper.',
    );
  if (
    session &&
    (tab.id !== session.training.binding.tabId ||
      tab.windowId !== session.windowId ||
      carrierOrigin !== session.training.binding.carrierOrigin)
  )
    throw new Error('Return to the carrier tab where this training draft started.');
  return { ...tab, id: tab.id, url: tab.url };
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
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
  return { verifier, challenge };
}

export async function trainingSession(): Promise<TrainingBrowserSession | null> {
  await trustedStorage();
  const stored: Record<string, unknown> = await chrome.storage.session.get('training');
  if (!stored.training) return null;
  const envelope = TrainingBrowserSessionSchema.parse(stored.training);
  return {
    ...envelope,
    training: TrainingSessionResponseSchema.shape.training.parse(envelope.training),
    catalog: MiaFieldCatalogSchema.parse(envelope.catalog),
  };
}

async function saveTrainingSession(session: TrainingBrowserSession): Promise<void> {
  await trustedStorage();
  await chrome.storage.session.set({ training: session });
}

function markersFor(page: TrainingPage): TrainingMarker[] {
  const fields = page.fields
    .filter((field) => !field.control.disabled && !field.control.ordinaryNext)
    .map((field) =>
      markerFromControl(
        field.fieldId,
        field.sequence,
        field.control,
        field.disposition === null
          ? 'unmapped'
          : field.disposition.kind === 'source' || field.disposition.kind === 'fixed_value'
            ? 'mapped'
            : field.disposition.kind === 'human_required'
              ? 'human'
              : 'ignored',
      ),
    );
  const workflowControls = page.workflowControls
    .filter((control) => !control.control.disabled)
    .map((control) =>
      markerFromControl(
        `workflow-${control.workflowControlId}`,
        control.sequence,
        control.control,
        control.decision === null ? 'unmapped' : control.decision === 'use' ? 'mapped' : 'ignored',
      ),
    );
  return [...fields, ...workflowControls];
}

export class TrainingController {
  public async carrierIdentity(): Promise<{ carrierOrigin: string; carrierBaseUrl: string }> {
    const tab = await activeCarrierTab();
    const url = new URL(tab.url);
    return {
      carrierOrigin: url.origin,
      carrierBaseUrl: stableCarrierBaseUrl(tab.url),
    };
  }

  public async catalog(formType: MappingLineOfBusiness): Promise<MiaFieldCatalog> {
    const token = await miaToken();
    if (!token) throw new Error('Connect to M.I.A. before starting training.');
    return MiaFieldCatalogSchema.parse(
      await json(config.miaOrigin, `/api/extension/smartmapper/v2/catalog/${formType}`, token),
    );
  }

  public async restore(): Promise<TrainingBrowserSession | null> {
    const session = await trainingSession();
    if (!session) return null;
    let response: z.infer<typeof TrainingSessionResponseSchema>;
    try {
      response = TrainingSessionResponseSchema.parse(
        await json(
          config.backendOrigin,
          `/v2/training/sessions/${session.training.trainingId}`,
          session.token,
        ),
      );
    } catch (failure) {
      if (!(failure instanceof TrainingApiError) || ![404, 410].includes(failure.status))
        throw failure;
      await chrome.storage.session.remove('training');
      await this.clearOverlay();
      return null;
    }
    const next = { ...session, training: response.training };
    await saveTrainingSession(next);
    const current = next.training.pages.at(-1);
    if (current) await this.showPage(current);
    return next;
  }

  public async start(
    formType: MappingLineOfBusiness,
    _workflowName?: string,
    requestedBaseUrl?: string,
  ): Promise<TrainingBrowserSession> {
    if ((await trainingSession()) !== null)
      throw new Error('Finish or cancel the existing training draft first.');
    const token = await miaToken();
    if (!token) throw new Error('Connect to M.I.A. before starting training.');
    const tab = await activeCarrierTab();
    const carrierOrigin = new URL(tab.url).origin;
    const carrierBaseUrl = stableCarrierBaseUrl(requestedBaseUrl?.trim() || tab.url);
    const parsedBaseUrl = new URL(carrierBaseUrl);
    if (
      parsedBaseUrl.origin !== carrierOrigin ||
      parsedBaseUrl.username ||
      parsedBaseUrl.password ||
      parsedBaseUrl.search ||
      parsedBaseUrl.hash
    )
      throw new Error(
        'Carrier base URL must be on this carrier site and cannot include a query or fragment.',
      );
    const catalog = await this.catalog(formType);
    const { verifier, challenge } = await pkce();
    const grant = GrantResponseSchema.parse(
      await json(config.miaOrigin, '/api/extension/smartmapper/v2/training/grants', token, 'POST', {
        challenge,
        carrierOrigin,
        tabId: tab.id,
        formType,
      }),
    );
    const body = StartTrainingSessionSchema.parse({
      miaOrigin: config.miaOrigin,
      code: grant.code,
      verifier,
      carrierOrigin,
      carrierBaseUrl,
      tabId: tab.id,
      formType,
      workflowName: `${parsedBaseUrl.hostname} ${formType === 'home' ? 'Home' : 'Auto'} workflow`,
    });
    const response = TrainingSessionResponseSchema.parse(
      await json(config.backendOrigin, '/v2/training/sessions', null, 'POST', body),
    );
    if (!response.token) throw new Error('The training service did not return a session token.');
    const session = {
      training: response.training,
      token: response.token,
      catalog,
      windowId: tab.windowId,
    };
    await saveTrainingSession(session);
    return session;
  }

  public async capture(
    kind: 'main' | 'page' | 'scenario' = 'page',
  ): Promise<TrainingBrowserSession> {
    const session = await trainingSession();
    if (!session) throw new Error('Start training before capturing a carrier page.');
    const tab = await activeCarrierTab(session);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'prepare-survey', tabId: tab.id });
    const observation = PageObservationSchema.parse(
      await chrome.tabs.sendMessage(tab.id, {
        type: 'finish-survey',
        tabId: tab.id,
        complete: true,
        targeted: true,
      }),
    );
    const body = CaptureTrainingPageRequestSchema.parse({
      revision: session.training.revision,
      observation: await structuralTrainingObservation(observation),
      scenarioLabel:
        kind === 'main'
          ? 'Main path'
          : kind === 'scenario'
            ? `Scenario ${session.training.pages.length + 1}`
            : `Page ${session.training.pages.length + 1}`,
    });
    const response = TrainingPageResponseSchema.parse(
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${session.training.trainingId}/pages`,
        session.token,
        'POST',
        body,
      ),
    );
    const next = { ...session, training: response.training };
    await saveTrainingSession(next);
    await this.showPage(response.page);
    return next;
  }

  public async savePage(
    pageId: string,
    fields: Array<{
      fieldId: string;
      disposition: MappingDisposition;
      repeatBinding?: {
        entityType: 'applicant' | 'additionalDriver' | 'vehicle';
        index: number;
      } | null;
    }>,
    workflowControls: Array<{
      workflowControlId: string;
      decision: 'use' | 'ignore';
    }>,
  ): Promise<TrainingBrowserSession> {
    const session = await trainingSession();
    if (!session) throw new Error('This training draft is no longer available.');
    const body = SaveTrainingPageRequestSchema.parse({
      revision: session.training.revision,
      fields,
      workflowControls,
    });
    const response = TrainingPageResponseSchema.parse(
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${session.training.trainingId}/pages/${pageId}`,
        session.token,
        'POST',
        body,
      ),
    );
    const next = { ...session, training: response.training };
    await saveTrainingSession(next);
    await this.showPage(response.page);
    return next;
  }

  public async publish(): Promise<TrainingBrowserSession> {
    const session = await trainingSession();
    if (!session) throw new Error('This training draft is no longer available.');
    const response = PublishTrainingSessionResponseSchema.parse(
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${session.training.trainingId}/publish`,
        session.token,
        'POST',
        { revision: session.training.revision },
      ),
    );
    const next = {
      ...session,
      training: response.training,
      publishedMapping: response.mapping,
    };
    await saveTrainingSession(next);
    await this.clearOverlay();
    return next;
  }

  public async activate(): Promise<TrainingBrowserSession> {
    const session = await trainingSession();
    const mapping = session?.publishedMapping;
    if (!session || !mapping)
      throw new Error('Complete and test this mapping before activating it.');
    const response = ActivateMappingResponseSchema.parse(
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${session.training.trainingId}/activate`,
        session.token,
        'POST',
        {
          revision: session.training.revision,
          mappingVersion: mapping.mappingVersion,
        },
      ),
    );
    const next = {
      ...session,
      training: response.training,
      publishedMapping: response.mapping,
    };
    await saveTrainingSession(next);
    return next;
  }

  public async verify(jobId: string, jobToken: string): Promise<TrainingBrowserSession> {
    const session = await trainingSession();
    const mapping = session?.publishedMapping;
    if (!session || !mapping)
      throw new Error('The testable training draft is no longer available.');
    const body = VerifyMappingRequestSchema.parse({
      revision: session.training.revision,
      mappingVersion: mapping.mappingVersion,
      jobId,
      jobToken,
    });
    const response = ActivateMappingResponseSchema.parse(
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${session.training.trainingId}/verify`,
        session.token,
        'POST',
        body,
      ),
    );
    const next = {
      ...session,
      training: response.training,
      publishedMapping: response.mapping,
    };
    await saveTrainingSession(next);
    return next;
  }

  public async finish(): Promise<void> {
    await chrome.storage.session.remove('training');
    await this.clearOverlay();
  }

  public async cancel(): Promise<void> {
    const session = await trainingSession();
    if (session)
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${session.training.trainingId}`,
        session.token,
        'DELETE',
      ).catch(() => undefined);
    await chrome.storage.session.remove('training');
    await this.clearOverlay();
  }

  public async showPage(page: TrainingPage): Promise<void> {
    const session = await trainingSession();
    if (!session) return;
    const tab = await activeCarrierTab(session);
    await chrome.tabs.sendMessage(tab.id, {
      type: 'show-training-overlay',
      markers: markersFor(page),
    });
  }

  public async focus(fieldId: string): Promise<void> {
    const session = await trainingSession();
    if (!session) return;
    const tab = await activeCarrierTab(session);
    await chrome.tabs.sendMessage(tab.id, { type: 'focus-training-field', fieldId });
  }

  public async clearOverlay(): Promise<void> {
    const session = await trainingSession();
    const tab = await activeCarrierTab(session ?? undefined).catch(() => null);
    if (tab)
      await chrome.tabs
        .sendMessage(tab.id, { type: 'clear-training-overlay' })
        .catch(() => undefined);
  }
}
