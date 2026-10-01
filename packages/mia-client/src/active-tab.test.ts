import { describe, expect, it, vi } from 'vitest';
import { MiaActiveTabSourceProvider } from './active-tab.js';

describe('MIA source boundary', () => {
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
