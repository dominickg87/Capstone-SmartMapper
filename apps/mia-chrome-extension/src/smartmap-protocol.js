import manifest from '../manifest.json';

// Bundled into both entry points so a rebuilt panel can detect a stale worker.
export const SMART_MAP_PROTOCOL_VERSION = 1;
export const SMART_MAP_BUILD_VERSION = manifest.version_name;
export const SMART_MAP_RELOAD_MESSAGE =
  'SmartMap could not reach a compatible background worker. Reload MIA SmartMapper at chrome://extensions, then close and reopen this panel and Read Page again.';
export const SMART_MAP_INTERRUPTED_MESSAGE =
  'SmartMap did not receive the mapping result. Review any entered fields, reload MIA SmartMapper at chrome://extensions, then close and reopen this panel and Read Page again.';

export function isCompatibleSmartMapWorker(response) {
  return (
    response?.protocolVersion === SMART_MAP_PROTOCOL_VERSION &&
    response?.buildVersion === SMART_MAP_BUILD_VERSION
  );
}

export async function requireSmartMapWorker() {
  const response = await chrome.runtime
    .sendMessage({ type: 'MIA_SMART_MAP_CAPABILITIES' })
    .catch(() => null);
  if (!response?.ok || !isCompatibleSmartMapWorker(response)) {
    throw new Error(SMART_MAP_RELOAD_MESSAGE);
  }
}
