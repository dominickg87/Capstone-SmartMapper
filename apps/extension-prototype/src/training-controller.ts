import { carrierOriginAllowed } from '@smartmapper/automation-core/active-tab';
import { stablePageSignature, stableTargetSignature } from '@smartmapper/automation-core/registry';
import {
  ActivateMappingResponseSchema,
  CaptureTrainingPageRequestSchema,
  MiaFieldCatalogSchema,
  MappingProfileSchema,
  PageObservationSchema,
  PublishTrainingSessionResponseSchema,
  SaveTrainingPageRequestSchema,
  StartTrainingSessionSchema,
  TrainingPageResponseSchema,
  TrainingSessionResponseSchema,
  TrainingLibraryResponseSchema,
  VerifyMappingRequestSchema,
  type MappingDisposition,
  type MappingLineOfBusiness,
  type MiaFieldCatalog,
  type PageObservation,
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
    publishedMapping: MappingProfileSchema.optional(),
    windowId: z.number().int(),
  })
  .strict();
export type TrainingBrowserSession = z.infer<typeof TrainingBrowserSessionSchema>;
export interface TrainingLibrary {
  session: TrainingBrowserSession;
  drafts: TrainingSessionView[];
  mappings: z.infer<typeof MappingProfileSchema>[];
}

const GrantResponseSchema = z.object({ code: z.string().min(32).max(256) }).strict();

class TrainingApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function conflictMessage(code: string | undefined): string {
  switch (code) {
    case 'revision_conflict':
    case 'training_conflict':
      return 'The training draft changed. Reopen the panel to reload the saved draft before saving again.';
    case 'unsafe_training_structure':
      return 'The page capture was rejected because its field metadata did not pass validation. Reload the latest SmartMapper extension and capture this page again. (unsafe_training_structure)';
    case 'duplicate_control':
      return 'The page capture contains duplicate field identifiers. Capture this page again. (duplicate_control)';
    case 'observation_expired':
      return 'The page capture expired before it could be saved. Capture this page again.';
    case 'binding_mismatch':
      return 'Return to the carrier tab where this training draft started, then capture the page again.';
    case 'authentication_required':
      return 'Sign back into the carrier website, then capture the page again.';
    case 'duplicate_training_page':
      return 'This page or scenario is already captured. Select it from the captured-page list to edit its mappings.';
    case 'training_expired':
      return 'This training session expired. Start a new training session.';
    case 'training_not_draft':
      return 'This mapping has already left draft mode. Finish its test or start a new training draft.';
    case 'recovery_requires_empty_draft':
      return 'This recovery session already contains work. Find saved training again before choosing a record.';
    case 'saved_training_catalog_changed':
      return 'The M.I.A. field catalog changed since this draft was saved. The saved draft is preserved, but needs review before it can be resumed.';
    case 'saved_training_not_draft':
      return 'This draft was completed or cancelled. Find saved mappings and open its published version instead.';
    default:
      return 'The training service rejected this step. Your saved mappings remain available. Reopen the panel and try again.';
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
    const code = detail.success ? detail.data.error : undefined;
    throw new TrainingApiError(
      response.status,
      response.status === 401
        ? 'Your M.I.A. or training connection expired. Reconnect and resume training.'
        : response.status === 403
          ? 'This account is not authorized to train SmartMapper mappings.'
          : response.status === 409
            ? conflictMessage(code)
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

export async function trainingMarkersFor(
  page: TrainingPage,
  observation: PageObservation,
): Promise<TrainingMarker[]> {
  const structure = await structuralTrainingObservation(observation);
  if (
    structure.routeId !== page.routeId ||
    (await stablePageSignature(structure)) !== page.signature
  )
    return [];
  // DOM identifiers and rectangles belong to an observation, never to a saved workflow. Resolve
  // numbered fields against the current document before drawing or focusing an overlay.
  const liveBySignature = new Map<string, PageObservation['controls']>();
  const radioGroups = new Set<string>();
  for (const control of [...observation.controls].sort(
    (a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x,
  )) {
    if ((control.inputType === 'radio' || control.role === 'radio') && control.choiceGroup) {
      const key = `${control.choiceGroup.key}\0${control.choiceGroup.label}\0${control.section}`;
      if (radioGroups.has(key)) continue;
      radioGroups.add(key);
    }
    const signature = await stableTargetSignature(control);
    const candidates = liveBySignature.get(signature) ?? [];
    candidates.push(control);
    liveBySignature.set(signature, candidates);
  }
  const resolved = new Map<string, PageObservation['controls'][number]>();
  for (const field of page.fields) {
    const candidate = liveBySignature.get(await stableTargetSignature(field.control))?.[
      field.occurrence
    ];
    if (candidate && !candidate.disabled) resolved.set(field.fieldId, candidate);
  }
  for (const control of page.workflowControls) {
    const candidates = liveBySignature.get(await stableTargetSignature(control.control));
    if (candidates?.length === 1 && !candidates[0]!.disabled)
      resolved.set(`workflow-${control.workflowControlId}`, candidates[0]!);
  }
  const fields = page.fields
    .filter((field) => resolved.has(field.fieldId))
    .map((field) =>
      markerFromControl(
        field.fieldId,
        field.sequence,
        resolved.get(field.fieldId)!,
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
    .filter((control) => resolved.has(`workflow-${control.workflowControlId}`))
    .map((control) =>
      markerFromControl(
        `workflow-${control.workflowControlId}`,
        control.sequence,
        resolved.get(`workflow-${control.workflowControlId}`)!,
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
    if (current) await this.showPage(current).catch(() => undefined);
    return next;
  }

  public async boundToCurrentTab(session: TrainingBrowserSession): Promise<boolean> {
    return await activeCarrierTab(session)
      .then(() => true)
      .catch(() => false);
  }

  public async start(
    formType: MappingLineOfBusiness,
    _workflowName?: string,
    requestedBaseUrl?: string,
  ): Promise<TrainingBrowserSession> {
    if ((await trainingSession()) !== null)
      throw new Error('Finish or cancel the existing training draft first.');
    const session = await this.authorize(formType, requestedBaseUrl);
    await saveTrainingSession(session);
    return session;
  }

  private async authorize(
    formType: MappingLineOfBusiness,
    requestedBaseUrl?: string,
  ): Promise<TrainingBrowserSession> {
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
    return session;
  }

  public async findSaved(formType: MappingLineOfBusiness): Promise<TrainingLibrary> {
    const session = await this.authorize(formType);
    const library = TrainingLibraryResponseSchema.parse(
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${session.training.trainingId}/library`,
        session.token,
      ),
    );
    // Keep the current local draft intact until the user explicitly chooses a saved record.
    return { session, ...library };
  }

  public async recoverDraft(
    library: TrainingLibrary,
    trainingId: string,
  ): Promise<TrainingBrowserSession> {
    await activeCarrierTab(library.session);
    const response = TrainingSessionResponseSchema.parse(
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${library.session.training.trainingId}/recover`,
        library.session.token,
        'POST',
        { revision: library.session.training.revision, trainingId },
      ),
    );
    const next = { ...library.session, training: response.training };
    await saveTrainingSession(next);
    for (const page of next.training.pages) {
      if (await this.showPage(page).catch(() => false)) break;
    }
    return next;
  }

  public async openSavedMapping(
    library: TrainingLibrary,
    mappingId: string,
    mappingVersion: number,
  ): Promise<TrainingBrowserSession> {
    await activeCarrierTab(library.session);
    const response = PublishTrainingSessionResponseSchema.parse(
      await json(
        config.backendOrigin,
        `/v2/training/sessions/${library.session.training.trainingId}/open`,
        library.session.token,
        'POST',
        { revision: library.session.training.revision, mappingId, mappingVersion },
      ),
    );
    const next = {
      ...library.session,
      training: response.training,
      publishedMapping: response.mapping,
    };
    await saveTrainingSession(next);
    await this.clearOverlay();
    return next;
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
    await this.showPage(response.page).catch(() => undefined);
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
    await this.showPage(response.page).catch(() => undefined);
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

  public async showPage(page: TrainingPage): Promise<boolean> {
    const session = await trainingSession();
    if (!session) return false;
    const tab = await activeCarrierTab(session);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      files: ['content.js'],
    });
    const observation = PageObservationSchema.parse(
      await chrome.tabs.sendMessage(tab.id, {
        type: 'training-observe',
        tabId: tab.id,
      }),
    );
    const markers = await trainingMarkersFor(page, observation);
    await chrome.tabs.sendMessage(tab.id, {
      type: 'show-training-overlay',
      markers,
    });
    return markers.length > 0;
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
