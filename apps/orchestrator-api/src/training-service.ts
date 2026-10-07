import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { DefaultAzureCredential } from '@azure/identity';
import { TableClient } from '@azure/data-tables';
import {
  CaptureTrainingPageRequestSchema,
  OpenSavedMappingRequestSchema,
  RecoverTrainingDraftRequestSchema,
  ActivateMappingRequestSchema,
  PublishTrainingSessionRequestSchema,
  SaveTrainingPageRequestSchema,
  StartTrainingSessionSchema,
  TrainingPageSchema,
  TrainingSessionViewSchema,
  TrainingLibraryResponseSchema,
  VerifyMappingRequestSchema,
  type MappingDisposition,
  type MappingProfile,
  type MiaFieldCatalog,
  type TrainingControlSnapshot,
  type TrainingField,
  type TrainingPage,
  type TrainingPageObservation,
  type TrainingSessionView,
} from '@smartmapper/contracts';
import { carrierOriginAllowed, controlIsHumanOnly } from '@smartmapper/automation-core/active-tab';
import {
  canonicalControlInputType,
  canonicalControlRole,
  isSemanticHash,
  recognizedOperationalTarget,
  stableLocator,
  stablePageSignature,
  stableTargetSignature,
} from '@smartmapper/automation-core/registry';
import type { TrainingGrantProvider } from '@smartmapper/mia-client';
import { ApiError, type ServiceAccess } from './active-tab-service.js';
import { ConflictError } from './checkpoints.js';
import type { CheckpointStore } from './checkpoints.js';
import type { MappingRegistryStore, MappingScope } from './mapping-registry.js';

const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

interface TrainingRecord {
  view: TrainingSessionView;
  tokenHash: string;
  miaOrigin: string;
  catalog: MiaFieldCatalog;
}

interface StoredTrainingRecord {
  value: TrainingRecord;
  etag: string;
}

export interface TrainingSessionStore {
  create(partition: string, trainingId: string, value: TrainingRecord): Promise<void>;
  read(partition: string, trainingId: string): Promise<StoredTrainingRecord | null>;
  list(partition: string): Promise<StoredTrainingRecord[]>;
  replace(
    partition: string,
    trainingId: string,
    value: TrainingRecord,
    etag: string,
  ): Promise<void>;
  delete(partition: string, trainingId: string, etag: string): Promise<void>;
}

export class MemoryTrainingSessionStore implements TrainingSessionStore {
  private readonly records = new Map<string, StoredTrainingRecord>();
  private key(partition: string, trainingId: string): string {
    return `${partition}/${trainingId}`;
  }
  public create(partition: string, trainingId: string, value: TrainingRecord): Promise<void> {
    const key = this.key(partition, trainingId);
    if (this.records.has(key)) throw new ConflictError('training_conflict');
    this.records.set(key, { value: structuredClone(value), etag: '0' });
    return Promise.resolve();
  }
  public read(partition: string, trainingId: string): Promise<StoredTrainingRecord | null> {
    return Promise.resolve(
      structuredClone(this.records.get(this.key(partition, trainingId)) ?? null),
    );
  }
  public replace(
    partition: string,
    trainingId: string,
    value: TrainingRecord,
    etag: string,
  ): Promise<void> {
    const key = this.key(partition, trainingId);
    const current = this.records.get(key);
    if (!current || current.etag !== etag) throw new ConflictError('training_conflict');
    this.records.set(key, { value: structuredClone(value), etag: String(Number(etag) + 1) });
    return Promise.resolve();
  }
  public list(partition: string): Promise<StoredTrainingRecord[]> {
    return Promise.resolve(
      [...this.records.entries()]
        .filter(([key]) => key.startsWith(`${partition}/`))
        .map(([, record]) => structuredClone(record)),
    );
  }
  public delete(partition: string, trainingId: string, etag: string): Promise<void> {
    const key = this.key(partition, trainingId);
    if (this.records.get(key)?.etag !== etag) throw new ConflictError('training_conflict');
    this.records.delete(key);
    return Promise.resolve();
  }
}

function statusCode(error: unknown): number | undefined {
  return error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;
}

