import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  actionExpectedValue,
  carrierOriginAllowed,
  evaluateActiveTabAction,
  pageReadyToAdvance,
  validatePageBinding,
  valueDigest,
} from '@smartmapper/automation-core/active-tab';
import {
  compileRegistryPage,
  stableTargetSignature,
  capturedPageSignatureMatches,
} from '@smartmapper/automation-core/registry';
import {
  JobViewSchema,
  MappingLineOfBusinessSchema,
  ObserveRequestSchema,
  ReceiptRequestSchema,
  StartJobSchema,
  type ActionBatch,
  type FieldReview,
  type JobView,
  type MappingProfile,
  type ObserveResponse,
  type SourceAnswer,
  type SourceAnswers,
} from '@smartmapper/contracts';
import type { ActiveTabSourceProvider } from '@smartmapper/mia-client';
import {
  ConflictError,
  type CheckpointStore,
  type PendingAction,
  type StoredCheckpoint,
} from './checkpoints.js';
import { JobDiagnostics } from './diagnostics.js';
import type { MappingRegistryStore, MappingScope } from './mapping-registry.js';

export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

function pathMatchesBase(pageUrl: URL, baseUrl: string): boolean {
  const base = new URL(baseUrl);
  if (pageUrl.origin !== base.origin) return false;
  const path = base.pathname.replace(/\/+$/, '') || '/';
  return path === '/' || pageUrl.pathname === path || pageUrl.pathname.startsWith(`${path}/`);
}

function baseSpecificity(baseUrl: string): number {
  return (new URL(baseUrl).pathname.replace(/\/+$/, '') || '/').length;
}

function policyReviewReason(reason: string): FieldReview['reason'] {
  switch (reason) {
    case 'page_changed':
    case 'control_missing':
      return 'changed_target';
    case 'unknown_option':
      return 'changed_options';
    case 'authentication_required':
    case 'human_only':
      return 'human_only';
    case 'missing_source':
    case 'missing_provenance':
    case 'duplicate_source':
      return 'missing_source';
    default:
      return 'unsupported_control';
  }
}

const skippableReviewReasons = new Set<FieldReview['reason']>([
  'missing_source',
  'missing_mapping',
  'missing_question_context',
  'ambiguous_match',
  'read_back_mismatch',
  'unsupported_control',
  'changed_target',
  'changed_options',
  'source_mismatch',
  'retry_limit',
]);

export interface ServiceAccess {
  miaOrigins: ReadonlySet<string>;
  carrierOrigins: ReadonlySet<string>;
  allowAnyCarrier?: boolean;
  principals: ReadonlySet<string>;
  autoNext?: boolean;
}

