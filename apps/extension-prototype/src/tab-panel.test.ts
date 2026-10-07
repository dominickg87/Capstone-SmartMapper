import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTabPanel } from './tab-panel.js';

vi.mock('./session.js', () => ({ trustedStorage: () => Promise.resolve() }));

type ActionListener = Parameters<typeof chrome.action.onClicked.addListener>[0];
type UpdatedListener = Parameters<typeof chrome.tabs.onUpdated.addListener>[0];
type RemovedListener = Parameters<typeof chrome.tabs.onRemoved.addListener>[0];

function tab(id: number, url = 'https://carrier.example.test/quote'): chrome.tabs.Tab {
  return {
    id,
    url,
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
}

function harness(initial: Record<string, unknown> = {}) {
  const storage = { ...initial };
  let clicked: ActionListener = () => undefined;
  let updated: UpdatedListener = () => undefined;
  let removed: RemovedListener = () => undefined;
  const api = {
    sidePanel: {
      setOptions: vi.fn<(options: chrome.sidePanel.PanelOptions) => Promise<void>>(() =>
        Promise.resolve(),
      ),
      setPanelBehavior: vi.fn(() => Promise.resolve()),
      open: vi.fn<(options: chrome.sidePanel.OpenOptions) => Promise<void>>(() =>
        Promise.resolve(),
      ),
    },
    action: {
      onClicked: { addListener: (listener: ActionListener) => (clicked = listener) },
      setBadgeText: vi.fn(() => Promise.resolve()),
      setTitle: vi.fn(() => Promise.resolve()),
    },
    tabs: {
      onUpdated: { addListener: (listener: UpdatedListener) => (updated = listener) },
      onRemoved: { addListener: (listener: RemovedListener) => (removed = listener) },
    },
    storage: {
      session: {
        get: vi.fn<() => Promise<Record<string, unknown>>>(() => Promise.resolve({ ...storage })),
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
  installTabPanel();
  return {
    api,
    storage,
    click: (value: chrome.tabs.Tab) => clicked(value),
    navigate: (id: number, url: string) => updated(id, { url }, tab(id, url)),
    close: (id: number) => removed(id, { windowId: 1, isWindowClosing: false }),
  };
}

describe('toolbar panel activation', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens inside the click handler before any storage read can settle', async () => {
    const { api, click } = harness();
    let finishRead: (value: Record<string, unknown>) => void = () => undefined;
    api.storage.session.get.mockImplementationOnce(
      () => new Promise((resolve) => (finishRead = resolve)),
    );
    click(tab(42));
    expect(api.sidePanel.setOptions).toHaveBeenCalledWith({
      tabId: 42,
      path: 'sidepanel.html?tabId=42',
      enabled: true,
    });
    expect(api.sidePanel.open).toHaveBeenCalledExactlyOnceWith({ tabId: 42 });
    // The regression waited for this storage callback before calling open().
    await Promise.resolve();
    expect(api.storage.session.set).not.toHaveBeenCalled();
    finishRead({ panelTab: { tabId: 10, origin: 'https://old.example.test' } });
    await vi.waitFor(() => expect(api.storage.session.set).toHaveBeenCalled());
    expect(api.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 10, enabled: false });
  });

  it('retains one owner across rapid clicks and a restarted worker', async () => {
    const { api, click, storage } = harness({
      panelTab: { tabId: 10, origin: 'https://old.example.test' },
    });
    click(tab(42));
    click(tab(43));
    await vi.waitFor(() =>
      expect(storage.panelTab).toEqual({
        tabId: 43,
        origin: 'https://carrier.example.test',
      }),
    );
    expect(api.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 10, enabled: false });
    expect(api.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false });
    expect(api.sidePanel.open.mock.calls).toEqual([[{ tabId: 42 }], [{ tabId: 43 }]]);
    expect(
      api.sidePanel.setOptions.mock.calls.filter(([options]) => options.tabId === undefined),
    ).toEqual([[{ path: 'sidepanel.html', enabled: false }]]);
  });

  it('keeps same-origin navigation and clears ownership on an origin change or tab close', async () => {
    const { api, click, navigate, close, storage } = harness();
    click(tab(42));
    await vi.waitFor(() => expect(storage.panelTab).toBeDefined());
    navigate(42, 'https://carrier.example.test/next');
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.panelTab).toBeDefined();
    navigate(42, 'https://different.example.test/quote');
    await vi.waitFor(() => expect(storage.panelTab).toBeUndefined());
    expect(api.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 42, enabled: false });
    click(tab(43));
    await vi.waitFor(() => expect(storage.panelTab).toBeDefined());
    close(43);
    await vi.waitFor(() => expect(storage.panelTab).toBeUndefined());
  });

  it('does not disable the newest owner when rapidly returning to the persisted tab', async () => {
    const { api, click, storage } = harness({
      panelTab: { tabId: 42, origin: 'https://carrier.example.test' },
    });
    click(tab(43));
    click(tab(42));
    await vi.waitFor(() => expect(api.storage.session.set).toHaveBeenCalled());
    expect(storage.panelTab).toEqual({ tabId: 42, origin: 'https://carrier.example.test' });
    expect(api.sidePanel.setOptions).not.toHaveBeenCalledWith({ tabId: 42, enabled: false });
    expect(api.sidePanel.setOptions).toHaveBeenCalledWith({ tabId: 43, enabled: false });
  });

  it('does not let an old navigation event disable a newly activated owner', async () => {
    const { api, click, navigate, storage } = harness({
      panelTab: { tabId: 42, origin: 'https://old.example.test' },
    });
    navigate(42, 'https://different.example.test/quote');
    click(tab(42));
    await vi.waitFor(() =>
      expect(storage.panelTab).toEqual({
        tabId: 42,
        origin: 'https://carrier.example.test',
      }),
    );
    expect(api.sidePanel.setOptions).not.toHaveBeenCalledWith({ tabId: 42, enabled: false });
  });

  it('reports an opening failure without logging the carrier URL or raw error', async () => {
    const { api, click } = harness();
    api.sidePanel.open.mockRejectedValueOnce(
      new Error('user gesture lost at https://carrier.example.test/quote?private=secret'),
    );
    click(tab(42));
    await vi.waitFor(() =>
      expect(console.warn).toHaveBeenCalledWith('smartmapper.panel', {
        code: 'panel_open_failed',
      }),
    );
    expect(api.action.setBadgeText).toHaveBeenCalledWith({ tabId: 42, text: '!' });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret');
  });

  it('ignores restricted pages and missing tab metadata', () => {
    const { api, click } = harness();
    click(tab(42, 'chrome://extensions'));
    const missingId = tab(43);
    delete missingId.id;
    click(missingId);
    expect(api.sidePanel.open).not.toHaveBeenCalled();
  });
});
