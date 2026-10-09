import { createHash } from 'node:crypto';

import { DefaultAzureCredential } from '@azure/identity';
import { TableClient, TableTransaction } from '@azure/data-tables';
import {
  MappingProfileSchema,
  type CarrierWorkflowIdentity,
  type MappingLineOfBusiness,
  type MappingProfile,
} from '@smartmapper/contracts';
import { isSemanticHash } from '@smartmapper/automation-core/registry';

const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const statusCode = (error: unknown): number | undefined =>
  error &&
  typeof error === 'object' &&
  'statusCode' in error &&
  typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined;

export interface MappingScope {
  tenantId: string;
  carrierOrigin: string;
  lineOfBusiness: MappingLineOfBusiness;
}

export interface MappingRegistryStore {
  publish(
    profile: Omit<MappingProfile, 'mappingVersion' | 'status' | 'publishedAt'>,
  ): Promise<MappingProfile>;
  list(scope: MappingScope): Promise<MappingProfile[]>;
  get(scope: MappingScope, mappingId: string, version?: number): Promise<MappingProfile | null>;
  resolveActive(scope: MappingScope): Promise<MappingProfile | null>;
  recordVerification(
    scope: MappingScope,
    mappingId: string,
    version: number,
    evidence: {
      pageIds: string[];
      fieldIds: string[];
      workflowControlIds: string[];
      evidenceDigest: string;
    },
  ): Promise<MappingProfile>;
  setActive(scope: MappingScope, mappingId: string, version: number): Promise<MappingProfile>;
  archive(scope: MappingScope, mappingId: string): Promise<void>;
}

export function mappingPartition(scope: MappingScope): string {
  return digest([scope.tenantId, scope.carrierOrigin, scope.lineOfBusiness].join('\0'));
}

// A trainer-facing name is mutable display metadata. The durable workflow lineage is the
// carrier path plus the optional state/product/program selectors that describe the form variant.
const sameWorkflowIdentity = (
  left: CarrierWorkflowIdentity,
  right: CarrierWorkflowIdentity,
): boolean =>
  left.carrierOrigin === right.carrierOrigin &&
  left.carrierBaseUrl === right.carrierBaseUrl &&
  left.lineOfBusiness === right.lineOfBusiness &&
  (left.stateCode ?? null) === (right.stateCode ?? null) &&
  (left.productCode ?? null) === (right.productCode ?? null) &&
  (left.programCode ?? null) === (right.programCode ?? null);

// The current runtime can choose profiles by carrier path, but it does not infer a
// state/product/program selector. Consequently, all variants on the same exact base path share
// one activation slot. This prevents two valid profiles from becoming indistinguishable at run
// time while still allowing more-specific nested paths to coexist and win by longest-path match.
const sameActivationSlot = (
  left: CarrierWorkflowIdentity,
  right: CarrierWorkflowIdentity,
): boolean =>
  left.carrierOrigin === right.carrierOrigin &&
  left.carrierBaseUrl === right.carrierBaseUrl &&
  left.lineOfBusiness === right.lineOfBusiness;

function safeSemanticString(value: string): boolean {
  return value.length === 0 || isSemanticHash(value);
}

