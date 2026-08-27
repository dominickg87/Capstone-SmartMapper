import {
  initialRunState,
  parseExtensionResponse,
  type ExtensionMessage,
  type ExtensionResponse,
  type PersistedRunState,
} from './messages.js';

const storageKey = 'smartmapperRunStateV1';

async function readState(): Promise<PersistedRunState> {
  const stored = await chrome.storage.local.get(storageKey);
  return (stored[storageKey] as PersistedRunState | undefined) ?? initialRunState;
}

async function writeState(state: PersistedRunState): Promise<void> {
  await chrome.storage.local.set({ [storageKey]: state });
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function detectActivePage(): Promise<ExtensionResponse> {
  const tab = await activeTab();
  if (!tab?.id) {
    return { error: 'No active tab is available.' };
  }

  try {
    const detection: unknown = await chrome.tabs.sendMessage(tab.id, {
      type: 'detect-page',
    } satisfies ExtensionMessage);
    return parseExtensionResponse(detection);
  } catch {
    return { error: 'Open a localhost mock carrier page before starting.' };
  }
}

async function updateStatus(
  status: PersistedRunState['status'],
  progressMessage: string,
): Promise<PersistedRunState> {
  const current = await readState();
  const state: PersistedRunState = {
    ...current,
    status,
    progress: [...current.progress, progressMessage].slice(-12),
    updatedAt: new Date().toISOString(),
  };
  await writeState(state);
  return state;
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  if (message.type === 'detect-page') {
    return detectActivePage();
  }
  if (message.type === 'get-state') {
    return { state: await readState() };
  }
  if (message.type === 'start-run') {
    const tab = await activeTab();
    const detectionResponse = await detectActivePage();
    if (!detectionResponse.detection?.supported || !tab?.id) {
      return detectionResponse.error
        ? detectionResponse
        : { error: detectionResponse.detection?.reason ?? 'Unsupported page.' };
    }

    /*
     * Production authentication and short-lived quote retrieval will be injected
     * here through an approved backend boundary. Payloads must not be persisted
     * in extension storage; this prototype stores only a synthetic reference.
     */
    const state: PersistedRunState = {
      version: '1.0',
      status: 'running',
      quoteReference: message.quoteReference,
      activeTabId: tab.id,
      progress: ['Page recognized', 'Synthetic quote selected', 'Run started'],
      reviewItems: [],
      updatedAt: new Date().toISOString(),
    };
    await writeState(state);
    return { state, detection: detectionResponse.detection };
  }
  if (message.type === 'pause-run') {
    return { state: await updateStatus('paused', 'Run paused by user') };
  }
  if (message.type === 'resume-run') {
    return { state: await updateStatus('running', 'Run resumed from persisted state') };
  }

  return { state: await updateStatus('cancelled', 'Run cancelled; transient data discarded') };
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ) => {
    void handleMessage(message).then(sendResponse);
    return true;
  },
);
