import { DefaultAzureCredential } from '@azure/identity';
import { odata, TableClient } from '@azure/data-tables';
import { LearnedMappingSchema, type LearnedMapping } from '@smartmapper/contracts';

// Partitions are the job partition hash (tenant, user, carrier origin), so a user's approved
// mappings apply only to that user's jobs on that carrier. Entries hold no answer values or labels.
export interface MappingMemoryStore {
  list(partition: string): Promise<LearnedMapping[]>;
  get(partition: string, signature: string): Promise<LearnedMapping | null>;
  put(partition: string, entry: LearnedMapping): Promise<void>;
}

export class MemoryMappingStore implements MappingMemoryStore {
  private readonly values = new Map<string, Map<string, LearnedMapping>>();

  public list(partition: string): Promise<LearnedMapping[]> {
    return Promise.resolve(structuredClone([...(this.values.get(partition)?.values() ?? [])]));
  }
  public get(partition: string, signature: string): Promise<LearnedMapping | null> {
    return Promise.resolve(structuredClone(this.values.get(partition)?.get(signature) ?? null));
  }
  public put(partition: string, entry: LearnedMapping): Promise<void> {
    const parsed = LearnedMappingSchema.parse(entry);
    const entries = this.values.get(partition) ?? new Map<string, LearnedMapping>();
    entries.set(parsed.signature, structuredClone(parsed));
    this.values.set(partition, entries);
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

function parseEntity(entity: Record<string, unknown>): LearnedMapping | null {
  try {
    const parsed = LearnedMappingSchema.safeParse(JSON.parse(String(entity.payload)));
    return parsed.success && parsed.data.signature === entity.rowKey ? parsed.data : null;
  } catch {
    return null;
  }
}

export class AzureMappingStore implements MappingMemoryStore {
  private readonly client: TableClient;

  public constructor(endpoint: string, table: string) {
    this.client = new TableClient(endpoint, table, new DefaultAzureCredential());
  }
  public async list(partition: string): Promise<LearnedMapping[]> {
    const result: LearnedMapping[] = [];
    const entities = this.client.listEntities<Record<string, unknown>>({
      queryOptions: { filter: odata`PartitionKey eq ${partition}` },
    });
    for await (const entity of entities) {
      // Invalid or tampered rows are ignored; the model handles those fields instead.
      const entry = parseEntity(entity);
      if (entry) result.push(entry);
    }
    return result;
  }
  public async get(partition: string, signature: string): Promise<LearnedMapping | null> {
    try {
      return parseEntity(
        await this.client.getEntity<Record<string, unknown>>(partition, signature),
      );
    } catch (error) {
      if (statusCode(error) === 404) return null;
      throw error;
    }
  }
  public async put(partition: string, entry: LearnedMapping): Promise<void> {
    const parsed = LearnedMappingSchema.parse(entry);
    await this.client.upsertEntity(
      { partitionKey: partition, rowKey: parsed.signature, payload: JSON.stringify(parsed) },
      'Replace',
    );
  }
}
