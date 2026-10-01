import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { documentSources, type AiMapperProvider } from '@smartmapper/ai-mapper';
import {
  actionExpectedValue,
  changesAnswer,
  carrierOriginAllowed,
  controlIsHumanOnly,
  directRepresentationMatches,
  evaluateActiveTabAction,
  sectionActionsAllowed,
  validatePageBinding,
  valueDigest,
  pageReadyToAdvance,
  type FactVerifier,
} from '@smartmapper/automation-core/active-tab';
import {
  JobViewSchema,
  MappingChatRequestSchema,
  MappingChatReplySchema,
  type MappingChatResponse,
  ObserveRequestSchema,
  ReceiptRequestSchema,
  SmartMapperPlanSchema,
  StartJobSchema,
  QuoteSheetSchema,
  type QuoteSheet,
  type FieldReview,
  type ActionBatch,
  type FactVerificationEntry,
  type JobView,
  type ObserveResponse,
  type SmartMapperObservation,
  type SmartMapperPlan,
  type PageObservation,
  type PageControl,
} from '@smartmapper/contracts';
import type { ActiveTabSourceProvider } from '@smartmapper/mia-client';

import {
  ConflictError,
  type CheckpointStore,
  type StoredCheckpoint,
  type PendingAction,
} from './checkpoints.js';

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

function controlShape({
  value: _value,
  checked: _checked,
  errors: _errors,
  requiredSatisfied: _satisfied,
  rect: _rect,
  ...shape
}: PageControl): string {
  return hash(JSON.stringify(shape));
}

function skippedElements(page: PageObservation, checkpoint: StoredCheckpoint['value']): string[] {
  return page.controls
    .filter(
      (control) =>
        !controlIsHumanOnly(control) &&
        checkpoint.skippedControls?.some(
          (item) => item.key === control.key && item.shape === controlShape(control),
        ),
    )
    .map((control) => control.elementId);
}

function pageShape(page: PageObservation): string {
  return hash(
    JSON.stringify({
      document: page.documentId,
      route: page.routeId,
      text: page.textFingerprint,
      headings: page.headings,
      controls: page.controls.map(
        ({
          value: _value,
          checked: _checked,
          errors: _errors,
          requiredSatisfied: _satisfied,
          rect: _rect,
          ...control
        }) => control,
      ),
    }),
  );
}

async function batchCompletedPage(
  page: PageObservation,
  checkpoint: StoredCheckpoint['value'],
): Promise<boolean> {
  if (
    checkpoint.sourceFormat !== 'pdf' ||
    checkpoint.plannedShape !== pageShape(page) ||
    checkpoint.view.reviews.length ||
    checkpoint.recentResults.some(
      (receipt) =>
        receipt.status === 'failed' ||
        (receipt.status === 'blocked' && receipt.reason !== 'page_changed'),
    ) ||
    !pageReadyToAdvance(page)
  )
    return false;
  const controls = page.controls.filter(
    (control) =>
      !control.disabled &&
      !controlIsHumanOnly(control) &&
      ['input', 'select', 'textarea', 'custom'].includes(control.tag),
  );
  if (!controls.length) return false;
  const skipped = skippedElements(page, checkpoint);
  for (const control of controls) {
    if (skipped.includes(control.elementId)) continue;
    const receipt = checkpoint.audit.findLast(
      (entry) => entry.key === control.key && entry.status === 'verified',
    );
    if (
      !receipt ||
      !checkpoint.verifiedControls.includes(control.key) ||
      receipt.expectedHash !==
        (await valueDigest(
          ['checkbox', 'radio'].includes(control.inputType) ? control.checked : control.value,
        ))
    )
      return false;
  }
  return true;
}

function policyReviewReason(reason: string): FieldReview['reason'] {
  switch (reason) {
    case 'page_changed':
    case 'control_missing':
      return 'page_changed';
    case 'authentication_required':
    case 'human_only':
      return 'human_only';
    case 'missing_source':
    case 'missing_provenance':
    case 'duplicate_source':
      return 'missing_source';
    case 'low_confidence':
      return 'ambiguous_match';
    default:
      return 'unsupported_control';
  }
}

