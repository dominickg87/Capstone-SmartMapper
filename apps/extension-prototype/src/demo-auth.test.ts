import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const origin = 'https://mia.example.test';
let stored: Record<string, unknown>, currentUrl: string;
const panel = {
  id: 'synthetic-extension',
  url: 'chrome-extension://synthetic-extension/sidepanel.html?tabId=2',
};
const payload = {
  access_token: 'mia_ext_syntheticTokenForTests1234567890',
  expires_at: '2030-01-01T00:00:00Z',
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  stored = {};
  currentUrl = 'about:blank';
  vi.stubGlobal('__HOME_DEMO_CONFIG__', {
    miaOrigin: origin,
    carrierOrigin: 'https://carrier.example.test',
  });
  vi.stubGlobal('chrome', {
    runtime: {
      id: panel.id,
      getURL: (path: string) => 'chrome-extension://synthetic-extension/' + path,
    },
    storage: {
      session: {
        setAccessLevel: vi.fn(() => Promise.resolve()),
        get: vi.fn(() => Promise.resolve({ ...stored })),
        set: vi.fn((data: Record<string, unknown>) => {
          Object.assign(stored, data);
          return Promise.resolve();
        }),
        remove: vi.fn((keys: string | string[]) => {
          for (const key of typeof keys === 'string' ? [keys] : keys) delete stored[key];
          return Promise.resolve();
        }),
      },
    },
    tabs: {
      create: vi.fn(() => Promise.resolve({ id: 7 })),
      update: vi.fn((_id: number, options: { url: string }) => {
        currentUrl = options.url;
        return Promise.resolve();
      }),
      get: vi.fn(() => Promise.resolve({ url: currentUrl })),
      remove: vi.fn(() => Promise.resolve()),
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ success: true, user: { id: 3 }, tenant: { id: 'synthetic-tenant' } }),
          { status: 200 },
        ),
      ),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function begun() {
  const { handleDemoAuth } = await import('./demo-auth.js');
  await handleDemoAuth({ type: 'connect' }, panel);
  return {
    handleDemoAuth,
    sender: {
      id: panel.id,
      url: currentUrl,
      origin,
      frameId: 0,
      tab: { id: 7 },
    } as chrome.runtime.MessageSender,
  };
}
describe('demo M.I.A. connection', () => {
  it('verifies the exact initiated handoff and saves only a trusted session', async () => {
    const { handleDemoAuth, sender } = await begun();
    await handleDemoAuth({ type: 'connection-result', payload }, sender);
    expect(fetch).toHaveBeenCalledWith(
      origin + '/api/extension/me',
      expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' }),
    );
    expect(stored.homeDemoConnection).toEqual({
      token: payload.access_token,
      expiresAt: payload.expires_at,
      principal: 'synthetic-tenant/3',
    });
    expect(stored.homeDemoPending).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1200);
    expect(chrome.tabs.remove).toHaveBeenCalledWith(7);
  });
  it.each(['origin', 'tab', 'frame', 'nonce'])(
    'rejects a mismatched %s before verifying a token',
    async (mismatch) => {
      const { handleDemoAuth, sender } = await begun();
      if (mismatch === 'origin') sender.origin = 'https://other.example.test';
      if (mismatch === 'tab') sender.tab = { id: 8 } as chrome.tabs.Tab;
      if (mismatch === 'frame') sender.frameId = 1;
      if (mismatch === 'nonce') sender.url = origin + '/extension/connect?extension_state=wrong';
      await expect(
        handleDemoAuth({ type: 'connection-result', payload }, sender),
      ).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
      expect(stored.homeDemoConnection).toBeUndefined();
    },
  );
  it('rejects replayed, expired and unsolicited handoffs', async () => {
    const { handleDemoAuth, sender } = await begun();
    await expect(
      handleDemoAuth(
        { type: 'connection-result', payload: { ...payload, expires_at: '2020-01-01T00:00:00Z' } },
        sender,
      ),
    ).rejects.toThrow();
    await handleDemoAuth({ type: 'connection-result', payload }, sender);
    await expect(handleDemoAuth({ type: 'connection-result', payload }, sender)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects connections started by a page or failed profile verification', async () => {
    const { handleDemoAuth } = await import('./demo-auth.js');
    await expect(
      handleDemoAuth({ type: 'connect' }, { ...panel, tab: { id: 5 } as chrome.tabs.Tab }),
    ).rejects.toThrow();
    const begunFlow = await begun();
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(
      begunFlow.handleDemoAuth({ type: 'connection-result', payload }, begunFlow.sender),
    ).rejects.toThrow();
    expect(stored.homeDemoConnection).toBeUndefined();
  });
  it('clears expired API sessions and does not send quote data through the catalog service', async () => {
    stored.homeDemoConnection = {
      token: payload.access_token,
      expiresAt: payload.expires_at,
      principal: 'synthetic/3',
    };
    const { searchDemoQuotes } = await import('./demo-api.js');
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(searchDemoQuotes('Synthetic')).rejects.toThrow(/expired/);
    expect(stored.homeDemoConnection).toBeUndefined();
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      origin + '/api/extension/quotes/search?limit=25&query=Synthetic',
    );
  });
});