function safeOperationalValue(value: string | number | boolean): boolean {
  return (
    (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(value)) ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

const semanticHash = (value: string): string =>
  `sha256:${digest(value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase())}`;
const operationalActors = {
  agency_operational: ['agency', 'agent', 'producer', 'office', 'branch'],
  carrier_operational: ['carrier'],
} as const;
const operationalIdentifiers = ['code', 'id', 'identifier', 'number'] as const;

function recognizedOperationalTarget(
  target: MappingProfile['pages'][number]['fields'][number]['target'],
): 'agency_operational' | 'carrier_operational' | null {
  const surrounding = new Set([target.section, ...target.context]);
  for (const [classification, actors] of Object.entries(operationalActors) as Array<
    ['agency_operational' | 'carrier_operational', readonly string[]]
  >) {
    for (const actor of actors) {
      if (
        operationalIdentifiers.some(
          (identifier) => target.label === semanticHash(`${actor} ${identifier}`),
        ) ||
        (operationalIdentifiers.some((identifier) => target.label === semanticHash(identifier)) &&
          surrounding.has(semanticHash(actor)))
      )
        return classification;
    }
  }
  return null;
}

function assertProfileSafe(
  profile: Omit<MappingProfile, 'mappingVersion' | 'status' | 'publishedAt'>,
): void {
  if (
    profile.preview &&
    (profile.pages.length !== 1 ||
      profile.pages[0]?.pageId !== profile.preview.pageId ||
      profile.pages[0]?.workflowControls.length)
  )
    throw new Error('invalid_preview_scope');
  const expectedWorkflowName =
    profile.workflow.lineOfBusiness === 'home' ? 'Home workflow' : 'Auto workflow';
  if (
    profile.workflow.carrierBaseUrl !== profile.workflow.carrierOrigin ||
    profile.workflow.workflowName !== expectedWorkflowName ||
    profile.workflow.stateCode != null ||
    profile.workflow.productCode != null ||
    profile.workflow.programCode != null
  )
    throw new Error('unsafe_mapping_workflow_metadata');
  for (const page of profile.pages) {
    if (!/^[a-f0-9]{64}$/.test(page.routeId)) throw new Error('unsafe_mapping_route_metadata');
    if (page.scenarioLabel !== `Page ${page.sequence}`)
      throw new Error('unsafe_mapping_page_metadata');
    for (const item of [...page.fields, ...page.workflowControls]) {
      const target = item.target;
      if (
        !safeSemanticString(target.label) ||
        !safeSemanticString(target.section) ||
        !target.context.every(safeSemanticString) ||
        (target.choiceGroup != null &&
          (!safeSemanticString(target.choiceGroup.key) ||
            !safeSemanticString(target.choiceGroup.label))) ||
        (target.choiceValue != null && !safeSemanticString(target.choiceValue)) ||
        !target.options.every(
          (option) => safeSemanticString(option.value) && safeSemanticString(option.label),
        )
      )
        throw new Error('unsafe_mapping_target_metadata');
      if (!('disposition' in item)) continue;
      const disposition = item.disposition;
      const operationalTarget = recognizedOperationalTarget(target);
      if (target.operationalTarget !== operationalTarget)
        throw new Error('unsafe_operational_target_classification');
      if (disposition.kind === 'fixed_value') {
        const expectedReason =
          disposition.classification === 'agency_operational'
            ? 'approved_agency_identifier'
            : 'approved_carrier_identifier';
        if (
          !safeOperationalValue(disposition.value) ||
          operationalTarget !== disposition.classification ||
          disposition.reason !== expectedReason
        )
          throw new Error('unsafe_fixed_mapping');
      }
      if (disposition.kind === 'carrier_default' && operationalTarget === null)
        throw new Error('unsafe_carrier_default_mapping');
      if (disposition.kind !== 'source') continue;
      const transform = disposition.transform;
      if (
        transform.kind === 'enum' &&
        transform.cases.some(
          (entry) => typeof entry.target !== 'string' || !isSemanticHash(entry.target),
        )
      )
        throw new Error('unsafe_enum_mapping_target');
      if (
        transform.kind === 'boolean' &&
        [transform.trueValue, transform.falseValue].some(
          (value) =>
            typeof value !== 'boolean' && (typeof value !== 'string' || !isSemanticHash(value)),
        )
      )
        throw new Error('unsafe_boolean_mapping_target');
    }
  }
}

type VerificationEvidence = {
  pageIds: string[];
  fieldIds: string[];
  workflowControlIds: string[];
  evidenceDigest: string;
};

function mergeVerification(selected: MappingProfile, evidence: VerificationEvidence) {
  return {
    coveredPageIds: [...new Set([...selected.verification.coveredPageIds, ...evidence.pageIds])],
    coveredFieldIds: [...new Set([...selected.verification.coveredFieldIds, ...evidence.fieldIds])],
    coveredWorkflowControlIds: [
      ...new Set([
        ...selected.verification.coveredWorkflowControlIds,
        ...evidence.workflowControlIds,
      ]),
    ],
    evidenceDigests: [
      ...new Set([...selected.verification.evidenceDigests, evidence.evidenceDigest]),
    ].slice(-500),
    lastVerifiedAt: new Date().toISOString(),
  };
}

function verificationComplete(
  selected: MappingProfile,
  verification: MappingProfile['verification'],
): boolean {
  const requiredPages = selected.pages.map((page) => page.pageId);
  const requiredFields = selected.pages.flatMap((page) =>
    page.fields
      .filter((field) =>
        ['source', 'fixed_value', 'carrier_default'].includes(field.disposition.kind),
      )
      .map((field) => field.fieldId),
  );
  return (
    requiredPages.every((pageId) => verification.coveredPageIds.includes(pageId)) &&
    requiredFields.every((fieldId) => verification.coveredFieldIds.includes(fieldId)) &&
    selected.pages
      .flatMap((page) => page.workflowControls)
      .every((control) =>
        verification.coveredWorkflowControlIds.includes(control.workflowControlId),
      )
  );
}

export class MemoryMappingRegistryStore implements MappingRegistryStore {
  private readonly profiles = new Map<string, MappingProfile>();
  private mutationTail: Promise<void> = Promise.resolve();

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release: (() => void) | undefined;
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }

  private key(scope: MappingScope, mappingId: string, version: number): string {
    return [mappingPartition(scope), mappingId, version].join('/');
  }

  public async publish(
    input: Omit<MappingProfile, 'mappingVersion' | 'status' | 'publishedAt'>,
  ): Promise<MappingProfile> {
    assertProfileSafe(input);
    return this.mutate(async () => {
      const scope: MappingScope = {
        tenantId: input.tenantId,
        carrierOrigin: input.workflow.carrierOrigin,
        lineOfBusiness: input.workflow.lineOfBusiness,
      };
      const candidates = input.preview ? [] : await this.list(scope);
      const existing = candidates.filter(
        (profile) =>
          profile.mappingId === input.mappingId ||
          (!input.preview &&
            !profile.preview &&
            sameWorkflowIdentity(profile.workflow, input.workflow)),
      );
      const mappingId = existing[0]?.mappingId ?? input.mappingId;
      const mappingVersion = Math.max(0, ...existing.map((profile) => profile.mappingVersion)) + 1;
      const profile = MappingProfileSchema.parse({
        ...input,
        mappingId,
        mappingVersion,
        status: input.preview ? 'preview' : 'testable',
        publishedAt: new Date().toISOString(),
      });
      if (this.profiles.has(this.key(scope, mappingId, mappingVersion)))
        throw new Error('mapping_version_exists');
      this.profiles.set(this.key(scope, mappingId, mappingVersion), structuredClone(profile));
      return structuredClone(profile);
    });
  }

  public list(scope: MappingScope): Promise<MappingProfile[]> {
    const prefix = mappingPartition(scope) + '/';
    return Promise.resolve(
      [...this.profiles.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, profile]) => structuredClone(profile))
        .sort((a, b) => b.mappingVersion - a.mappingVersion),
    );
  }

  public async get(
    scope: MappingScope,
    mappingId: string,
    version?: number,
  ): Promise<MappingProfile | null> {
    if (version !== undefined)
      return structuredClone(this.profiles.get(this.key(scope, mappingId, version)) ?? null);
    const matches = (await this.list(scope)).filter(
      (profile) =>
        profile.mappingId === mappingId && (!version || profile.mappingVersion === version),
    );
    return matches[0] ?? null;
  }

  public async resolveActive(scope: MappingScope): Promise<MappingProfile | null> {
    const active = (await this.list(scope)).filter((profile) => profile.status === 'active');
    return active.length === 1 ? active[0]! : null;
  }

  public async recordVerification(
    scope: MappingScope,
    mappingId: string,
    version: number,
    evidence: {
      pageIds: string[];
      fieldIds: string[];
      workflowControlIds: string[];
      evidenceDigest: string;
    },
  ): Promise<MappingProfile> {
    return this.mutate(async () => {
      const selected = await this.get(scope, mappingId, version);
      if (!selected) throw new Error('mapping_not_found');
      if (selected.status !== 'testable') throw new Error('mapping_not_testable');
      const verification = mergeVerification(selected, evidence);
      const verified: MappingProfile = {
        ...selected,
        verification,
        status: verificationComplete(selected, verification) ? 'verified' : 'testable',
      };
      this.profiles.set(this.key(scope, mappingId, version), verified);
      return structuredClone(verified);
    });
  }

  public async setActive(
    scope: MappingScope,
    mappingId: string,
    version: number,
  ): Promise<MappingProfile> {
    return this.mutate(async () => {
      const selected = await this.get(scope, mappingId, version);
      if (!selected) throw new Error('mapping_not_found');
      if (selected.status !== 'verified' && selected.status !== 'active')
        throw new Error('mapping_not_verified');
      for (const profile of await this.list(scope)) {
        if (!sameActivationSlot(profile.workflow, selected.workflow)) continue;
        this.profiles.set(this.key(scope, profile.mappingId, profile.mappingVersion), {
          ...profile,
          status:
            profile.mappingId === mappingId && profile.mappingVersion === version
              ? 'active'
              : profile.status === 'active'
                ? 'superseded'
                : profile.status,
        });
      }
      return { ...selected, status: 'active' };
    });
  }

  public async archive(scope: MappingScope, mappingId: string): Promise<void> {
    await this.mutate(async () => {
      for (const profile of await this.list(scope)) {
        if (profile.mappingId !== mappingId) continue;
        this.profiles.set(this.key(scope, profile.mappingId, profile.mappingVersion), {
          ...profile,
          status: 'archived',
        });
      }
    });
  }
}