export interface ServiceAccess {
  miaOrigins: ReadonlySet<string>;
  carrierOrigins: ReadonlySet<string>;
  allowAnyCarrier?: boolean;
  principals: ReadonlySet<string>;
  autoNext?: boolean;
}

export class ActiveTabJobService {
  private readonly documents = new Map<
    string,
    { id: symbol; value: Promise<QuoteSheet>; expiresAt: number }
  >();

  private document(
    jobId: string,
    checkpoint: StoredCheckpoint['value'],
  ): Promise<QuoteSheet> | undefined {
    if (checkpoint.sourceFormat !== 'pdf') return undefined;
    for (const [key, item] of this.documents)
      if (item.expiresAt <= Date.now()) this.documents.delete(key);
    const existing = this.documents.get(jobId);
    if (existing) return existing.value;
    if (!this.sources.document) throw new ApiError(503, 'quote_sheet_unavailable');
    const id = Symbol(jobId);
    const value = this.sources
      .document(checkpoint.miaOrigin, checkpoint.sourceToken)
      .then((input) => {
        const sheet = QuoteSheetSchema.parse(input);
        const binding = checkpoint.view.binding;
        if (
          sheet.tenantId !== binding.tenantId ||
          sheet.userId !== binding.userId ||
          sheet.quoteId !== binding.quoteId ||
          sheet.revision !== checkpoint.sourceRevision
        )
          throw new ApiError(409, 'quote_sheet_changed');
        return sheet;
      })
      .catch((error: unknown) => {
        if (this.documents.get(jobId)?.id === id) this.documents.delete(jobId);
        throw error;
      });
    if (this.documents.size >= 20) this.documents.delete(this.documents.keys().next().value!);
    const expiresAt = Math.min(
      Date.parse(checkpoint.view.binding.expiresAt),
      Date.now() + 5 * 60_000,
    );
    this.documents.set(jobId, {
      id,
      value,
      expiresAt,
    });
    setTimeout(
      () => {
        if (this.documents.get(jobId)?.id === id) this.documents.delete(jobId);
      },
      Math.max(1, expiresAt - Date.now()),
    ).unref();
    return value;
  }
  public constructor(
    private readonly store: CheckpointStore,
    private readonly sources: ActiveTabSourceProvider,
    private readonly mapper: AiMapperProvider<SmartMapperObservation, SmartMapperPlan>,
    private readonly verifier: FactVerifier,
    private readonly access: ServiceAccess,
  ) {}

