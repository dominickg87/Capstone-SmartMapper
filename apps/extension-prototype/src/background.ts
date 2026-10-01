import { z } from 'zod';
import { config } from './config.js';
import { trustedStorage } from './session.js';

const pendingSchema = z.object({ tabId: z.number(), state: z.string(), expiresAt: z.number() });
const connectionSchema = z.object({
  access_token: z.string().regex(/^mia_ext_[A-Za-z0-9]+$/),
  expires_at: z.string().datetime({ offset: true }),
});
const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('connect') }).strict(),
  z.object({ type: z.literal('connection-result'), payload: connectionSchema }).strict(),
]);

async function handle(input: unknown, sender: chrome.runtime.MessageSender): Promise<void> {
  const message = messageSchema.parse(input);
  await trustedStorage();
  if (message.type === 'connect') {
    if (
      sender.id !== chrome.runtime.id ||
      sender.url !== chrome.runtime.getURL('sidepanel.html') ||
      sender.tab
    )
      throw new Error('invalid_sender');
    const state = crypto.randomUUID();
    const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    if (tab.id === undefined) throw new Error('tab_missing');
    await chrome.storage.session.set({
      connection: { tabId: tab.id, state, expiresAt: Date.now() + 15 * 60_000 },
    });
    await chrome.tabs.update(tab.id, {
      url: config.miaOrigin + '/extension/connect?extension_state=' + state,
    });
    return;
  }
  const stored: Record<string, unknown> = await chrome.storage.session.get('connection');
  const pending = pendingSchema.parse(stored.connection);
  const url = new URL(sender.url ?? 'about:blank');
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    sender.tab?.id !== pending.tabId ||
    sender.origin !== config.miaOrigin ||
    url.origin !== config.miaOrigin ||
    url.pathname !== '/extension/connect' ||
    url.searchParams.get('extension_state') !== pending.state ||
    pending.expiresAt <= Date.now() ||
    Date.parse(message.payload.expires_at) <= Date.now()
  )
    throw new Error('invalid_connection');
  const response = await fetch(config.miaOrigin + '/api/extension/me', {
    headers: {
      authorization: 'Bearer ' + message.payload.access_token,
      accept: 'application/json',
    },
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('connection_rejected');
  const profile = z
    .object({
      user: z.object({ id: z.union([z.string(), z.number()]) }),
      tenant: z.object({ id: z.string() }),
    })
    .parse(await response.json());
  await chrome.storage.session.remove('connection');
  await chrome.storage.session.set({
    miaToken: message.payload.access_token,
    principal: profile.tenant.id + '/' + profile.user.id,
  });
}

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
chrome.action.onClicked.addListener((tab) => {
  void chrome.sidePanel.open({ windowId: tab.windowId });
});
void trustedStorage();
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  queue = queue
    .then(() => handle(message, sender))
    .then(() => {
      respond({ ok: true });
    })
    .catch(() => {
      respond({
        ok: false,
        error: 'Connection failed. Start sign-in from the SmartMapper panel again.',
      });
    });
  return true;
});