interface RegistryEntity extends Record<string, unknown> {
  partitionKey: string;
  rowKey: string;
  mappingId: string;
  mappingVersion: number;
  status: string;
  workflowKey: string;
  chunks: number;
}

export class AzureMappingRegistryStore implements MappingRegistryStore {
  private readonly client: TableClient;

  public constructor(endpoint: string, table: string) {
    this.client = new TableClient(endpoint, table, new DefaultAzureCredential());
  }

  private entity(profile: MappingProfile): RegistryEntity {
    const serialized = JSON.stringify(profile);
    if (serialized.length > 700_000) throw new Error('mapping_profile_too_large');
    const chunks = serialized.match(/[\s\S]{1,12000}/g) ?? [];
    const scope = {
      tenantId: profile.tenantId,
      carrierOrigin: profile.workflow.carrierOrigin,
      lineOfBusiness: profile.workflow.lineOfBusiness,
    };
    return {
      partitionKey: mappingPartition(scope),
      rowKey: `${profile.mappingId}-${String(profile.mappingVersion).padStart(8, '0')}`,
      mappingId: profile.mappingId,
      mappingVersion: profile.mappingVersion,
      status: profile.status,
      workflowKey: digest(JSON.stringify(profile.workflow)),
      chunks: chunks.length,
      ...Object.fromEntries(chunks.map((chunk, index) => ['payload' + index, chunk])),
    };
  }