export class AzureTrainingSessionStore implements TrainingSessionStore {
  private readonly client: TableClient;
  public constructor(endpoint: string, table: string) {
    this.client = new TableClient(endpoint, table, new DefaultAzureCredential());
  }
  private entity(partition: string, trainingId: string, value: TrainingRecord) {
    const serialized = JSON.stringify(value);
    if (serialized.length > 700_000) throw new Error('training_draft_too_large');
    const chunks = serialized.match(/[\s\S]{1,12000}/g) ?? [];
    return {
      partitionKey: partition,
      rowKey: `training-${trainingId}`,
      expiresAt: value.view.binding.expiresAt,
      recordType: 'training',
      chunks: chunks.length,
      ...Object.fromEntries(chunks.map((chunk, index) => [`payload${index}`, chunk])),
    };
  }
  public async create(partition: string, trainingId: string, value: TrainingRecord): Promise<void> {
    await this.client.createEntity(this.entity(partition, trainingId, value));
  }
  public async list(partition: string): Promise<StoredTrainingRecord[]> {
    if (!/^[a-f0-9]{64}$/.test(partition)) throw new Error('invalid_training_partition');
    const records: StoredTrainingRecord[] = [];
    for await (const entity of this.client.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq '${partition}' and recordType eq 'training'` },
    })) {
      const payload = Array.from({ length: Number(entity.chunks) }, (_, index) =>
        String(entity[`payload${index}`]),
      ).join('');
      if (!entity.etag) throw new Error('missing_etag');
      records.push({ value: JSON.parse(payload) as TrainingRecord, etag: entity.etag });
    }
    return records;
  }
  public async read(partition: string, trainingId: string): Promise<StoredTrainingRecord | null> {
    try {
      const entity = await this.client.getEntity<Record<string, unknown>>(
        partition,
        `training-${trainingId}`,
      );
      const payload = Array.from({ length: Number(entity.chunks) }, (_, index) =>
        String(entity[`payload${index}`]),
      ).join('');
      if (!entity.etag) throw new Error('missing_etag');
      return { value: JSON.parse(payload) as TrainingRecord, etag: entity.etag };
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  }
  public async replace(
    partition: string,
    trainingId: string,
    value: TrainingRecord,
    etag: string,
  ): Promise<void> {
    try {
      await this.client.updateEntity(this.entity(partition, trainingId, value), 'Replace', {
        etag,
      });
    } catch (error) {
      if (statusCode(error) === 412) throw new ConflictError('training_conflict');
      throw error;
    }
  }
  public async delete(partition: string, trainingId: string, etag: string): Promise<void> {
    try {
      await this.client.deleteEntity(partition, `training-${trainingId}`, { etag });
    } catch (error) {
      if (statusCode(error) === 412) throw new ConflictError('training_conflict');
      throw error;
    }
  }
}

function eligibleField(control: TrainingControlSnapshot): boolean {
  return (
    ['input', 'textarea', 'select', 'custom'].includes(control.tag) &&
    !['hidden', 'button', 'reset', 'submit', 'file', 'image', 'password'].includes(
      control.inputType,
    ) &&
    !control.ordinaryNext
  );
}

function logicalTrainingControls(controls: TrainingControlSnapshot[]): TrainingControlSnapshot[] {
  const result: TrainingControlSnapshot[] = [];
  const radios = new Map<string, TrainingControlSnapshot[]>();
  for (const control of controls.filter(eligibleField)) {
    if (control.inputType !== 'radio' && control.role !== 'radio') {
      result.push(control);
      continue;
    }
    const group = control.choiceGroup;
    const key = group
      ? `${group.key}\0${group.label}\0${control.section}`
      : `${control.section}\0${control.context.join('\0')}\0radio`;
    const members = radios.get(key) ?? [];
    members.push(control);
    radios.set(key, members);
  }
  for (const members of radios.values()) {
    const first = members[0]!;
    const choiceGroup = first.choiceGroup ?? {
      key: digest(`${first.section}\0${first.context.join('\0')}\0radio`),
      label: first.context[0] || first.section || 'Radio choice',
    };
    result.push({
      ...first,
      label: choiceGroup.label,
      choiceGroup,
      options: members.flatMap((member) =>
        member.options.length
          ? member.options
          : [{ value: member.choiceValue ?? member.label, label: member.label }],
      ),
      choiceValue: null,
      required: members.some((member) => member.required),
      disabled: members.every((member) => member.disabled),
      humanOnly: members.some((member) => member.humanOnly),
    });
  }
  return result.sort((left, right) => left.rect.y - right.rect.y || left.rect.x - right.rect.x);
}

function addEntityType(
  control: TrainingControlSnapshot,
): 'applicant' | 'additionalDriver' | 'vehicle' | null {
  if (control.tag !== 'button' || controlIsHumanOnly(control)) return null;
  return control.addEntityType;
}

const normalizedGroup = (control: TrainingControlSnapshot): string =>
  `${control.section}\0${control.label}`
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

function inferredEntityInstance(control: TrainingControlSnapshot): {
  index: number;
  type: 'applicant' | 'additionalDriver' | 'vehicle';
} | null {
  const source = `${control.section} ${control.label} ${control.context.join(' ')}`;
  const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  const ordinal = '(\\d{1,2}(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth)';
  const kind = '(vehicle|driver|operator|applicant|named insured|insured)';
  const after = new RegExp(`\\b${kind}\\s*(?:#\\s*)?${ordinal}\\b`, 'i').exec(source);
  const before = new RegExp(`\\b${ordinal}\\s+${kind}\\b`, 'i').exec(source);
  const entity = after
    ? { kind: after[1]!, ordinal: after[2]! }
    : before
      ? { kind: before[2]!, ordinal: before[1]! }
      : null;
  if (!entity) return null;
  const raw = entity.ordinal.toLowerCase().replace(/^(\d+)(?:st|nd|rd|th)$/i, '$1');
  const index = /^\d+$/.test(raw) ? Math.max(0, Number(raw) - 1) : words.indexOf(raw);
  if (index < 0) return null;
  const entityKind = entity.kind.toLowerCase();
  return {
    index,
    type:
      entityKind === 'vehicle'
        ? 'vehicle'
        : entityKind === 'driver' || entityKind === 'operator'
          ? 'additionalDriver'
          : 'applicant',
  };
}

async function capturedPage(
  observation: TrainingPageObservation,
  sequence: number,
  firstFieldSequence: number,
  scenarioLabel: string,
): Promise<TrainingPage> {
  const controls = logicalTrainingControls(observation.controls);
  const workflowCandidates = observation.controls.flatMap((control) => {
    const entityType = addEntityType(control);
    const kind = control.ordinaryNext ? 'ordinary_next' : entityType ? 'add_entity' : null;
    return kind ? [{ control, entityType, kind }] : [];
  });
  const order = [
    ...controls.map((control, index) => ({ type: 'field' as const, index, rect: control.rect })),
    ...workflowCandidates.map(({ control }, index) => ({
      type: 'workflow' as const,
      index,
      rect: control.rect,
    })),
  ].sort(
    (left, right) =>
      left.rect.y - right.rect.y ||
      left.rect.x - right.rect.x ||
      left.type.localeCompare(right.type),
  );
  const fieldSequences = new Map<number, number>();
  const workflowSequences = new Map<number, number>();
  order.forEach((item, index) =>
    (item.type === 'field' ? fieldSequences : workflowSequences).set(
      item.index,
      firstFieldSequence + index,
    ),
  );
  const signatures = await Promise.all(controls.map(stableTargetSignature));
  const occurrences = new Map<string, number>();
  const groups = controls.map(normalizedGroup);
  const groupCounts = new Map<string, number>();
  for (const group of groups) groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  const groupOccurrences = new Map<string, number>();
  const fields: TrainingField[] = controls.map((control, index) => {
    const signature = signatures[index]!;
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);
    const group = groups[index]!;
    const groupOccurrence = groupOccurrences.get(group) ?? 0;
    groupOccurrences.set(group, groupOccurrence + 1);
    const entity = control.repeatHint
      ? { index: control.repeatHint.index, type: control.repeatHint.entityType }
      : inferredEntityInstance(control);
    const repeatIndex =
      entity?.index ?? ((groupCounts.get(group) ?? 0) > 1 ? groupOccurrence : null);
    return {
      fieldId: randomUUID(),
      sequence: fieldSequences.get(index)!,
      occurrence,
      repeatIndex,
      repeatEntityType: entity?.type ?? null,
      groupKey: repeatIndex !== null ? digest(group) : null,
      control: {
        elementId: control.elementId,
        key: control.key,
        tag: control.tag,
        inputType: control.inputType,
        role: control.role,
        label: control.label,
        section: control.section,
        context: [...control.context],
        required: control.required,
        disabled: control.disabled,
        humanOnly: control.humanOnly,
        ordinaryNext: control.ordinaryNext,
        choiceGroup: control.choiceGroup ?? null,
        choiceValue: control.choiceValue,
        addEntityType: control.addEntityType,
        operationalTarget: control.operationalTarget,
        repeatHint: control.repeatHint,
        options: control.options.map((option) => ({ ...option })),
        rect: { ...control.rect },
      },
      disposition: control.humanOnly ? { kind: 'human_required' as const } : null,
    };
  });
  const workflowControls = workflowCandidates
    .map(({ control, entityType, kind }, index) => ({
      workflowControlId: randomUUID(),
      sequence: workflowSequences.get(index)!,
      kind,
      entityType,
      decision: null,
      control: {
        elementId: control.elementId,
        key: control.key,
        tag: control.tag,
        inputType: control.inputType,
        role: control.role,
        label: control.label,
        section: control.section,
        context: [...control.context],
        required: control.required,
        disabled: control.disabled,
        humanOnly: control.humanOnly,
        ordinaryNext: control.ordinaryNext,
        choiceGroup: control.choiceGroup ?? null,
        choiceValue: control.choiceValue,
        addEntityType: control.addEntityType,
        operationalTarget: control.operationalTarget,
        repeatHint: control.repeatHint,
        options: control.options.map((option) => ({ ...option })),
        rect: { ...control.rect },
      },
    }))
    .sort((left, right) => left.sequence - right.sequence);
  return TrainingPageSchema.parse({
    pageId: randomUUID(),
    sequence,
    scenarioLabel,
    routeId: observation.routeId,
    fingerprint: observation.fingerprint,
    signature: await stablePageSignature(observation),
    fields,
    workflowControls,
  });
}

async function trainingPageDiscriminator(page: TrainingPage): Promise<string> {
  const fields = await Promise.all(
    [...page.fields]
      .sort((left, right) => left.sequence - right.sequence)
      .map(async (field) => ({
        signature: await stableTargetSignature(field.control),
        occurrence: field.occurrence,
        repeatIndex: field.repeatIndex,
      })),
  );
  const workflowControls = await Promise.all(
    [...page.workflowControls]
      .sort((left, right) => left.sequence - right.sequence)
      .map(async (control) => ({
        kind: control.kind,
        entityType: control.entityType,
        signature: await stableTargetSignature(control.control),
      })),
  );
  return digest(JSON.stringify({ routeId: page.routeId, fields, workflowControls }));
}

function catalogLimitForPattern(catalog: MiaFieldCatalog, sourcePattern: string) {
  return catalog.entityLimits.find(
    (limit) =>
      limit.sourcePattern === sourcePattern || sourcePattern.startsWith(`${limit.sourcePattern}.`),
  );
}

function catalogAllows(disposition: MappingDisposition, catalog: MiaFieldCatalog): boolean {
  if (disposition.kind !== 'source') return true;
  return disposition.references.every((reference) => {
    if (reference.binding === 'fixed')
      return catalog.fields.some(
        (field) =>
          field.sourcePath === reference.sourcePath &&
          field.sourcePattern === reference.sourcePathPattern,
      );
    const limit = catalogLimitForPattern(catalog, reference.sourcePathPattern);
    return (
      !!limit &&
      limit.sourceIndexBase === reference.sourceIndexBase &&
      (catalog.templates.some(
        (template) => template.sourcePattern === reference.sourcePathPattern,
      ) ||
        catalog.fields.some((field) => field.sourcePattern === reference.sourcePathPattern))
    );
  });
}

function scalarKey(value: string | number | boolean): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function catalogDefinitionForReference(
  catalog: MiaFieldCatalog,
  reference: Extract<MappingDisposition, { kind: 'source' }>['references'][number],
) {
  if (reference.binding === 'fixed')
    return catalog.fields.find(
      (field) =>
        field.sourcePath === reference.sourcePath &&
        field.sourcePattern === reference.sourcePathPattern,
    );
  return (
    catalog.templates.find((template) => template.sourcePattern === reference.sourcePathPattern) ??
    catalog.fields.find((field) => field.sourcePattern === reference.sourcePathPattern)
  );
}

function mappingTransformAllowed(
  disposition: MappingDisposition,
  field: TrainingField,
  catalog: MiaFieldCatalog,
): boolean {
  if (disposition.kind !== 'source') return true;
  const definitions = disposition.references.map((reference) =>
    catalogDefinitionForReference(catalog, reference),
  );
  if (definitions.some((definition) => !definition)) return false;
  const transform = disposition.transform;
  if (
    definitions.some((definition) => definition?.dataType === 'multiselect') &&
    !['multiselect_membership', 'multiselect_join'].includes(transform.kind)
  )
    return false;
  if (transform.kind === 'multiselect_membership') {
    const definition = definitions[0]!;
    return (
      definitions.length === 1 &&
      definition?.dataType === 'multiselect' &&
      (field.control.inputType === 'checkbox' || field.control.role === 'checkbox') &&
      definition.options.some((option) => scalarKey(option.value) === scalarKey(transform.member))
    );
  }
  if (transform.kind === 'multiselect_join')
    return definitions.length === 1 && definitions[0]?.dataType === 'multiselect';
  if (transform.kind === 'boolean')
    return definitions.length === 1 && definitions[0]?.dataType === 'boolean';
  if (transform.kind === 'enum') {
    const definition = definitions[0]!;
    const sourceOptions = new Set(definition?.options.map((option) => scalarKey(option.value)));
    const targetOptions = new Set(field.control.options.map((option) => scalarKey(option.value)));
    return (
      definitions.length === 1 &&
      definition?.dataType === 'enum' &&
      sourceOptions.size > 0 &&
      targetOptions.size > 0 &&
      transform.cases.every(
        (entry) =>
          sourceOptions.has(scalarKey(entry.source)) && targetOptions.has(scalarKey(entry.target)),
      )
    );
  }
  if (transform.kind === 'compose')
    return (
      definitions.length >= 2 &&
      definitions.every((definition) => definition?.dataType !== 'multiselect')
    );
  return true;
}

async function dispositionAllowedForTarget(
  disposition: MappingDisposition,
  field: TrainingField,
): Promise<boolean> {
  const operationalTarget = await recognizedOperationalTarget(field.control);
  if (disposition.kind === 'fixed_value') {
    const compactIdentifier =
      (typeof disposition.value === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(disposition.value)) ||
      (typeof disposition.value === 'number' && Number.isFinite(disposition.value));
    const expectedReason =
      disposition.classification === 'agency_operational'
        ? 'approved_agency_identifier'
        : 'approved_carrier_identifier';
    return (
      compactIdentifier &&
      operationalTarget !== null &&
      disposition.classification === operationalTarget &&
      disposition.reason === expectedReason
    );
  }
  if (disposition.kind === 'carrier_default') return operationalTarget !== null;
  return true;
}

function persistedSemanticString(value: string): boolean {
  return value.length === 0 || isSemanticHash(value);
}

async function privacySafeTrainingControl(control: TrainingControlSnapshot): Promise<boolean> {
  return (
    /^e\d+$/.test(control.elementId) &&
    /^[a-f0-9]{64}$/.test(control.key) &&
    control.inputType === canonicalControlInputType(control.inputType) &&
    control.role === canonicalControlRole(control.role) &&
    persistedSemanticString(control.label) &&
    persistedSemanticString(control.section) &&
    control.context.every(persistedSemanticString) &&
    (!control.choiceGroup ||
      (persistedSemanticString(control.choiceGroup.key) &&
        persistedSemanticString(control.choiceGroup.label))) &&
    (control.choiceValue === null || persistedSemanticString(control.choiceValue)) &&
    control.options.every(
      (option) => persistedSemanticString(option.value) && persistedSemanticString(option.label),
    ) &&
    control.operationalTarget === (await recognizedOperationalTarget(control))
  );
}

async function trainingBindingProblem(
  observation: TrainingPageObservation,
  binding: TrainingSessionView['binding'],
): Promise<string | null> {
  if (Date.parse(binding.expiresAt) <= Date.now()) return 'training_expired';
  if (observation.origin !== binding.carrierOrigin || observation.tabId !== binding.tabId)
    return 'binding_mismatch';
  if (observation.authenticationRequired) return 'authentication_required';
  if (
    !/^[a-f0-9]{64}$/.test(observation.routeId) ||
    observation.title !== '' ||
    observation.headings.length !== 0
  )
    return 'unsafe_training_structure';
  const age = Date.now() - Date.parse(observation.capturedAt);
  if (age > 180_000 || age < -30_000) return 'observation_expired';
  if (
    new Set(observation.controls.map((control) => control.elementId)).size !==
    observation.controls.length
  )
    return 'duplicate_control';
  if (!(await Promise.all(observation.controls.map(privacySafeTrainingControl))).every(Boolean))
    return 'unsafe_training_structure';
  return null;
}

export class TrainingService {
  public constructor(
    private readonly store: TrainingSessionStore,
    private readonly grants: TrainingGrantProvider,
    private readonly registry: MappingRegistryStore,
    private readonly access: ServiceAccess,
    private readonly jobs: CheckpointStore,
  ) {}

  private async authorized(trainingId: string, token: string) {
    if (!/^[a-f0-9-]{36}$/.test(trainingId) || !/^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}$/.test(token))
      throw new ApiError(401, 'unauthorized');
    const partition = token.split('.')[0] ?? '';
    const record = await this.store.read(partition, trainingId);
    if (
      !record ||
      !timingSafeEqual(
        Buffer.from(record.value.tokenHash, 'hex'),
        Buffer.from(digest(token), 'hex'),
      )
    )
      throw new ApiError(401, 'unauthorized');
    const binding = record.value.view.binding;
    if (Date.parse(binding.expiresAt) <= Date.now()) throw new ApiError(410, 'training_expired');
    if (
      !this.access.principals.has(`${binding.tenantId}/${binding.userId}`) ||
      !carrierOriginAllowed(
        binding.carrierOrigin,
        this.access.carrierOrigins,
        this.access.allowAnyCarrier,
      ) ||
      !this.access.miaOrigins.has(record.value.miaOrigin)
    )
      throw new ApiError(403, 'scope_not_allowed');
    return { ...record, partition };
  }

  private async save(
    partition: string,
    trainingId: string,
    record: StoredTrainingRecord,
  ): Promise<TrainingSessionView> {
    record.value.view.revision += 1;
    await this.store.replace(partition, trainingId, record.value, record.etag);
    return TrainingSessionViewSchema.parse(record.value.view);
  }

  public async start(input: unknown): Promise<{ training: TrainingSessionView; token: string }> {
    const request = StartTrainingSessionSchema.parse(input);
    if (
      !this.access.miaOrigins.has(request.miaOrigin) ||
      !carrierOriginAllowed(
        request.carrierOrigin,
        this.access.carrierOrigins,
        this.access.allowAnyCarrier,
      )
    )
      throw new ApiError(403, 'origin_not_allowed');
    const grant = await this.grants.redeem(request);
    if (
      !this.access.principals.has(`${grant.binding.tenantId}/${grant.binding.userId}`) ||
      grant.binding.carrierOrigin !== request.carrierOrigin ||
      grant.binding.tabId !== request.tabId ||
      grant.binding.formType !== request.formType ||
      grant.catalog.formType !== request.formType ||
      grant.catalog.schemaRevision.length === 0 ||
      Date.parse(grant.binding.expiresAt) <= Date.now() ||
      Date.parse(grant.binding.expiresAt) > Date.now() + (8 * 60 + 5) * 60_000
    )
      throw new ApiError(403, 'training_grant_binding_mismatch');
    const partition = digest(
      [grant.binding.tenantId, grant.binding.userId, grant.binding.carrierOrigin, 'training'].join(
        '\0',
      ),
    );
    const token = `${partition}.${randomBytes(32).toString('base64url')}`;
    const trainingId = randomUUID();
    const training: TrainingSessionView = {
      version: '2.0',
      trainingId,
      revision: 0,
      status: 'draft',
      binding: grant.binding,
      workflow: {
        carrierOrigin: request.carrierOrigin,
        carrierBaseUrl: request.carrierOrigin,
        workflowName: `${request.formType === 'home' ? 'Home' : 'Auto'} workflow`,
        lineOfBusiness: request.formType,
      },
      catalogRevision: grant.catalog.schemaRevision,
      pages: [],
      mappingId: null,
    };
    await this.store.create(partition, trainingId, {
      view: TrainingSessionViewSchema.parse(training),
      tokenHash: digest(token),
      miaOrigin: request.miaOrigin,
      catalog: grant.catalog,
    });
    return { training, token };
  }

  public async read(trainingId: string, token: string): Promise<TrainingSessionView> {
    return TrainingSessionViewSchema.parse((await this.authorized(trainingId, token)).value.view);
  }

  public async library(trainingId: string, token: string) {
    const record = await this.authorized(trainingId, token);
    const view = record.value.view;
    const records = await this.store.list(record.partition);
    const drafts = records
      .map((item) => item.value.view)
      .filter(
        (candidate) =>
          candidate.trainingId !== trainingId &&
          candidate.status === 'draft' &&
          candidate.pages.length > 0 &&
          this.sameTrainerScope(candidate, view),
      )
      .sort((left, right) => right.binding.expiresAt.localeCompare(left.binding.expiresAt))
      .slice(0, 500);
    const mappings = (await this.registry.list(this.scope(view)))
      .filter((mapping) => ['testable', 'verified', 'active'].includes(mapping.status))
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, 500);
    // Return value-free views only; never expose another session's capability or token hash.
    return TrainingLibraryResponseSchema.parse({ drafts, mappings });
  }

