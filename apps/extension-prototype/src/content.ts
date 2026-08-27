import type { ExtensionMessage, ExtensionResponse, PageDetection } from './messages.js';

function detectPage(): PageDetection {
  const allowedHosts = new Set(['localhost:4173', '127.0.0.1:4173']);
  if (!allowedHosts.has(window.location.host)) {
    return {
      supported: false,
      pagePath: window.location.pathname,
      reason: 'Only the localhost mock carrier is allowed.',
    };
  }

  const adapterId =
    window.location.pathname === '/modern'
      ? 'mock-modern'
      : window.location.pathname === '/classic'
        ? 'mock-classic'
        : undefined;

  if (!adapterId) {
    return {
      supported: false,
      pagePath: window.location.pathname,
      reason: 'No mock adapter recognizes this page.',
    };
  }

  return {
    supported: true,
    adapterId,
    pagePath: window.location.pathname,
    reason: 'Recognized from the localhost path and semantic mock page.',
  };
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ) => {
    if (message.type === 'detect-page') {
      sendResponse({ detection: detectPage() });
    }
  },
);
