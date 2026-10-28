import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({
  config: { miaOrigin: 'https://demo.mia.agency' },
}));
vi.mock('./session.js', () => ({ trustedStorage: () => Promise.resolve() }));
vi.mock('./tab-panel.js', () => ({ installTabPanel: vi.fn() }));

type MessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];
type PendingConnection = { tabId: number; state: string; expiresAt: number };

const miaOrigin = 'https://demo.mia.agency';
const extensionId = 'synthetic-extension';
const token = 'mia_ext_synthetic123';
const extensionUrl = (path: string) => `chrome-extension://${extensionId}/${path}`;

async function harness() {
  vi.resetModules();
  const storage: Record<string, unknown> = {};
  let listener: MessageListener = () => false;
  const tab: chrome.tabs.Tab = {
    id: 42,
    index: 0,
    windowId: 1,
    active: true,
    selected: true,
    highlighted: true,
    pinned: false,
    incognito: false,
    discarded: false,
    frozen: false,
    lastAccessed: 0,
    autoDiscardable: true,
    groupId: -1,
  };
  const fetchMock = vi.fn<typeof fetch>();
  const api = {
    runtime: {
      id: extensionId,
      getURL: extensionUrl,
      onMessage: { addListener: (value: MessageListener) => (listener = value) },
    },
    tabs: {
      create: vi.fn(() => Promise.resolve(tab)),
      update: vi.fn<
        (id: number, properties: chrome.tabs.UpdateProperties) => Promise<chrome.tabs.Tab>
      >(() => Promise.resolve(tab)),
    },
    storage: {
      session: {
        get: vi.fn(() => Promise.resolve({ ...storage })),
        set: vi.fn((value: Record<string, unknown>) => {
          Object.assign(storage, value);
          return Promise.resolve();
        }),
        remove: vi.fn((key: string) => {
          delete storage[key];
          return Promise.resolve();
        }),
      },
    },
  };
  vi.stubGlobal('chrome', api);
  vi.stubGlobal('fetch', fetchMock);
  await import('./background.js');
  const send = (input: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> =>
    new Promise((resolveResponse) => {
      listener(input, sender, resolveResponse);
    });
  const connect = () =>
    send({ type: 'connect' }, { id: extensionId, url: extensionUrl('sidepanel.html?tabId=7') });
  return {
    api,
    storage,
    fetchMock,
    connect,
    pending: () => storage.connection as PendingConnection,
    callback: (origin = miaOrigin, state = (storage.connection as PendingConnection).state) =>
      send(
        {
          type: 'connection-result',
          payload: { access_token: token, expires_at: new Date(Date.now() + 60_000).toISOString() },
        },
        {
          id: extensionId,
          origin,
          url: `${origin}/extension/connect?extension_state=${state}`,
          frameId: 0,
          tab,
        },
      ),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M.I.A. connection authentication', () => {
  it('opens the demo connection route with a fresh state bound to the new tab', async () => {
    const { api, connect, pending, fetchMock } = await harness();
    const startedAt = Date.now();
    await expect(connect()).resolves.toEqual({ ok: true });
    expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'about:blank', active: true });
    expect(pending()).toMatchObject({ tabId: 42 });
    expect(pending().state).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(pending().expiresAt).toBeGreaterThanOrEqual(startedAt + 15 * 60_000);
    expect(pending().expiresAt).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(42, {
      url: `${miaOrigin}/extension/connect?extension_state=${pending().state}`,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves the matching demo callback only after the M.I.A. profile is verified', async () => {
    const { api, storage, fetchMock, connect, callback } = await harness();
    await connect();
    let finishVerification: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () => new Promise((resolveResponse) => (finishVerification = resolveResponse)),
    );
    const result = callback();
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        `${miaOrigin}/api/extension/me`,
        expect.objectContaining({
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
        }),
      ),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(storage.miaToken).toBeUndefined();
    expect(storage.principal).toBeUndefined();
    expect(storage.connection).toBeDefined();
    finishVerification(
      new Response(
        JSON.stringify({ user: { id: 'synthetic-user' }, tenant: { id: 'synthetic-tenant' } }),
      ),
    );
    await expect(result).resolves.toEqual({ ok: true });
    expect(storage.miaToken).toBe(token);
    expect(storage.principal).toBe('synthetic-tenant/synthetic-user');
    expect(storage.connection).toBeUndefined();
    expect(api.storage.session.remove).toHaveBeenCalledExactlyOnceWith('connection');
  });

  it.each([
    ['a mismatched state', miaOrigin, 'wrong-state'],
    ['the previous M.I.A. origin', 'https://mia.test', undefined],
  ])('rejects %s without verifying or saving a token', async (_reason, origin, state) => {
    const { storage, fetchMock, connect, callback } = await harness();
    await connect();
    await expect(callback(origin, state)).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.miaToken).toBeUndefined();
    expect(storage.principal).toBeUndefined();
    expect(storage.connection).toBeDefined();
  });
});