  private sameTrainerScope(left: TrainingSessionView, right: TrainingSessionView): boolean {
    return (
      left.binding.tenantId === right.binding.tenantId &&
      left.binding.userId === right.binding.userId &&
      left.binding.carrierOrigin === right.binding.carrierOrigin &&
      left.binding.formType === right.binding.formType
    );
  }

  private assertEmptyDraft(view: TrainingSessionView, revision: number): void {
    if (revision !== view.revision) throw new ConflictError('revision_conflict');
    if (view.status !== 'draft' || view.pages.length || view.mappingId)
      throw new ApiError(409, 'recovery_requires_empty_draft');
  }

  public async recover(trainingId: string, token: string, input: unknown) {
    const request = RecoverTrainingDraftRequestSchema.parse(input);
    const record = await this.authorized(trainingId, token);
    this.assertEmptyDraft(record.value.view, request.revision);
    const donor = await this.store.read(record.partition, request.trainingId);
    if (!donor || !this.sameTrainerScope(donor.value.view, record.value.view))
      throw new ApiError(404, 'saved_training_not_found');
    if (donor.value.view.status !== 'draft' || donor.value.view.pages.length === 0)
      throw new ApiError(409, 'saved_training_not_draft');
    if (donor.value.view.catalogRevision !== record.value.view.catalogRevision)
      throw new ApiError(409, 'saved_training_catalog_changed');
    // The old authorization may have expired. Fresh M.I.A. authorization permits recovery of
    // its durable, value-free draft; the old tab, token and expiry are never reused or changed.
    record.value.view.pages = structuredClone(donor.value.view.pages);
    record.value.view.workflow = structuredClone(donor.value.view.workflow);
    return { training: await this.save(record.partition, trainingId, record) };
  }

