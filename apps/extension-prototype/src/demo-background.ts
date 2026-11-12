import './reader-background.js';
import { handleDemoAuth } from './demo-auth.js';
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((input: unknown, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    !input ||
    typeof input !== 'object' ||
    !('type' in input) ||
    !['connect', 'disconnect', 'connection-result'].includes(String(input.type))
  )
    return false;
  queue = queue
    .then(() => handleDemoAuth(input, sender))
    .then(() => respond({ ok: true }))
    .catch(() =>
      respond({ ok: false, error: 'Connection failed. Start sign-in from Smart Mapper again.' }),
    );
  return true;
});
