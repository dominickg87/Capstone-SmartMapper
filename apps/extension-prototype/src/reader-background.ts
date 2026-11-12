void chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: false });
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined || !tab.url || !/^https?:/.test(tab.url)) return;
  const tabId = tab.id;
  const configured = chrome.sidePanel.setOptions({
    tabId,
    path: `sidepanel.html?tabId=${tabId}`,
    enabled: true,
  });
  // Keep open() in the toolbar gesture so Chrome permits the side panel to open.
  const opening = chrome.sidePanel.open({ tabId });
  void Promise.all([configured, opening])
    .then(() => chrome.action.setBadgeText({ tabId, text: '' }))
    .catch(() => {
      void chrome.action.setBadgeText({ tabId, text: '!' });
    });
});