  public async openMapping(trainingId: string, token: string, input: unknown) {
    const request = OpenSavedMappingRequestSchema.parse(input);
    const record = await this.authorized(trainingId, token);
    this.assertEmptyDraft(record.value.view, request.revision);
    const mapping = await this.registry.get(
      this.scope(record.value.view),
      request.mappingId,
      request.mappingVersion,
    );
    if (!mapping || !['testable', 'verified', 'active'].includes(mapping.status))
      throw new ApiError(404, 'saved_mapping_not_found');
    record.value.view.mappingId = mapping.mappingId;
    record.value.view.workflow = structuredClone(mapping.workflow);
    record.value.view.status = mapping.status === 'testable' ? 'testable' : 'verified';
    return { training: await this.save(record.partition, trainingId, record), mapping };
  }

  public async cancel(trainingId: string, token: string): Promise<void> {
    const record = await this.authorized(trainingId, token);
    record.value.view.status = 'cancelled';
    await this.save(record.partition, trainingId, record);
  }

  public async capture(
    trainingId: string,
    token: string,
    input: unknown,
  ): Promise<{ training: TrainingSessionView; page: TrainingPage }> {
    const request = CaptureTrainingPageRequestSchema.parse(input);
    const record = await this.authorized(trainingId, token);
    if (request.revision !== record.value.view.revision)
      throw new ConflictError('revision_conflict');
    if (record.value.view.status !== 'draft') throw new ConflictError('training_not_draft');
    const problem = await trainingBindingProblem(request.observation, record.value.view.binding);
    if (problem) throw new ApiError(409, problem);
    const pages = record.value.view.pages;
    const nextField =
      Math.max(
        0,
        ...pages.flatMap((page) => [
          ...page.fields.map((field) => field.sequence),
          ...page.workflowControls.map((control) => control.sequence),
        ]),
      ) + 1;
    const page = await capturedPage(
      request.observation,
      pages.length + 1,
      nextField,
      `Page ${pages.length + 1}`,
    );
    const discriminator = await trainingPageDiscriminator(page);
    if (
      (await Promise.all(pages.map((candidate) => trainingPageDiscriminator(candidate)))).includes(
        discriminator,
      )
    )
      throw new ApiError(409, 'duplicate_training_page');
    record.value.view.pages.push(page);
    const training = await this.save(record.partition, trainingId, record);
    return { training, page };
  }

