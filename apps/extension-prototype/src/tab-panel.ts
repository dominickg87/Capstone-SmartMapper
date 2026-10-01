import { trustedStorage } from './session.js';

export function installTabPanel(): void {
  // Disable the global panel. Only an explicit toolbar activation enables one tab.
  void chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: false });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  let selected: number | undefined;
  let activation = 0;
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id === undefined || !tab.url || !/^https?:/.test(tab.url)) return;
    const tabId = tab.id;
    const origin = new URL(tab.url).origin;
    const generation = ++activation;
    // Chrome API callbacks retain the toolbar gesture, unlike promise continuations.
    // Read the prior owner from session storage so worker suspension cannot enable two tabs.
    chrome.storage.session.get('panelTab', (stored) => {
      if (chrome.runtime.lastError || generation !== activation) return;
      const previous = selected ?? (stored.panelTab as { tabId?: number } | undefined)?.tabId;
      selected = tabId;
      if (previous !== undefined && previous !== tabId)
        void chrome.sidePanel
          .setOptions({ tabId: previous, enabled: false })
          .catch(() => undefined);
      const configured = chrome.sidePanel.setOptions({
        tabId,
        path: 'sidepanel.html?tabId=' + tabId,
        enabled: true,
      });
      const opening = chrome.sidePanel.open({ tabId }).catch(() => undefined);
      void configured
        .then(async () => {
          if (selected !== tabId || generation !== activation) return;
          await trustedStorage();
          if (selected !== tabId || generation !== activation) return;
          await chrome.storage.session.set({ panelTab: { tabId, origin } });
          await opening;
        })
        .catch(() => undefined);
    });
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (!info.url) return;
    void chrome.storage.session.get('panelTab').then(async (stored) => {
      const panel = stored.panelTab as { tabId?: number; origin?: string } | undefined;
      if (panel?.tabId !== tabId || new URL(info.url!).origin === panel.origin) return;
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
      await chrome.storage.session.remove('panelTab');
      if (selected === tabId) selected = undefined;
    });
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.session.get('panelTab').then(async (stored) => {
      if ((stored.panelTab as { tabId?: number } | undefined)?.tabId === tabId)
        await chrome.storage.session.remove('panelTab');
    });
    if (selected === tabId) selected = undefined;
  });
}
