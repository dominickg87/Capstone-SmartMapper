import { describe, expect, it, vi } from 'vitest';
import { AzureCheckpointStore } from './checkpoints.js';

const table = vi.hoisted(() => ({ listEntities: vi.fn(), deleteEntity: vi.fn() }));
vi.mock('@azure/data-tables', () => ({
  odata: (parts: TemplateStringsArray, ...values: string[]) =>
    parts.reduce((text, part, index) => text + part + String(values[index] ?? ''), ''),
  TableClient: class {
    public listEntities = table.listEntities;
    public deleteEntity = table.deleteEntity;
  },
}));

describe('Azure checkpoint cleanup', () => {
  it('expires only job rows and preserves saved training in the same table', async () => {
    const jobId = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    table.listEntities.mockImplementation(async function* () {
      yield await Promise.resolve({ partitionKey: 'job-scope', rowKey: jobId, etag: 'job-etag' });
      yield await Promise.resolve({
        partitionKey: 'training-scope',
        rowKey: `training-${draftId}`,
        etag: 'training-etag',
      });
    });
    table.deleteEntity.mockResolvedValue(undefined);
    await new AzureCheckpointStore('https://storage.test', 'Jobs').purgeExpired(
      new Date().toISOString(),
    );
    expect(table.deleteEntity).toHaveBeenCalledExactlyOnceWith('job-scope', jobId, {
      etag: 'job-etag',
    });
  });
});
