import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type { AiMapperProvider } from '@smartmapper/ai-mapper';
import {
  actionExpectedValue,
  changesAnswer,
  controlIsHumanOnly,
  directRepresentationMatches,
  evaluateActiveTabAction,
  validatePageBinding,
  valueDigest,
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
  type JobView,
  type ObserveResponse,
  type SmartMapperObservation,
  type SmartMapperPlan,
} from '@smartmapper/contracts';
import type { ActiveTabSourceProvider } from '@smartmapper/mia-client';

import { ConflictError, type CheckpointStore, type StoredCheckpoint } from './checkpoints.js';

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

export interface ServiceAccess {
  miaOrigins: ReadonlySet<string>;
  carrierOrigins: ReadonlySet<string>;
  principals: ReadonlySet<string>;
}

export class ActiveTabJobService {
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
      !this.access.carrierOrigins.has(binding.carrierOrigin) ||
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
      !this.access.carrierOrigins.has(request.carrierOrigin)
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
      grant.source.quoteId !== binding.quoteId
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
    return { job: view, token };
  }

  public async read(jobId: string, token: string): Promise<JobView> {
    return JobViewSchema.parse((await this.authorized(jobId, token)).value.view);
  }

  public async pause(jobId: string, token: string): Promise<JobView> {
    const record = await this.authorized(jobId, token);
    record.value.view.status = 'paused';
    record.value.pending = null;
    return this.save(record.partition, record);
  }

  public async cancel(jobId: string, token: string): Promise<void> {
    const record = await this.authorized(jobId, token);
    record.value.view.status = 'blocked';
    record.value.pending = null;
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
    if (!request.resume && (pageChanged || !['ready', 'running'].includes(value.view.status))) {
      value.view.status = 'paused';
      value.pending = null;
      return { job: await this.save(record.partition, record), batch: null };
    }
    if (pageChanged) {
      value.attempts = {};
      value.verifiedControls = [];
      value.actionCount = 0;
      value.unchangedCount = 0;
      value.recentResults = [];
    }
    value.page = {
      documentId: request.observation.documentId,
      routeId: request.observation.routeId,
    };
    value.unchangedCount =
      value.lastFingerprint === request.observation.fingerprint ? value.unchangedCount + 1 : 0;
    value.lastFingerprint = request.observation.fingerprint;
    value.pending = null;
    value.view.reviews = [];
    if (value.actionCount >= 150 || value.unchangedCount >= 12) {
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
      const source = await this.sources.read(value.miaOrigin, value.sourceToken);
      if (
        source.tenantId !== value.view.binding.tenantId ||
        source.userId !== value.view.binding.userId ||
        source.quoteId !== value.view.binding.quoteId
      )
        throw new ApiError(403, 'source_binding_mismatch');
      if (source.revision !== value.sourceRevision) {
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
      const proposal = SmartMapperPlanSchema.parse(
        await this.mapper.proposeMappings({
          page: request.observation,
          source,
          attempts: value.attempts,
          recentResults: value.recentResults,
          verifiedControls: value.verifiedControls,
          conversation: request.conversation,
        }),
      );
      if (
        proposal.pageStateId !== request.observation.pageStateId ||
        (proposal.outcome === 'act') !== (proposal.actions.length === 1)
      )
        throw new ApiError(502, 'invalid_plan');
      // Page-derived text never enters durable checkpoints.
      planning.value.view.reviews = proposal.reviews.map((item) => ({
        ...item,
        question: 'Field needs review',
        entity: '',
      }));
      const action = proposal.actions[0];
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
          if ((control.required && empty) || control.errors.length) {
            if (!planning.value.view.reviews.some((item) => item.elementId === control.elementId))
              planning.value.view.reviews.push({
                elementId: control.elementId,
                question: 'Field needs review',
                entity: '',
                reason: control.errors.length ? 'validation_error' : 'missing_source',
              });
          }
        }
        planning.value.view.reviews = planning.value.view.reviews.slice(0, 98);
        planning.value.view.status =
          proposal.outcome === 'page_complete' &&
          !proposal.reviews.length &&
          !request.observation.unsupportedFrames &&
          !request.observation.omittedControls &&
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
        return { job: await this.save(planning.partition, planning), batch: null };
      }
      const policy = evaluateActiveTabAction(action, request.observation, source);
      const key = policy.allowed && policy.control ? policy.control.key : '__page__';
      const exhausted = (value.attempts[key] ?? 0) >= 5;
      const preservesFacts =
        policy.allowed &&
        (!changesAnswer(action) ||
          (policy.control !== undefined &&
            directRepresentationMatches(action, policy.sources) &&
            (await this.verifier.verify(action, policy.control, policy.sources))));
      if (!policy.allowed || exhausted || !preservesFacts) {
        planning.value.view.status = 'human_input';
        planning.value.view.reviews.push({
          elementId: action.elementId,
          question: 'Field needs review',
          entity: '',
          reason: exhausted ? 'retry_limit' : 'source_mismatch',
        });
        return { job: await this.save(planning.partition, planning), batch: null };
      }
      const expected = actionExpectedValue(action);
      const batchId = randomUUID();
      planning.value.pending = {
        batchId,
        actionId: action.actionId,
        key,
        expectedHash: expected === null ? null : await valueDigest(expected),
        sourceAnswerIds: action.sourceAnswerIds,
        transformation: action.transformation.kind,
        transformationHash: hash(action.transformation.explanation),
      };
      planning.value.attempts[key] = (value.attempts[key] ?? 0) + 1;
      planning.value.actionCount += 1;
      planning.value.view.status = 'executing';
      return {
        job: await this.save(planning.partition, planning),
        batch: { batchId, action, sources: policy.sources },
      };
    } catch (error) {
      if (error instanceof ConflictError) throw error;
      planning.value.view.status = 'paused';
      planning.value.pending = null;
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
    const source = await this.sources.read(value.miaOrigin, value.sourceToken);
    if (
      source.tenantId !== value.view.binding.tenantId ||
      source.userId !== value.view.binding.userId ||
      source.quoteId !== value.view.binding.quoteId
    )
      throw new ApiError(403, 'source_binding_mismatch');
    if (source.revision !== value.sourceRevision) throw new ApiError(409, 'source_changed');
    const response = MappingChatReplySchema.parse(
      await this.mapper.discussMapping({
        page: request.observation,
        source,
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
    const success =
      pending.expectedHash === null
        ? result.status === 'executed'
        : ['verified', 'already_correct'].includes(result.status) &&
          result.observedHash === pending.expectedHash;
    value.recentResults = [
      ...value.recentResults.slice(-9),
      success ? result : { ...result, status: 'failed', reason: 'read_back_mismatch' },
    ];
    value.audit = [
      ...value.audit.slice(-149),
      {
        ...pending,
        status: success ? 'verified' : 'failed',
        observedHash: result.observedHash,
        sourceRevision: value.sourceRevision,
      },
    ];
    if (success && pending.expectedHash !== null) {
      value.view.verified += 1;
      value.verifiedControls = [...new Set([...value.verifiedControls, pending.key])].slice(-400);
    } else if (!success) value.view.failed += 1;
    value.view.status = ['blocked'].includes(result.status) ? 'paused' : 'running';
    value.lastBatchId = request.batchId;
    value.pending = null;
    return this.save(record.partition, record);
  }
}