  public async savePage(
    trainingId: string,
    pageId: string,
    token: string,
    input: unknown,
  ): Promise<{ training: TrainingSessionView; page: TrainingPage }> {
    const request = SaveTrainingPageRequestSchema.parse(input);
    const record = await this.authorized(trainingId, token);
    if (request.revision !== record.value.view.revision)
      throw new ConflictError('revision_conflict');
    if (record.value.view.status !== 'draft') throw new ConflictError('training_not_draft');
    const page = record.value.view.pages.find((candidate) => candidate.pageId === pageId);
    if (!page) throw new ApiError(404, 'training_page_not_found');
    for (const update of request.fields) {
      const field = page.fields.find((candidate) => candidate.fieldId === update.fieldId);
      if (!field) throw new ApiError(400, 'unknown_training_field');
      if (update.repeatBinding !== undefined) {
        if (update.repeatBinding === null) {
          field.repeatIndex = null;
          field.repeatEntityType = null;
          field.groupKey = null;
        } else {
          const limit = record.value.catalog.entityLimits.find(
            (candidate) => candidate.entityType === update.repeatBinding?.entityType,
          );
          if (!limit || update.repeatBinding.index >= limit.maximumCount)
            throw new ApiError(400, 'invalid_repeat_binding');
          field.repeatIndex = update.repeatBinding.index;
          field.repeatEntityType = update.repeatBinding.entityType;
          field.groupKey ??= digest(
            `${update.repeatBinding.entityType}\0${normalizedGroup(field.control)}`,
          );
        }
      }
      if (!catalogAllows(update.disposition, record.value.catalog))
        throw new ApiError(400, 'unknown_mia_catalog_field');
      if (!mappingTransformAllowed(update.disposition, field, record.value.catalog))
        throw new ApiError(400, 'incompatible_mapping_transform');
      if (!(await dispositionAllowedForTarget(update.disposition, field)))
        throw new ApiError(400, 'unsafe_mapping_disposition');
      if (field.control.humanOnly && update.disposition.kind !== 'human_required')
        throw new ApiError(400, 'human_only_field');
      if (
        update.disposition.kind === 'source' &&
        update.disposition.references.some((reference) => reference.binding === 'same_position') &&
        field.repeatIndex === null
      )
        throw new ApiError(400, 'missing_repeat_position');
      if (update.disposition.kind === 'source') {
        const repeated = update.disposition.references.filter(
          (reference) => reference.binding === 'same_position',
        );
        const entityTypes = new Set(
          repeated.flatMap((reference) => {
            const limit = catalogLimitForPattern(record.value.catalog, reference.sourcePathPattern);
            return limit ? [limit.entityType] : [];
          }),
        );
        if (entityTypes.size > 1) throw new ApiError(400, 'mixed_repeat_entities');
        if (entityTypes.size === 1) {
          const entityType = [...entityTypes][0]!;
          if (field.repeatEntityType !== null && field.repeatEntityType !== entityType)
            throw new ApiError(400, 'repeat_entity_mismatch');
          field.repeatEntityType = entityType;
        }
      }
      field.disposition = update.disposition;
    }
    for (const update of request.workflowControls) {
      const control = page.workflowControls.find(
        (candidate) => candidate.workflowControlId === update.workflowControlId,
      );
      if (!control) throw new ApiError(400, 'unknown_workflow_control');
      control.decision = update.decision;
    }
    const training = await this.save(record.partition, trainingId, record);
    return { training, page };
  }

