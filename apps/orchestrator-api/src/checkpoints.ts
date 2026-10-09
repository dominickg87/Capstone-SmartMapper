import { DefaultAzureCredential } from '@azure/identity';
import { odata, TableClient } from '@azure/data-tables';
import type { ActionReceipt, JobView } from '@smartmapper/contracts';

export interface PendingAction {
  batchId: string;
  actionId: string;
  elementId?: string | null;
  key: string;
  expectedHash: string | null;
  sourceAnswerIds: string[];
  transformation: string;
  transformationHash: string;
  actionType?: 'fill' | 'select' | 'check' | 'click' | 'key' | 'scroll' | 'wait' | 'next_page';
  navigation?: boolean;
  mappingFieldId?: string;
  mappingPageId?: string;
  mappingWorkflowControlId?: string;
  mappingWorkflowControlKind?: 'ordinary_next' | 'add_entity';
  expectedMappingFieldId?: string;
}

export interface Checkpoint {
  view: JobView;
  tokenHash: string;
  miaOrigin: string;
  sourceToken: string;
  sourceRevision: string;
  mappingId: string | null;
  mappingVersion: number | null;
  completedMappingPageIds?: string[];
  verifiedMappingFieldIds?: string[];
  verifiedMappingWorkflowControlIds?: string[];
  localFieldEvidence?: {
    mappingFieldId: string;
    key: string;
    observedHash: string;
    kind: 'carrier_default';
    sourceRevision: string;
  }[];
  pendingWorkflowProof?: {
    workflowControlId: string;
    kind: 'ordinary_next' | 'add_entity';
    beforeFingerprint: string;
    expectedMappingFieldId?: string;
  };
  page: { documentId: string; routeId: string } | null;
  attempts: Record<string, number>;
  verifiedControls: string[];
  recentResults: ActionReceipt[];
  audit: {
    actionId: string;
    key: string;
    sourceAnswerIds: string[];
    transformation: string;
    transformationHash: string;
    expectedHash: string | null;
    observedHash: string | null;
    status: string;
    sourceRevision: string;
  }[];
  actionCount: number;
  lastFingerprint: string;
  unchangedCount: number;
  pending: PendingAction | null;
  queued?: PendingAction[];
  lastBatchId: string | null;
  wholePage?: boolean;
  reobserve?: boolean;
  expectedNavigation?: boolean;
  completedPages?: number;
  pagePasses?: number;
  plannedControls?: { key: string; expectedHash: string }[];
  skippedControls?: {
    key: string;
    shape: string;
    routeId: string;
    sourceRevision: string;
    reason: string;
  }[];
}

export interface StoredCheckpoint {
  value: Checkpoint;
  etag: string;
}

export interface CheckpointStore {
  create(partition: string, jobId: string, value: Checkpoint): Promise<void>;
  read(partition: string, jobId: string): Promise<StoredCheckpoint | null>;
  replace(partition: string, jobId: string, value: Checkpoint, etag: string): Promise<void>;
  delete(partition: string, jobId: string, etag: string): Promise<void>;
  purgeExpired(now: string): Promise<void>;
}

export class ConflictError extends Error {
  public constructor(
    message: string,
    public readonly clientRevision?: number,
    public readonly serverRevision?: number,
  ) {
    super(message);
  }
}

export class MemoryCheckpointStore implements CheckpointStore {
  private readonly values = new Map<string, StoredCheckpoint>();

  public create(partition: string, jobId: string, value: Checkpoint): Promise<void> {
    const key = partition + '/' + jobId;
    if (this.values.has(key)) throw new ConflictError('conflict');
    this.values.set(key, { value: structuredClone(value), etag: '0' });
    return Promise.resolve();
  }
  public read(partition: string, jobId: string): Promise<StoredCheckpoint | null> {
    return Promise.resolve(structuredClone(this.values.get(partition + '/' + jobId) ?? null));
  }
  public replace(partition: string, jobId: string, value: Checkpoint, etag: string): Promise<void> {
    const key = partition + '/' + jobId;
    if (this.values.get(key)?.etag !== etag) throw new ConflictError('conflict');
    this.values.set(key, { value: structuredClone(value), etag: String(Number(etag) + 1) });
    return Promise.resolve();
  }
  public delete(partition: string, jobId: string, etag: string): Promise<void> {
    const key = partition + '/' + jobId;
    if (this.values.get(key)?.etag !== etag) throw new ConflictError('conflict');
    this.values.delete(key);
    return Promise.resolve();
  }
  public purgeExpired(now: string): Promise<void> {
    for (const [key, item] of this.values)
      if (item.value.view.binding.expiresAt <= now) this.values.delete(key);
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

export class AzureCheckpointStore implements CheckpointStore {
  private readonly client: TableClient;

  public constructor(endpoint: string, table: string) {
    this.client = new TableClient(endpoint, table, new DefaultAzureCredential());
  }
  private entity(
    partition: string,
    jobId: string,
    value: Checkpoint,
  ): Record<string, string | number> & { partitionKey: string; rowKey: string } {
    const serialized = JSON.stringify(value);
    if (serialized.length > 180_000) throw new Error('checkpoint_too_large');
    const chunks = serialized.match(/[\s\S]{1,12000}/g) ?? [];
    return {
      partitionKey: partition,
      rowKey: jobId,
      recordType: 'job',
      expiresAt: value.view.binding.expiresAt,
      chunks: chunks.length,
      ...Object.fromEntries(chunks.map((chunk, index) => ['payload' + index, chunk])),
    };
  }
  public async create(partition: string, jobId: string, value: Checkpoint): Promise<void> {
    await this.client.createEntity(this.entity(partition, jobId, value));
  }
  public async read(partition: string, jobId: string): Promise<StoredCheckpoint | null> {
    try {
      const entity = await this.client.getEntity<Record<string, unknown>>(partition, jobId);
      const payload = Array.from({ length: Number(entity.chunks) }, (_, index) =>
        String(entity['payload' + index]),
      ).join('');
      if (!entity.etag) throw new Error('missing_etag');
      return { value: JSON.parse(payload) as Checkpoint, etag: entity.etag };
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  }
  public async replace(
    partition: string,
    jobId: string,
    value: Checkpoint,
    etag: string,
  ): Promise<void> {
    try {
      await this.client.updateEntity(this.entity(partition, jobId, value), 'Replace', { etag });
    } catch (error) {
      if (statusCode(error) === 412) throw new ConflictError('conflict');
      throw error;
    }
  }
  public async delete(partition: string, jobId: string, etag: string): Promise<void> {
    try {
      await this.client.deleteEntity(partition, jobId, { etag });
    } catch (error) {
      if (statusCode(error) === 412) throw new ConflictError('conflict');
      throw error;
    }
  }
  public async purgeExpired(now: string): Promise<void> {
    const entities = this.client.listEntities({
      queryOptions: { filter: odata`expiresAt lt ${now}`, select: ['PartitionKey', 'RowKey'] },
    });
    for await (const entity of entities) {
      // Training drafts share this table but outlive their tab-bound capabilities. Only job
      // UUID rows belong to this cleanup; training-* rows are durable, value-free metadata.
      if (
        entity.partitionKey &&
        entity.rowKey &&
        /^[a-f0-9-]{36}$/.test(entity.rowKey) &&
        entity.etag
      ) {
        try {
          await this.client.deleteEntity(entity.partitionKey, entity.rowKey, { etag: entity.etag });
        } catch (error) {
          if (![404, 412].includes(statusCode(error) ?? 0)) throw error;
        }
      }
    }
  }
}
