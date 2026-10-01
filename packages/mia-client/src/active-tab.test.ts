import { describe, expect, it, vi } from 'vitest';
import { MiaActiveTabSourceProvider } from './active-tab.js';
import { createHash } from 'node:crypto';

describe('MIA source boundary', () => {
  it('retrieves only an authenticated bounded PDF and validates its bytes and digest', async () => {
    const data = Buffer.from('%PDF-1.4 synthetic');
    const document = {
      tenantId: 'synthetic',
      userId: '7',
      quoteId: 'quote',
      revision: 'r1',
      digest: createHash('sha256').update(data).digest('hex'),
      data: data.toString('base64'),
    };
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(document)));
    const client = new MiaActiveTabSourceProvider(new Set(['https://mia.test']), fetcher);
    expect(await client.document('https://mia.test', 'synthetic-token')).toEqual(document);
    const url = fetcher.mock.calls[0]![0];
    expect(url instanceof URL ? url.href : url).toBe(
      'https://mia.test/api/extension/smartmapper/v2/quote-sheet',
    );
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: { authorization: 'Bearer synthetic-token' },
    });
    fetcher.mockImplementationOnce(() =>
      Promise.resolve(Response.json({ ...document, digest: '0'.repeat(64) })),
    );
    await expect(client.document('https://mia.test', 'synthetic-token')).rejects.toThrow(
      'invalid_quote_sheet',
    );
    fetcher.mockImplementationOnce(() =>
      Promise.resolve(new Response('small', { headers: { 'content-length': '22000000' } })),
    );
    await expect(client.document('https://mia.test', 'synthetic-token')).rejects.toThrow(
      'source_too_large',
    );
    await expect(client.document('https://untrusted.test', 'synthetic-token')).rejects.toThrow(
      'mia_origin_not_allowed',
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('refuses unapproved origins before sending a credential and rejects redirects', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ error: 'denied' }, { status: 401 })),
    );
    const client = new MiaActiveTabSourceProvider(new Set(['https://mia.test']), fetcher);
    await expect(client.read('https://untrusted.test', 'synthetic-token')).rejects.toThrow(
      'mia_origin_not_allowed',
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client.read('https://mia.test', 'synthetic-token')).rejects.toThrow(
      'mia_authorization_failed',
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url instanceof URL ? url.href : url).toBe(
      'https://mia.test/api/extension/smartmapper/v2/source',
    );
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer synthetic-token' });
  });
});