  public async publish(
    trainingId: string,
    token: string,
    input: unknown,
  ): Promise<{ training: TrainingSessionView; mapping: MappingProfile }> {
    const request = PublishTrainingSessionRequestSchema.parse(input);
    const record = await this.authorized(trainingId, token);
    if (request.revision !== record.value.view.revision)
      throw new ConflictError('revision_conflict');
    if (record.value.view.status !== 'draft') throw new ConflictError('training_not_draft');
    if (!record.value.view.pages.length) throw new ApiError(422, 'capture_at_least_one_page');
    for (const page of record.value.view.pages) {
      for (const field of page.fields) {
        if (!field.disposition) throw new ApiError(422, 'unmapped_training_field');
        if (field.control.required && ['ignore', 'leave_blank'].includes(field.disposition.kind))
          throw new ApiError(422, 'required_field_cannot_be_blank');
      }
      if (page.workflowControls.some((control) => control.decision === null))
        throw new ApiError(422, 'workflow_control_decision_required');
    }
    const now = new Date().toISOString();
    const mapping = await this.registry.publish({
      version: '2.0',
      mappingId: record.value.view.mappingId ?? randomUUID(),
      tenantId: record.value.view.binding.tenantId,
      createdByUserId: record.value.view.binding.userId,
      workflow: record.value.view.workflow,
      catalogRevision: record.value.view.catalogRevision,
      entityLimits: record.value.catalog.entityLimits,
      verification: {
        coveredPageIds: [],
        coveredFieldIds: [],
        coveredWorkflowControlIds: [],
        evidenceDigests: [],
        lastVerifiedAt: null,
      },
      pages: await Promise.all(
        record.value.view.pages.map(async (page) => ({
          pageId: page.pageId,
          sequence: page.sequence,
          scenarioLabel: page.scenarioLabel,
          routeId: page.routeId,
          signature: page.signature,
          fields: await Promise.all(
            page.fields.map(async (field) => ({
              fieldId: field.fieldId,
              sequence: field.sequence,
              target: await stableLocator(
                field.control,
                field.occurrence,
                field.repeatIndex,
                field.groupKey,
                field.repeatEntityType,
              ),
              disposition: field.disposition!,
            })),
          ),
          workflowControls: await Promise.all(
            page.workflowControls
              .filter((control) => control.decision === 'use')
              .map(async (control) => ({
                workflowControlId: control.workflowControlId,
                sequence: control.sequence,
                kind: control.kind,
                entityType: control.entityType,
                target: await stableLocator(control.control, 0, null, null),
              })),
          ),
        })),
      ),
      createdAt: now,
    });
    record.value.view.status = 'testable';
    record.value.view.mappingId = mapping.mappingId;
    const training = await this.save(record.partition, trainingId, record);
    return { training, mapping };
  }