  private parse(entity: Record<string, unknown>): MappingProfile {
    const payload = Array.from({ length: Number(entity.chunks) }, (_, index) =>
      String(entity['payload' + index]),
    ).join('');
    return MappingProfileSchema.parse(JSON.parse(payload));
  }

  private async listStored(
    scope: MappingScope,
  ): Promise<Array<{ profile: MappingProfile; etag: string }>> {
    const profiles: Array<{ profile: MappingProfile; etag: string }> = [];
    for await (const entity of this.client.listEntities<Record<string, unknown>>({
      queryOptions: { filter: `PartitionKey eq '${mappingPartition(scope)}'` },
    })) {
      if (!entity.etag) throw new Error('missing_mapping_etag');
      profiles.push({ profile: this.parse(entity), etag: entity.etag });
    }
    return profiles.sort((a, b) => b.profile.mappingVersion - a.profile.mappingVersion);
  }

  private async getStored(
    scope: MappingScope,
    mappingId: string,
    version: number,
  ): Promise<{ profile: MappingProfile; etag: string } | null> {
    try {
      const entity = await this.client.getEntity<Record<string, unknown>>(
        mappingPartition(scope),
        `${mappingId}-${String(version).padStart(8, '0')}`,
      );
      if (!entity.etag) throw new Error('missing_mapping_etag');
      return { profile: this.parse(entity), etag: entity.etag };
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  }

  public async list(scope: MappingScope): Promise<MappingProfile[]> {
    return (await this.listStored(scope)).map((entry) => entry.profile);
  }

  public async publish(
    input: Omit<MappingProfile, 'mappingVersion' | 'status' | 'publishedAt'>,
  ): Promise<MappingProfile> {
    assertProfileSafe(input);
    const scope: MappingScope = {
      tenantId: input.tenantId,
      carrierOrigin: input.workflow.carrierOrigin,
      lineOfBusiness: input.workflow.lineOfBusiness,
    };
    const profiles = input.preview ? [] : await this.list(scope);
    const existing = profiles.filter(
      (profile) =>
        profile.mappingId === input.mappingId ||
        (!input.preview &&
          !profile.preview &&
          sameWorkflowIdentity(profile.workflow, input.workflow)),
    );
    const mappingId = existing[0]?.mappingId ?? input.mappingId;
    const mappingVersion = Math.max(0, ...existing.map((profile) => profile.mappingVersion)) + 1;
    const profile = MappingProfileSchema.parse({
      ...input,
      mappingId,
      mappingVersion,
      status: input.preview ? 'preview' : 'testable',
      publishedAt: new Date().toISOString(),
    });
    await this.client.createEntity(this.entity(profile));
    return profile;
  }

  public async get(
    scope: MappingScope,
    mappingId: string,
    version?: number,
  ): Promise<MappingProfile | null> {
    if (version !== undefined)
      return (await this.getStored(scope, mappingId, version))?.profile ?? null;
    const matches = (await this.list(scope)).filter(
      (profile) =>
        profile.mappingId === mappingId && (!version || profile.mappingVersion === version),
    );
    return matches[0] ?? null;
  }

  public async resolveActive(scope: MappingScope): Promise<MappingProfile | null> {
    const active = (await this.list(scope)).filter((profile) => profile.status === 'active');
    return active.length === 1 ? active[0]! : null;
  }

  public async recordVerification(
    scope: MappingScope,
    mappingId: string,
    version: number,
    evidence: {
      pageIds: string[];
      fieldIds: string[];
      workflowControlIds: string[];
      evidenceDigest: string;
    },
  ): Promise<MappingProfile> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const stored = await this.getStored(scope, mappingId, version);
      if (!stored) throw new Error('mapping_not_found');
      const selected = stored.profile;
      if (selected.status !== 'testable') throw new Error('mapping_not_testable');
      const verification = mergeVerification(selected, evidence);
      const verified: MappingProfile = {
        ...selected,
        verification,
        status: verificationComplete(selected, verification) ? 'verified' : 'testable',
      };
      try {
        await this.client.updateEntity(this.entity(verified), 'Replace', { etag: stored.etag });
        return verified;
      } catch (error) {
        if (statusCode(error) !== 412) throw error;
      }
    }
    throw new Error('mapping_concurrency_conflict');
  }

  public async setActive(
    scope: MappingScope,
    mappingId: string,
    version: number,
  ): Promise<MappingProfile> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const stored = await this.listStored(scope);
      const selected = stored.find(
        (entry) =>
          entry.profile.mappingId === mappingId && entry.profile.mappingVersion === version,
      );
      if (!selected) throw new Error('mapping_not_found');
      if (selected.profile.status !== 'verified' && selected.profile.status !== 'active')
        throw new Error('mapping_not_verified');
      const workflow = stored.filter((entry) =>
        sameActivationSlot(entry.profile.workflow, selected.profile.workflow),
      );
      if (workflow.length > 100) throw new Error('mapping_workflow_version_limit');
      const transaction = new TableTransaction();
      for (const entry of workflow)
        transaction.updateEntity(
          this.entity({
            ...entry.profile,
            status:
              entry.profile.mappingId === mappingId && entry.profile.mappingVersion === version
                ? 'active'
                : entry.profile.status === 'active'
                  ? 'superseded'
                  : entry.profile.status,
          }),
          'Replace',
          { etag: entry.etag },
        );
      try {
        await this.client.submitTransaction(transaction.actions);
        return { ...selected.profile, status: 'active' };
      } catch (error) {
        if (statusCode(error) !== 412) throw error;
      }
    }
    throw new Error('mapping_concurrency_conflict');
  }

  public async archive(scope: MappingScope, mappingId: string): Promise<void> {
    const stored = (await this.listStored(scope)).filter(
      (entry) => entry.profile.mappingId === mappingId,
    );
    if (stored.length > 100) throw new Error('mapping_version_limit');
    if (!stored.length) return;
    const transaction = new TableTransaction();
    for (const entry of stored)
      transaction.updateEntity(this.entity({ ...entry.profile, status: 'archived' }), 'Replace', {
        etag: entry.etag,
      });
    await this.client.submitTransaction(transaction.actions);
  }
}
