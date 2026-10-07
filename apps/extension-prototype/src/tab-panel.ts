import { trustedStorage } from './session.js';

export function installTabPanel(): void {
  // Disable the global panel. Only an explicit toolbar activation enables one tab.
  void chrome.sidePanel
    .setOptions({ path: 'sidepanel.html', enabled: false })
    .catch(() => reportPanelError('panel_setup_failed'));
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => reportPanelError('panel_setup_failed'));
  let selected: number | undefined;
  let activation = 0;
  let ownership = Promise.resolve();
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id === undefined || !tab.url || !/^https?:/.test(tab.url)) return;
    const tabId = tab.id;
    const origin = new URL(tab.url).origin;
    const generation = ++activation;
    const previous = selected;
    selected = tabId;
    if (previous !== undefined && previous !== tabId) disablePanel(previous);

    // Issue both Chrome requests directly inside the toolbar gesture. Storage reads,
    // callbacks and promise continuations must never delay sidePanel.open(). Chrome
    // processes the setOptions request before the immediately following open request.
    const configured = chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html?tabId=' + tabId,
      enabled: true,
    });
    const opening = chrome.sidePanel.open({ tabId });
    void Promise.all([configured, opening])
      .then(() => {
        if (generation !== activation) return;
        void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined);
        void chrome.action.setTitle({ tabId, title: 'Open SmartMapper' }).catch(() => undefined);
      })
      .catch(() => {
        if (generation !== activation) return;
        reportPanelError('panel_open_failed', tabId);
      });

    // Reconcile the persisted owner after opening, including after worker suspension.
    // Serialize writes so a slow prior activation cannot overwrite the newest owner.
    ownership = ownership
      .then(async () => {
        const stored = await chrome.storage.session.get('panelTab');
        const persisted = (stored.panelTab as { tabId?: number } | undefined)?.tabId;
        if (selected !== tabId || generation !== activation) return;
        if (persisted !== undefined && persisted !== tabId) disablePanel(persisted);
        await trustedStorage();
        if (selected !== tabId || generation !== activation) return;
        await chrome.storage.session.set({ panelTab: { tabId, origin } });
      })
      .catch(() => reportPanelError('panel_state_failed', tabId));
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (!info.url) return;
    const generation = activation;
    ownership = ownership
      .then(async () => {
        const stored = await chrome.storage.session.get('panelTab');
        if (generation !== activation) return;
        const panel = stored.panelTab as { tabId?: number; origin?: string } | undefined;
        if (panel?.tabId !== tabId || new URL(info.url!).origin === panel.origin) return;
        await chrome.sidePanel.setOptions({ tabId, enabled: false });
        if (generation !== activation) return;
        await chrome.storage.session.remove('panelTab');
        if (selected === tabId) {
          selected = undefined;
          activation += 1;
        }
      })
      .catch(() => reportPanelError('panel_state_failed', tabId));
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (selected === tabId) {
      selected = undefined;
      activation += 1;
    }
    ownership = ownership
      .then(async () => {
        const stored = await chrome.storage.session.get('panelTab');
        if ((stored.panelTab as { tabId?: number } | undefined)?.tabId === tabId)
          await chrome.storage.session.remove('panelTab');
      })
      .catch(() => reportPanelError('panel_state_failed'));
  });
}

function disablePanel(tabId: number): void {
  // A previous owner may already have been closed; that cleanup failure is harmless.
  void chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => undefined);
}

function reportPanelError(code: string, tabId?: number): void {
  console.warn('smartmapper.panel', { code });
  if (tabId === undefined) return;
  void chrome.action.setBadgeText({ tabId, text: '!' }).catch(() => undefined);
  void chrome.action
    .setTitle({ tabId, title: 'SmartMapper panel could not open. Reload the extension and retry.' })
    .catch(() => undefined);
}