  private scope(view: TrainingSessionView): MappingScope {
    return {
      tenantId: view.binding.tenantId,
      carrierOrigin: view.binding.carrierOrigin,
      lineOfBusiness: view.workflow.lineOfBusiness,
    };
  }

  public async verify(
    trainingId: string,
    token: string,
    input: unknown,
  ): Promise<{ training: TrainingSessionView; mapping: MappingProfile }> {
    const request = VerifyMappingRequestSchema.parse(input);
    const record = await this.authorized(trainingId, token);
    if (request.revision !== record.value.view.revision)
      throw new ConflictError('revision_conflict');
    if (!record.value.view.mappingId) throw new ConflictError('mapping_not_published');
    const jobPartition = request.jobToken.split('.')[0] ?? '';
    const evidence = await this.jobs.read(jobPartition, request.jobId);
    if (
      !evidence ||
      !timingSafeEqual(
        Buffer.from(evidence.value.tokenHash, 'hex'),
        Buffer.from(digest(request.jobToken), 'hex'),
      )
    )
      throw new ApiError(401, 'invalid_mapping_test_evidence');
    const binding = evidence.value.view.binding;
    if (
      binding.tenantId !== record.value.view.binding.tenantId ||
      binding.userId !== record.value.view.binding.userId ||
      binding.carrierOrigin !== record.value.view.binding.carrierOrigin ||
      evidence.value.mappingId !== record.value.view.mappingId ||
      evidence.value.mappingVersion !== request.mappingVersion ||
      evidence.value.view.status !== 'page_complete' ||
      evidence.value.view.failed !== 0 ||
      evidence.value.view.reviews.length !== 0 ||
      evidence.value.pending !== null
    )
      throw new ApiError(422, 'mapping_test_not_clean');
    const candidate = await this.registry.get(
      this.scope(record.value.view),
      record.value.view.mappingId,
      request.mappingVersion,
    );
    if (!candidate || candidate.status !== 'testable')
      throw new ApiError(409, 'mapping_not_testable');
    const mapping = await this.registry.recordVerification(
      this.scope(record.value.view),
      record.value.view.mappingId,
      request.mappingVersion,
      {
        pageIds: evidence.value.completedMappingPageIds ?? [],
        fieldIds: evidence.value.verifiedMappingFieldIds ?? [],
        workflowControlIds: evidence.value.verifiedMappingWorkflowControlIds ?? [],
        evidenceDigest: digest(
          [
            request.jobId,
            evidence.value.view.revision,
            binding.tenantId,
            binding.userId,
            binding.carrierOrigin,
            evidence.value.mappingId,
            evidence.value.mappingVersion,
            [...(evidence.value.completedMappingPageIds ?? [])].sort().join(','),
            [...(evidence.value.verifiedMappingFieldIds ?? [])].sort().join(','),
            [...(evidence.value.verifiedMappingWorkflowControlIds ?? [])].sort().join(','),
          ].join('\0'),
        ),
      },
    );
    record.value.view.status = mapping.status === 'verified' ? 'verified' : 'testable';
    const training = await this.save(record.partition, trainingId, record);
    return { training, mapping };
  }

  public async activate(
    trainingId: string,
    token: string,
    input: unknown,
  ): Promise<{ training: TrainingSessionView; mapping: MappingProfile }> {
    const request = ActivateMappingRequestSchema.parse(input);
    const record = await this.authorized(trainingId, token);
    if (request.revision !== record.value.view.revision)
      throw new ConflictError('revision_conflict');
    if (!record.value.view.mappingId) throw new ConflictError('mapping_not_published');
    const mapping = await this.registry.setActive(
      this.scope(record.value.view),
      record.value.view.mappingId,
      request.mappingVersion,
    );
    record.value.view.status = 'verified';
    const training = await this.save(record.partition, trainingId, record);
    return { training, mapping };
  }
}
