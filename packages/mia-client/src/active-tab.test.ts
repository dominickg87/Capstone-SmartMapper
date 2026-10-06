import { describe, expect, it, vi } from 'vitest';
import { MiaActiveTabSourceProvider } from './active-tab.js';

describe('M.I.A. active-tab source provider', () => {
  it('uses only the structured source endpoint for deterministic mapping', async () => {
    const source = {
      version: '2.0' as const,
      tenantId: 'tenant',
      userId: 'user',
      quoteId: 'quote',
      formType: 'home',
      revision: 'r1',
      answers: [],
      unavailablePaths: [],
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(source), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new MiaActiveTabSourceProvider(new Set(['https://mia.test']), fetcher);
    await expect(provider.read('https://mia.test', 's'.repeat(43))).resolves.toEqual(source);
    const requested = fetcher.mock.calls[0]?.[0];
    const requestedUrl =
      typeof requested === 'string'
        ? requested
        : requested instanceof URL
          ? requested.href
          : requested?.url;
    expect(requestedUrl).toBe('https://mia.test/api/extension/smartmapper/v2/source');
  });
});