export class ActiveTabJobService {
  public constructor(
    private readonly store: CheckpointStore,
    private readonly sources: ActiveTabSourceProvider,
    private readonly registry: MappingRegistryStore,
    private readonly access: ServiceAccess,
    public readonly diagnostics = new JobDiagnostics(),
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
      !this.access.principals.has(`${binding.tenantId}/${binding.userId}`) ||
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

  private scope(source: SourceAnswers, carrierOrigin: string): MappingScope {
    return {
      tenantId: source.tenantId,
      carrierOrigin,
      lineOfBusiness: MappingLineOfBusinessSchema.parse(source.formType.toLowerCase()),
    };
  }

  public async start(input: unknown): Promise<{ job: JobView; token: string }> {
    const request = StartJobSchema.parse(input);
    const carrierPage = new URL(request.carrierPageUrl);
    if (
      !this.access.miaOrigins.has(request.miaOrigin) ||
      carrierPage.origin !== request.carrierOrigin ||
      !carrierOriginAllowed(
        request.carrierOrigin,
        this.access.carrierOrigins,
        this.access.allowAnyCarrier,
      )
    )
      throw new ApiError(403, 'origin_not_allowed');
    const grant = await this.diagnostics.stage('authorize', (signal) =>
      this.sources.redeem(request, signal),
    );
    const binding = grant.binding;
    if (
      !this.access.principals.has(`${binding.tenantId}/${binding.userId}`) ||
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
    let mapping: MappingProfile | null;
    try {
      const scope = this.scope(grant.source, request.carrierOrigin);
      if (request.mappingSelection)
        mapping = await this.registry.get(
          scope,
          request.mappingSelection.mappingId,
          request.mappingSelection.mappingVersion,
        );
      else {
        const active = (await this.registry.list(scope)).filter(
          (profile) =>
            profile.status === 'active' &&
            pathMatchesBase(carrierPage, profile.workflow.carrierBaseUrl),
        );
        if (!active.length) throw new ApiError(409, 'mapping_not_trained');
        const specificity = Math.max(
          ...active.map((profile) => baseSpecificity(profile.workflow.carrierBaseUrl)),
        );
        const best = active.filter(
          (profile) => baseSpecificity(profile.workflow.carrierBaseUrl) === specificity,
        );
        if (best.length !== 1) throw new ApiError(409, 'mapping_workflow_ambiguous');
        mapping = best[0]!;
      }
      if (request.mappingSelection) {
        if (!mapping) throw new ApiError(409, 'mapping_selection_unavailable');
        if (!['preview', 'testable', 'verified', 'active'].includes(mapping.status))
          throw new ApiError(409, 'mapping_not_testable');
        if (!pathMatchesBase(carrierPage, mapping.workflow.carrierBaseUrl))
          throw new ApiError(409, 'mapping_carrier_mismatch');
        if (mapping.preview && mapping.createdByUserId !== binding.userId)
          throw new ApiError(409, 'preview_owner_changed');
        if (mapping.preview && mapping.preview.tabId !== binding.tabId)
          throw new ApiError(409, 'preview_tab_changed');
      }
    } catch (error) {
      await this.sources.revoke(request.miaOrigin, grant.sourceToken).catch(() => undefined);
      throw error;
    }
    const partition = hash([binding.tenantId, binding.userId, binding.carrierOrigin].join('\0'));
    const token = `${partition}.${randomBytes(32).toString('base64url')}`;
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
      mappingId: mapping?.mappingId ?? null,
      mappingVersion: mapping?.mappingVersion ?? null,
      completedMappingPageIds: [],
      verifiedMappingFieldIds: [],
      verifiedMappingWorkflowControlIds: [],
      localFieldEvidence: [],
      page: null,
      attempts: {},
      verifiedControls: [],
      recentResults: [],
      audit: [],
      actionCount: 0,
      lastFingerprint: '',
      unchangedCount: 0,
      pending: null,
      queued: [],
      lastBatchId: null,
      plannedControls: [],
      skippedControls: [],
    });
    this.diagnostics.bind(view.jobId);
    return { job: view, token };
  }

  public async read(jobId: string, token: string): Promise<JobView> {
    return JobViewSchema.parse((await this.authorized(jobId, token)).value.view);
  }

  public async diagnosticEvents(jobId: string, token: string) {
    await this.authorized(jobId, token);
    return { events: this.diagnostics.events(jobId) };
  }

  public async pause(jobId: string, token: string): Promise<JobView> {
    const record = await this.authorized(jobId, token);
    if (
      record.value.view.status === 'paused' &&
      !record.value.pending &&
      !record.value.queued?.length
    )
      return JobViewSchema.parse(record.value.view);
    record.value.view.status = 'paused';
    record.value.pending = null;
    record.value.queued = [];
    record.value.expectedNavigation = false;
    return this.save(record.partition, record);
  }