  private async authorized(
    jobId: string,
    token: string,
  ): Promise<StoredCheckpoint & { partition: string }> {
    if (!/^[a-f0-9-]{36}$/.test(jobId) || !/^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}$/.test(token))
      throw new ApiError(401, 'unauthorized');
    const partition = token.split('.')[0] ?? '';
    const result = await this.store.read(partition, jobId);
    if (
      !result ||
      !timingSafeEqual(Buffer.from(result.value.tokenHash, 'hex'), Buffer.from(hash(token), 'hex'))
    )
      throw new ApiError(401, 'unauthorized');
    const binding = result.value.view.binding;
    if (Date.parse(binding.expiresAt) <= Date.now()) throw new ApiError(410, 'job_expired');
    if (
      !this.access.principals.has(binding.tenantId + '/' + binding.userId) ||
      !carrierOriginAllowed(
        binding.carrierOrigin,
        this.access.carrierOrigins,
        this.access.allowAnyCarrier,
      ) ||
      !this.access.miaOrigins.has(result.value.miaOrigin)
    )
      throw new ApiError(403, 'scope_not_allowed');
    return { ...result, partition };
  }

  private async save(partition: string, record: StoredCheckpoint): Promise<JobView> {
    record.value.view.revision += 1;
    await this.store.replace(partition, record.value.view.jobId, record.value, record.etag);
    return JobViewSchema.parse(record.value.view);
  }

  public async start(input: unknown): Promise<{ job: JobView; token: string }> {
    const request = StartJobSchema.parse(input);
    if (
      !this.access.miaOrigins.has(request.miaOrigin) ||
      !carrierOriginAllowed(
        request.carrierOrigin,
        this.access.carrierOrigins,
        this.access.allowAnyCarrier,
      )
    )
      throw new ApiError(403, 'origin_not_allowed');
    const grant = await this.sources.redeem(request);
    const binding = grant.binding;
    if (
      !this.access.principals.has(binding.tenantId + '/' + binding.userId) ||
      binding.carrierOrigin !== request.carrierOrigin ||
      binding.tabId !== request.tabId ||
      Date.parse(binding.expiresAt) > Date.now() + 61 * 60_000 ||
      Date.parse(binding.expiresAt) <= Date.now() ||
      grant.source.tenantId !== binding.tenantId ||
      grant.source.userId !== binding.userId ||
      grant.source.quoteId !== binding.quoteId ||
      grant.source.sourceFormat !== request.sourceFormat
    ) {
      await this.sources.revoke(request.miaOrigin, grant.sourceToken);
      throw new ApiError(403, 'grant_binding_mismatch');
    }
    const partition = hash([binding.tenantId, binding.userId, binding.carrierOrigin].join('\0'));
    const token = partition + '.' + randomBytes(32).toString('base64url');
    const view: JobView = {
      version: '2.0',
      jobId: randomUUID(),
      revision: 0,
      status: 'ready',
      binding,
      verified: 0,
      failed: 0,
      reviews: [],
    };
    await this.store.create(partition, view.jobId, {
      view,
      tokenHash: hash(token),
      miaOrigin: request.miaOrigin,
      sourceToken: grant.sourceToken,
      sourceRevision: grant.source.revision,
      ...(grant.source.sourceFormat ? { sourceFormat: grant.source.sourceFormat } : {}),
      page: null,
      attempts: {},
      verifiedControls: [],
      recentResults: [],
      audit: [],
      actionCount: 0,
      lastFingerprint: '',
      unchangedCount: 0,
      pending: null,
      lastBatchId: null,
    });
    const checkpoint = await this.store.read(partition, view.jobId);
    if (checkpoint) void this.document(view.jobId, checkpoint.value)?.catch(() => undefined);
    return { job: view, token };
  }

  public async read(jobId: string, token: string): Promise<JobView> {
    return JobViewSchema.parse((await this.authorized(jobId, token)).value.view);
  }

  public async pause(jobId: string, token: string): Promise<JobView> {
    const record = await this.authorized(jobId, token);
    record.value.view.status = 'paused';
    record.value.pending = null;
    record.value.queued = [];
    record.value.expectedNavigation = false;
    record.value.reobserve = false;
    return this.save(record.partition, record);
  }

  public async cancel(jobId: string, token: string): Promise<void> {
    const record = await this.authorized(jobId, token);
    this.documents.delete(jobId);
    record.value.view.status = 'blocked';
    record.value.pending = null;
    record.value.queued = [];
    await this.save(record.partition, record);
    try {
      await this.sources.revoke(record.value.miaOrigin, record.value.sourceToken);
    } finally {
      const latest = await this.store.read(record.partition, jobId);
      if (latest) await this.store.delete(record.partition, jobId, latest.etag);
    }
  }

  public async observe(jobId: string, token: string, input: unknown): Promise<ObserveResponse> {
    const request = ObserveRequestSchema.parse(input);
    const record = await this.authorized(jobId, token);
    const value = record.value;
    if (request.revision !== value.view.revision) throw new ConflictError('revision_conflict');
    const problem = validatePageBinding(request.observation, value.view.binding);
    if (problem) throw new ApiError(409, problem);
    if (!request.observation.screenshot) throw new ApiError(400, 'screenshot_required');
    const pageChanged =
      value.page !== null &&
      (value.page.documentId !== request.observation.documentId ||
        value.page.routeId !== request.observation.routeId);
    const advanced =
      value.expectedNavigation === true &&
      (pageChanged || value.lastFingerprint !== request.observation.fingerprint);
    const repairPostback =
      value.reobserve === true && value.page?.routeId === request.observation.routeId;
    if (request.skipElementId) {
      const control = request.observation.controls.find(
        (item) => item.elementId === request.skipElementId,
      );
      const review = value.view.reviews.find((item) => item.elementId === request.skipElementId);
      if (
        !request.resume ||
        pageChanged ||
        !review ||
        !control ||
        controlIsHumanOnly(control) ||
        !['input', 'select', 'textarea', 'custom'].includes(control.tag) ||
        ['human_only', 'validation_error', 'page_changed'].includes(review.reason)
      )
        throw new ApiError(409, 'field_not_skippable');
      value.skippedControls = [
        ...(value.skippedControls ?? []).filter((item) => item.key !== control.key),
        { key: control.key, shape: controlShape(control) },
      ].slice(-500);
    }
    if (
      !request.resume &&
      ((pageChanged && !advanced && !repairPostback) ||
        (value.expectedNavigation && !advanced) ||
        !['ready', 'running'].includes(value.view.status))
    ) {
      value.view.status = 'paused';
      value.pending = null;
      value.queued = [];
      return { job: await this.save(record.partition, record), batch: null };
    }
    if (pageChanged || advanced) {
      value.skippedControls = [];
      value.attempts = {};
      value.verifiedControls = [];
      value.actionCount = 0;
      value.unchangedCount = 0;
      value.recentResults = [];
      value.pagePasses = 0;
    }
    if (advanced) value.completedPages = (value.completedPages ?? 0) + 1;
    value.expectedNavigation = false;
    value.reobserve = false;
    value.wholePage = !!request.observation.capture;
    value.pagePasses = request.resume ? 1 : (value.pagePasses ?? 0) + 1;
    value.page = {
      documentId: request.observation.documentId,
      routeId: request.observation.routeId,
    };
    value.unchangedCount =
      value.lastFingerprint === request.observation.fingerprint ? value.unchangedCount + 1 : 0;
    value.lastFingerprint = request.observation.fingerprint;
    value.pending = null;
    value.queued = [];
    const completedLocally =
      !request.resume && (await batchCompletedPage(request.observation, value));
    const skipped = skippedElements(request.observation, value);
    value.view.reviews = [];
    if (
      value.actionCount >= 150 ||
      value.unchangedCount >= 12 ||
      (value.wholePage && value.pagePasses > 8)
    ) {
      value.view.status = 'human_input';
      value.view.reviews = [
        { elementId: null, question: 'Page needs review', entity: '', reason: 'retry_limit' },
      ];
      return { job: await this.save(record.partition, record), batch: null };
    }
    value.view.status = 'planning';
    await this.save(record.partition, record);
    const planning = await this.authorized(jobId, token);
    if (
      planning.value.view.revision !== value.view.revision ||
      planning.value.view.status !== 'planning'
    )
      throw new ConflictError('planning_interrupted');
    try {
      const source = await this.sources.read(
        value.miaOrigin,
        value.sourceToken,
        value.sourceFormat,
      );
      if (
        source.tenantId !== value.view.binding.tenantId ||
        source.userId !== value.view.binding.userId ||
        source.quoteId !== value.view.binding.quoteId
      )
        throw new ApiError(403, 'source_binding_mismatch');
      if (source.revision !== value.sourceRevision || source.sourceFormat !== value.sourceFormat) {
        this.documents.delete(jobId);
        planning.value.view.status = 'human_input';
        planning.value.view.reviews = [
          {
            elementId: null,
            question: 'The M.I.A. quote changed. Start a new mapping job.',
            entity: '',
            reason: 'source_mismatch',
          },
        ];
        return { job: await this.save(planning.partition, planning), batch: null };
      }
      const document = await this.document(jobId, value);
      const proposal = SmartMapperPlanSchema.parse(
        completedLocally
          ? {
              version: '2.0',
              pageStateId: request.observation.pageStateId,
              outcome: 'page_complete',
              actions: [],
              reviews: [],
            }
          : await this.mapper.proposeMappings({
              page: request.observation,
              source,
              ...(document ? { document } : {}),
              attempts: value.attempts,
              recentResults: value.recentResults,
              verifiedControls: value.verifiedControls,
              skippedElementIds: skipped,
              conversation: request.conversation,
            }),
      );
      planning.value.plannedShape = pageShape(request.observation);
      if (proposal.documentAnswers && !document)
        throw new ApiError(502, 'unexpected_document_citations');
      if (document) {
        source.answers = documentSources(proposal, document);
        if (new Set(source.answers.map((answer) => answer.answerId)).size !== source.answers.length)
          throw new ApiError(502, 'duplicate_document_citation');
      }
      proposal.actions.sort((a, b) => {
        const first = request.observation.controls.find(
          (control) => control.elementId === a.elementId,
        )?.rect;
        const second = request.observation.controls.find(
          (control) => control.elementId === b.elementId,
        )?.rect;
        return first && second ? first.y - second.y || first.x - second.x : 0;
      });
      if (
        proposal.pageStateId !== request.observation.pageStateId ||
        (proposal.outcome === 'act') !== proposal.actions.length > 0
      )
        throw new ApiError(502, 'invalid_plan');
      if (proposal.actions.some((action) => action.type === 'next_page'))
        throw new ApiError(502, 'model_navigation_not_allowed');
      // A human skip is enforced even if the planner ignores it. Validation and final-action
      // checks still inspect the original page; skipping does not approve missing required data.
      proposal.actions = proposal.actions.filter(
        (action) => !action.elementId || !skipped.includes(action.elementId),
      );
      proposal.reviews = proposal.reviews.filter(
        (review) =>
          !review.elementId ||
          !skipped.includes(review.elementId) ||
          ['human_only', 'validation_error', 'page_changed'].includes(review.reason),
      );
      if (proposal.outcome === 'act' && !proposal.actions.length) proposal.outcome = 'human_input';
      // Page-derived text never enters durable checkpoints.
      planning.value.view.reviews = proposal.reviews.map((item) => ({
        ...item,
        question: 'Field needs review',
        entity: '',
      }));
      let action = proposal.actions[0];
      if (!action) {
        for (const control of request.observation.controls) {
          if (control.disabled || controlIsHumanOnly(control)) continue;
          const empty =
            control.inputType === 'checkbox'
              ? !control.checked
              : control.inputType === 'radio'
                ? !request.observation.controls.some(
                    (other) =>
                      other.section === control.section &&
                      other.inputType === 'radio' &&
                      other.checked,
                  )
                : !control.value;
          if (
            (control.required && !(control.requiredSatisfied ?? !empty)) ||
            control.errors.length
          ) {
            if (!planning.value.view.reviews.some((item) => item.elementId === control.elementId))
              planning.value.view.reviews.push({
                elementId: control.elementId,
                question: 'Field needs review',
                entity: '',
                reason: control.errors.length ? 'validation_error' : 'missing_source',
              });
          }
        }
        planning.value.view.reviews = planning.value.view.reviews.slice(0, 95);
        planning.value.view.status =
          proposal.outcome === 'page_complete' &&
          !proposal.reviews.length &&
          !request.observation.errors.length &&
          !request.observation.unsupportedFrames &&
          !request.observation.omittedControls &&
          request.observation.capture?.complete !== false &&
          !request.observation.capture?.unexpanded &&
          !planning.value.view.reviews.length
            ? 'page_complete'
            : 'human_input';
        if (request.observation.unsupportedFrames)
          planning.value.view.reviews.push({
            elementId: null,
            question: 'Embedded form needs review',
            entity: '',
            reason: 'unsupported_control',
          });
        if (request.observation.omittedControls)
          planning.value.view.reviews.push({
            elementId: null,
            question: 'Some controls could not be inspected',
            entity: '',
            reason: 'unsupported_control',
          });
        if (
          request.observation.capture?.complete === false ||
          request.observation.capture?.unexpanded
        )
          planning.value.view.reviews.push({
            elementId: null,
            question: 'Some page sections could not be inspected',
            entity: '',
            reason: 'unsupported_control',
          });
        if (request.observation.errors.length)
          planning.value.view.reviews.push({
            elementId: null,
            question: 'Carrier validation needs review',
            entity: '',
            reason: 'validation_error',
          });
        const nextControls = request.observation.controls.filter(
          (control) => control.ordinaryNext && !control.disabled,
        );
        if (
          planning.value.view.status === 'page_complete' &&
          this.access.autoNext &&
          nextControls.length
        ) {
          if (
            nextControls.length !== 1 ||
            !pageReadyToAdvance(request.observation) ||
            (value.completedPages ?? 0) >= 20
          ) {
            planning.value.view.status = 'human_input';
            planning.value.view.reviews.push({
              elementId: null,
              question: 'Review the page before continuing',
              entity: '',
              reason: 'human_only',
            });
          } else {
            action = {
              version: '2.0',
              actionId: randomUUID(),
              pageStateId: request.observation.pageStateId,
              type: 'next_page',
              elementId: nextControls[0]!.elementId,
              sourceAnswerIds: [],
              value: null,
              checked: null,
              key: null,
              purpose: null,
              direction: null,
              milliseconds: null,
              transformation: {
                kind: 'identity',
                explanation: 'Ordinary next page after a complete page review.',
              },
              confidence: 1,
            };
            proposal.actions = [action];
          }
        }
        if (!action) return { job: await this.save(planning.partition, planning), batch: null };
      }
      const entries: FactVerificationEntry[] = [];
      const batches: ActionBatch[] = [];
      const pending: PendingAction[] = [];
      const reviews: FieldReview[] = [];
      const reject = (elementId: string | null, reason: FieldReview['reason']) =>
        reviews.push({ elementId, question: 'Field needs review', entity: '', reason });
      if (!sectionActionsAllowed(proposal.actions, request.observation))
        reject(null, 'unsupported_control');
      if (value.actionCount + proposal.actions.length > 150) reject(null, 'retry_limit');
      for (const candidate of proposal.actions) {
        if (proposal.reviews.some((review) => review.elementId === candidate.elementId)) {
          reject(candidate.elementId, 'ambiguous_match');
          continue;
        }
        const policy = evaluateActiveTabAction(candidate, request.observation, source);
        if (!policy.allowed) {
          reject(candidate.elementId, policyReviewReason(policy.reason));
          continue;
        }
        const key = policy.control?.key ?? '__page__';
        if ((value.attempts[key] ?? 0) >= 5) reject(candidate.elementId, 'retry_limit');
        if (changesAnswer(candidate)) {
          if (!policy.control) reject(candidate.elementId, 'unsupported_control');
          else if (!directRepresentationMatches(candidate, policy.sources))
            reject(candidate.elementId, 'source_mismatch');
          else
            entries.push({ action: candidate, control: policy.control, sources: policy.sources });
        }
        const expected = actionExpectedValue(candidate);
        const batchId = randomUUID();
        batches.push({ batchId, action: candidate, sources: policy.sources });
        pending.push({
          batchId,
          actionId: candidate.actionId,
          key,
          expectedHash: expected === null ? null : await valueDigest(expected),
          sourceAnswerIds: candidate.sourceAnswerIds,
          transformation: candidate.transformation.kind,
          transformationHash: hash(candidate.transformation.explanation),
          navigation: candidate.type === 'next_page',
        });
      }
      if (entries.length && !reviews.some((review) => review.elementId === null)) {
        const first = entries[0]!;
        const verifications =
          entries.length === 1
            ? [
                await this.verifier.verify(
                  first.action,
                  first.control,
                  first.sources,
                  request.observation,
                  document,
                ),
              ]
            : await this.verifier.verifySection(entries, request.observation, document);
        if (verifications.length !== entries.length)
          throw new ApiError(502, 'invalid_verification');
        verifications.forEach((verification, index) => {
          if (!verification.approved) reject(entries[index]!.action.elementId, verification.reason);
        });
      }
      const approvedIndices = batches.flatMap((batch, index) =>
        reviews.some(
          (review) => review.elementId === null || review.elementId === batch.action.elementId,
        )
          ? []
          : [index],
      );
      planning.value.view.reviews = [...planning.value.view.reviews, ...reviews].slice(0, 100);
      if (!approvedIndices.length) {
        planning.value.view.status = 'human_input';
        return { job: await this.save(planning.partition, planning), batch: null };
      }
      const approvedPending = approvedIndices.map((index) => pending[index]!);
      const approvedBatches = approvedIndices.map((index) => batches[index]!);
      planning.value.pending = approvedPending[0]!;
      planning.value.queued = approvedPending.slice(1);
      planning.value.view.status = 'executing';
      return {
        job: await this.save(planning.partition, planning),
        batch: approvedBatches[0]!,
        ...(approvedBatches.length > 1 ? { followingBatches: approvedBatches.slice(1) } : {}),
      };
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      planning.value.view.status = 'paused';
      planning.value.pending = null;
      planning.value.queued = [];
      await this.save(planning.partition, planning);
      throw error;
    }
  }

  public async chat(jobId: string, token: string, input: unknown): Promise<MappingChatResponse> {
    const request = MappingChatRequestSchema.parse(input);
    const record = await this.authorized(jobId, token);
    const value = record.value;
    if (request.revision !== value.view.revision || value.view.status !== 'paused')
      throw new ConflictError('pause_before_chat');
    const problem = validatePageBinding(request.observation, value.view.binding);
    if (problem) throw new ApiError(409, problem);
    if (!request.observation.screenshot) throw new ApiError(400, 'screenshot_required');
    if (!this.mapper.discussMapping) throw new ApiError(503, 'chat_unavailable');
    // Claim a revision without persisting chat text, source answers or screenshots.
    await this.save(record.partition, record);
    const source = await this.sources.read(value.miaOrigin, value.sourceToken, value.sourceFormat);
    if (
      source.tenantId !== value.view.binding.tenantId ||
      source.userId !== value.view.binding.userId ||
      source.quoteId !== value.view.binding.quoteId
    )
      throw new ApiError(403, 'source_binding_mismatch');
    if (source.revision !== value.sourceRevision || source.sourceFormat !== value.sourceFormat)
      throw new ApiError(409, 'source_changed');
    const document = await this.document(jobId, value);
    const response = MappingChatReplySchema.parse(
      await this.mapper.discussMapping({
        page: request.observation,
        source,
        ...(document ? { document } : {}),
        conversation: request.conversation,
        recentResults: value.recentResults,
      }),
    );
    const latest = await this.authorized(jobId, token);
    if (latest.value.view.revision !== value.view.revision || latest.value.view.status !== 'paused')
      throw new ConflictError('chat_interrupted');
    return { job: await this.save(latest.partition, latest), response };
  }

  public async receipt(jobId: string, token: string, input: unknown): Promise<JobView> {
    const request = ReceiptRequestSchema.parse(input);
    const record = await this.authorized(jobId, token);
    const value = record.value;
    if (request.batchId === value.lastBatchId) return JobViewSchema.parse(value.view);
    if (
      request.revision !== value.view.revision ||
      value.view.status !== 'executing' ||
      value.pending?.batchId !== request.batchId ||
      value.pending.actionId !== request.receipt.actionId
    )
      throw new ConflictError('receipt_conflict');
    const pending = value.pending;
    const result = request.receipt;
    const reobserve =
      value.wholePage === true && result.status === 'blocked' && result.reason === 'page_changed';
    if (!reobserve) {
      value.attempts[pending.key] = (value.attempts[pending.key] ?? 0) + 1;
      value.actionCount += 1;
    }
    const success =
      pending.expectedHash === null
        ? result.status === 'executed'
        : ['verified', 'already_correct'].includes(result.status) &&
          result.observedHash === pending.expectedHash;
    value.recentResults = [
      ...value.recentResults.slice(-9),
      success || reobserve ? result : { ...result, status: 'failed', reason: 'read_back_mismatch' },
    ];
    value.audit = [
      ...value.audit.slice(-149),
      {
        ...pending,
        status: success ? 'verified' : reobserve ? 'page_changed' : 'failed',
        observedHash: result.observedHash,
        sourceRevision: value.sourceRevision,
      },
    ];
    if (success && pending.expectedHash !== null) {
      value.view.verified += 1;
      value.verifiedControls = [...new Set([...value.verifiedControls, pending.key])].slice(-400);
    } else if (!success && !reobserve) value.view.failed += 1;
    value.lastBatchId = request.batchId;
    if (!success) value.queued = [];
    value.pending = value.queued?.shift() ?? null;
    value.expectedNavigation = success && pending.navigation === true;
    value.reobserve = reobserve;
    value.view.status =
      result.status === 'blocked' && !value.reobserve
        ? 'paused'
        : value.pending
          ? 'executing'
          : 'running';
    return this.save(record.partition, record);
  }
}