  public async cancel(jobId: string, token: string): Promise<void> {
    const record = await this.authorized(jobId, token);
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

  private async stillVerified(
    batch: ActionBatch,
    observation: ReturnType<typeof ObserveRequestSchema.parse>['observation'],
    checkpoint: StoredCheckpoint['value'],
  ): Promise<boolean> {
    const control = observation.controls.find(
      (candidate) => candidate.elementId === batch.action.elementId,
    );
    if (!control || !checkpoint.verifiedControls.includes(control.key)) return false;
    const expected = actionExpectedValue(batch.action);
    if (expected === null) return false;
    const observed =
      ['checkbox', 'radio'].includes(control.inputType) ||
      ['checkbox', 'radio'].includes(control.role)
        ? control.checked
        : control.value;
    return (await valueDigest(observed)) === (await valueDigest(expected));
  }

  public async observe(jobId: string, token: string, input: unknown): Promise<ObserveResponse> {
    const request = ObserveRequestSchema.parse(input);
    const record = await this.authorized(jobId, token);
    const value = record.value;
    if (request.revision !== value.view.revision)
      throw new ConflictError('revision_conflict', request.revision, value.view.revision);
    const bindingProblem = validatePageBinding(request.observation, value.view.binding);
    if (bindingProblem) throw new ApiError(409, bindingProblem);
    const pageChanged =
      value.page !== null &&
      (value.page.documentId !== request.observation.documentId ||
        value.page.routeId !== request.observation.routeId);
    const advanced =
      value.expectedNavigation === true &&
      (pageChanged || value.lastFingerprint !== request.observation.fingerprint);
    if (request.skipElementId) {
      const skippedReview = value.view.reviews.find(
        (review) => review.elementId === request.skipElementId,
      );
      const skippedControl = request.observation.controls.find(
        (control) => control.elementId === request.skipElementId,
      );
      if (
        !request.resume ||
        value.view.status !== 'human_input' ||
        pageChanged ||
        !skippedReview ||
        !skippableReviewReasons.has(skippedReview.reason) ||
        !skippedControl
      )
        throw new ApiError(409, 'field_skip_not_allowed');
      const shape = await stableTargetSignature(skippedControl);
      value.skippedControls = [
        ...(value.skippedControls ?? []).filter(
          (item) => !(item.routeId === request.observation.routeId && item.shape === shape),
        ),
        {
          key: skippedControl.key,
          shape,
          routeId: request.observation.routeId,
          sourceRevision: value.sourceRevision,
          reason: skippedReview.reason,
        },
      ].slice(-400);
    }
    if (value.pendingWorkflowProof?.kind === 'ordinary_next') {
      if (advanced)
        value.verifiedMappingWorkflowControlIds = [
          ...new Set([
            ...(value.verifiedMappingWorkflowControlIds ?? []),
            value.pendingWorkflowProof.workflowControlId,
          ]),
        ];
      delete value.pendingWorkflowProof;
    }
    if (
      !request.resume &&
      ((pageChanged && !advanced) ||
        (value.expectedNavigation && !advanced) ||
        !['ready', 'running'].includes(value.view.status))
    ) {
      value.view.status = 'paused';
      value.pending = null;
      value.queued = [];
      return { job: await this.save(record.partition, record), batch: null };
    }
    if (pageChanged || advanced) {
      value.attempts = {};
      value.verifiedControls = [];
      value.recentResults = [];
      value.pagePasses = 0;
      value.plannedControls = [];
      value.skippedControls = [];
    }
    if (advanced) value.completedPages = (value.completedPages ?? 0) + 1;
    value.expectedNavigation = false;
    value.page = {
      documentId: request.observation.documentId,
      routeId: request.observation.routeId,
    };
    value.lastFingerprint = request.observation.fingerprint;
    value.pending = null;
    value.queued = [];
    value.view.status = 'planning';
    value.view.reviews = [];
    await this.save(record.partition, record);
    const planning = await this.authorized(jobId, token);
    try {
      const source = await this.diagnostics.stage('source', (signal) =>
        this.sources.read(value.miaOrigin, value.sourceToken, signal),
      );
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
      const scope = this.scope(source, value.view.binding.carrierOrigin);
      const candidates = planning.value.mappingId
        ? [
            await this.registry.get(
              scope,
              planning.value.mappingId,
              planning.value.mappingVersion ?? undefined,
            ),
          ].filter((profile) => profile !== null)
        : (await this.registry.list(scope)).filter((profile) => profile.status === 'active');
      if (!candidates.length || candidates.some((profile) => profile.status === 'archived'))
        throw new ApiError(409, 'mapping_unavailable');
      const preview = candidates.find((profile) => profile.preview);
      if (
        preview &&
        (preview.pages[0]?.routeId !== request.observation.routeId ||
          !(await capturedPageSignatureMatches(
            request.observation,
            preview.pages[0].signature,
            preview.pages[0].fields.map((field) => field.target),
          )))
      )
        throw new ApiError(409, 'preview_page_changed');
      const proposals = await this.diagnostics.stage('plan', () =>
        Promise.all(
          candidates.map(async (profile) => ({
            profile,
            compiled: await compileRegistryPage(profile, request.observation, source),
          })),
        ),
      );
      const viable = proposals.filter((proposal) => proposal.compiled.mappingPage !== null);
      const selected =
        candidates.length === 1 ? proposals[0]! : viable.length === 1 ? viable[0]! : null;
      if (!selected) throw new ApiError(409, 'mapping_workflow_ambiguous');
      const { profile: mapping, compiled } = selected;
      planning.value.mappingId = mapping.mappingId;
      planning.value.mappingVersion = mapping.mappingVersion;
      const workflowProof = planning.value.pendingWorkflowProof;
      if (workflowProof?.kind === 'add_entity') {
        const expectedField = compiled.mappingPage?.fields.find(
          (field) => field.fieldId === workflowProof.expectedMappingFieldId,
        );
        let targetObserved = false;
        if (expectedField && request.observation.fingerprint !== workflowProof.beforeFingerprint) {
          const matching: typeof request.observation.controls = [];
          for (const control of request.observation.controls)
            if ((await stableTargetSignature(control)) === expectedField.target.signature)
              matching.push(control);
          targetObserved = matching[expectedField.target.occurrence] !== undefined;
        }
        if (targetObserved)
          planning.value.verifiedMappingWorkflowControlIds = [
            ...new Set([
              ...(planning.value.verifiedMappingWorkflowControlIds ?? []),
              workflowProof.workflowControlId,
            ]),
          ];
        delete planning.value.pendingWorkflowProof;
      }
      const skippedElementIds = new Set<string>();
      for (const control of request.observation.controls) {
        const candidates = (planning.value.skippedControls ?? []).filter(
          (item) =>
            item.routeId === request.observation.routeId &&
            item.sourceRevision === planning.value.sourceRevision &&
            item.key === control.key,
        );
        const shape = candidates.length ? await stableTargetSignature(control) : null;
        if (shape && candidates.some((item) => item.shape === shape))
          skippedElementIds.add(control.elementId);
      }
      planning.value.view.reviews = compiled.reviews.filter(
        (review) => !review.elementId || !skippedElementIds.has(review.elementId),
      );
      for (const evidence of compiled.locallyVerifiedFields) {
        if (skippedElementIds.has(evidence.elementId)) continue;
        const control = request.observation.controls.find(
          (candidate) => candidate.elementId === evidence.elementId,
        );
        if (!control) continue;
        const observed =
          ['checkbox', 'radio'].includes(control.inputType) ||
          ['checkbox', 'radio'].includes(control.role)
            ? control.checked
            : control.value;
        const localEvidence = {
          mappingFieldId: evidence.mappingFieldId,
          key: control.key,
          observedHash: await valueDigest(observed),
          kind: evidence.kind,
          sourceRevision: planning.value.sourceRevision,
        };
        planning.value.localFieldEvidence = [
          ...(planning.value.localFieldEvidence ?? []).filter(
            (item) => item.mappingFieldId !== evidence.mappingFieldId,
          ),
          localEvidence,
        ].slice(-400);
        planning.value.verifiedMappingFieldIds = [
          ...new Set([...(planning.value.verifiedMappingFieldIds ?? []), evidence.mappingFieldId]),
        ];
      }
      const batches: ActionBatch[] = [];
      const pending: PendingAction[] = [];
      const synthetic = new Map<string, SourceAnswer>();
      for (const item of compiled.actions)
        for (const answer of item.sources) synthetic.set(answer.answerId, answer);
      const policySource: SourceAnswers = {
        ...source,
        answers: [
          ...source.answers,
          ...[...synthetic.values()].filter(
            (answer) =>
              !source.answers.some((sourceAnswer) => sourceAnswer.answerId === answer.answerId),
          ),
        ],
      };
      for (const item of compiled.actions) {
        if (item.action.elementId && skippedElementIds.has(item.action.elementId)) continue;
        const provisional: ActionBatch = {
          batchId: randomUUID(),
          action: item.action,
          sources: item.sources,
        };
        if (await this.stillVerified(provisional, request.observation, planning.value)) continue;
        const policy = evaluateActiveTabAction(item.action, request.observation, policySource);
        if (!policy.allowed) {
          planning.value.view.reviews.push({
            elementId: item.action.elementId,
            question: 'Carrier field needs review',
            entity: '',
            reason: policyReviewReason(policy.reason),
          });
          continue;
        }
        const control = policy.control;
        const key = control?.key ?? '__page__';
        if ((planning.value.attempts[key] ?? 0) >= 3) {
          planning.value.view.reviews.push({
            elementId: item.action.elementId,
            question: 'Carrier field needs review',
            entity: '',
            reason: 'retry_limit',
          });
          continue;
        }
        const expected = actionExpectedValue(item.action);
        const batchId = provisional.batchId;
        batches.push({ batchId, action: item.action, sources: policy.sources });
        pending.push({
          batchId,
          actionId: item.action.actionId,
          elementId: item.action.elementId,
          key,
          expectedHash: expected === null ? null : await valueDigest(expected),
          sourceAnswerIds: item.action.sourceAnswerIds,
          transformation: item.action.transformation.kind,
          transformationHash: hash(item.action.transformation.explanation),
          actionType: item.action.type,
          navigation: false,
          mappingFieldId: item.mappingFieldId,
          ...(compiled.mappingPage ? { mappingPageId: compiled.mappingPage.pageId } : {}),
        });
      }
      planning.value.view.reviews = planning.value.view.reviews.slice(0, 100);
      const reasons = new Map<FieldReview['reason'], number>();
      for (const review of planning.value.view.reviews)
        reasons.set(review.reason, (reasons.get(review.reason) ?? 0) + 1);
      this.diagnostics.emit(
        'plan',
        'info',
        0,
        {
          controls: request.observation.controls.length,
          trainedFields: compiled.mappingPage?.fields.length ?? 0,
          matchedFields: compiled.recognizedControlIds.length,
          actions: batches.length,
          reviews: planning.value.view.reviews.length,
        },
        undefined,
        { reviewReasons: [...reasons].map(([reason, count]) => ({ reason, count })) },
      );
      if (!batches.length) {
        const expandable = compiled.missingTargets.find((missing) => {
          const limit = mapping.entityLimits.find((candidate) =>
            missing.sourcePathPatterns.some((pattern) => {
              const family = candidate.sourcePattern.split('*')[0] ?? '';
              return !!family && pattern.startsWith(family);
            }),
          );
          return !!limit && missing.repeatIndex < limit.maximumCount;
        });
        if (expandable && compiled.mappingPage && !mapping.preview) {
          const limit = mapping.entityLimits.find((candidate) =>
            expandable.sourcePathPatterns.some((pattern) => {
              const family = candidate.sourcePattern.split('*')[0] ?? '';
              return !!family && pattern.startsWith(family);
            }),
          );
          const trainedAdd = compiled.mappingPage.workflowControls.find(
            (control) => control.kind === 'add_entity' && control.entityType === limit?.entityType,
          );
          if (trainedAdd) {
            const matching = [];
            for (const control of request.observation.controls)
              if ((await stableTargetSignature(control)) === trainedAdd.target.signature)
                matching.push(control);
            const addControl = matching[trainedAdd.target.occurrence];
            const sources = expandable.sourceAnswerIds
              .map((answerId) => source.answers.find((answer) => answer.answerId === answerId))
              .filter(
                (answer): answer is SourceAnswer =>
                  !!answer && answer.status === 'answered' && answer.value !== null,
              );
            if (
              addControl &&
              !addControl.disabled &&
              sources.length &&
              (planning.value.attempts[addControl.key] ?? 0) < (limit?.maximumCount ?? 0)
            ) {
              const action = {
                version: '2.0' as const,
                actionId: randomUUID(),
                type: 'click' as const,
                pageStateId: request.observation.pageStateId,
                elementId: addControl.elementId,
                sourceAnswerIds: sources.map((answer) => answer.answerId),
                value: null,
                checked: null,
                key: null,
                purpose: 'add_entity' as const,
                direction: null,
                milliseconds: null,
                transformation: {
                  kind: 'identity' as const,
                  explanation: `Trained bounded add ${limit?.entityType ?? 'entity'} control.`,
                },
                confidence: 1,
              };
              const policy = evaluateActiveTabAction(action, request.observation, source);
              if (policy.allowed) {
                const batchId = randomUUID();
                planning.value.pending = {
                  batchId,
                  actionId: action.actionId,
                  elementId: action.elementId,
                  key: addControl.key,
                  expectedHash: null,
                  sourceAnswerIds: action.sourceAnswerIds,
                  transformation: 'identity',
                  transformationHash: hash(action.transformation.explanation),
                  actionType: 'click',
                  navigation: false,
                  mappingPageId: compiled.mappingPage.pageId,
                  mappingWorkflowControlId: trainedAdd.workflowControlId,
                  mappingWorkflowControlKind: 'add_entity',
                  expectedMappingFieldId: expandable.mappingFieldId,
                };
                planning.value.view.status = 'executing';
                return {
                  job: await this.save(planning.partition, planning),
                  batch: { batchId, action, sources: policy.sources },
                };
              }
            }
          }
          planning.value.view.reviews.push({
            elementId: null,
            question: 'A repeated carrier row could not be added',
            entity: limit?.entityType ?? '',
            reason: expandable.sourceAnswerIds.some((answerId) =>
              source.answers.some(
                (answer) =>
                  answer.answerId === answerId &&
                  answer.status === 'answered' &&
                  answer.value !== null,
              ),
            )
              ? 'changed_target'
              : 'missing_source',
          });
        }
        const clean =
          !planning.value.view.reviews.length && pageReadyToAdvance(request.observation);
        if (clean && compiled.mappingPage)
          planning.value.completedMappingPageIds = [
            ...new Set([
              ...(planning.value.completedMappingPageIds ?? []),
              compiled.mappingPage.pageId,
            ]),
          ];
        const mappedNext = compiled.mappingPage?.workflowControls.filter(
          (control) => control.kind === 'ordinary_next',
        );
        if (
          clean &&
          this.access.autoNext &&
          !mapping.preview &&
          mappedNext?.length === 1 &&
          (value.completedPages ?? 0) < 20
        ) {
          const descriptor = mappedNext[0]!;
          const matching = [];
          for (const control of request.observation.controls)
            if ((await stableTargetSignature(control)) === descriptor.target.signature)
              matching.push(control);
          const next = matching[descriptor.target.occurrence];
          if (next?.ordinaryNext && !next.disabled) {
            const action = {
              version: '2.0' as const,
              actionId: randomUUID(),
              type: 'next_page' as const,
              pageStateId: request.observation.pageStateId,
              elementId: next.elementId,
              sourceAnswerIds: [],
              value: null,
              checked: null,
              key: null,
              purpose: null,
              direction: null,
              milliseconds: null,
              transformation: {
                kind: 'identity' as const,
                explanation: 'Trained ordinary Next/Continue after clean local review.',
              },
              confidence: 1,
            };
            const policy = evaluateActiveTabAction(action, request.observation, source);
            if (policy.allowed) {
              const batchId = randomUUID();
              planning.value.pending = {
                batchId,
                actionId: action.actionId,
                elementId: action.elementId,
                key: next.key,
                expectedHash: null,
                sourceAnswerIds: [],
                transformation: 'identity',
                transformationHash: hash(action.transformation.explanation),
                actionType: 'next_page',
                navigation: true,
                mappingWorkflowControlId: descriptor.workflowControlId,
                mappingWorkflowControlKind: 'ordinary_next',
                ...(compiled.mappingPage ? { mappingPageId: compiled.mappingPage.pageId } : {}),
              };
              planning.value.view.status = 'executing';
              return {
                job: await this.save(planning.partition, planning),
                batch: { batchId, action, sources: [] },
              };
            }
          }
        }
        planning.value.view.status = planning.value.view.reviews.length
          ? 'human_input'
          : 'page_complete';
        return { job: await this.save(planning.partition, planning), batch: null };
      }
      planning.value.pending = pending[0]!;
      planning.value.queued = pending.slice(1);
      planning.value.view.status = 'executing';
      return {
        job: await this.save(planning.partition, planning),
        batch: batches[0]!,
        ...(batches.length > 1 ? { followingBatches: batches.slice(1) } : {}),
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
      throw new ConflictError('receipt_conflict', request.revision, value.view.revision);
    const pending = value.pending;
    const result = request.receipt;
    this.diagnostics.emit('read_back', 'info', 0, undefined, undefined, {
      targetKey: /^[a-f0-9]{64}$/.test(pending.key) ? pending.key : hash(pending.key),
      actionType: pending.actionType,
      receiptStatus: result.status,
      receiptReason: result.reason,
    });
    value.attempts[pending.key] = (value.attempts[pending.key] ?? 0) + 1;
    value.actionCount += 1;
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
      if (pending.mappingFieldId)
        value.verifiedMappingFieldIds = [
          ...new Set([...(value.verifiedMappingFieldIds ?? []), pending.mappingFieldId]),
        ];
    }
    if (success && pending.mappingWorkflowControlId && pending.mappingWorkflowControlKind)
      value.pendingWorkflowProof = {
        workflowControlId: pending.mappingWorkflowControlId,
        kind: pending.mappingWorkflowControlKind,
        beforeFingerprint: value.lastFingerprint,
        ...(pending.expectedMappingFieldId
          ? { expectedMappingFieldId: pending.expectedMappingFieldId }
          : {}),
      };
    if (!success) {
      value.view.failed += 1;
      value.view.reviews.push({
        elementId: pending.elementId ?? null,
        question: 'Carrier field needs review',
        entity: '',
        reason:
          result.reason === 'page_changed' || result.reason === 'tab_changed'
            ? 'page_changed'
            : result.reason === 'validation_error'
              ? 'validation_error'
              : 'read_back_mismatch',
      });
    }
    value.lastBatchId = request.batchId;
    value.pending = value.queued?.shift() ?? null;
    value.expectedNavigation = success && pending.navigation === true;
    value.view.status = value.pending
      ? 'executing'
      : value.view.reviews.length
        ? 'human_input'
        : 'running';
    return this.save(record.partition, record);
  }
}
