import { z } from 'zod';
import { demoConfig } from './demo-config.js';
import { trustedStorage } from './session.js';

export const demoSessionSchema = z
  .object({
    token: z.string().min(20),
    expiresAt: z.string().datetime({ offset: true }),
    principal: z.string().min(1),
  })
  .strict();
export type DemoSession = z.infer<typeof demoSessionSchema>;
const pendingSchema = z.object({
  tabId: z.number().int(),
  state: z.string().uuid(),
  expiresAt: z.number(),
});
const connectionSchema = z.object({
  access_token: z.string().regex(/^mia_ext_[A-Za-z0-9]+$/),
  expires_at: z.string().datetime({ offset: true }),
});
export async function demoSession(): Promise<DemoSession | null> {
  await trustedStorage();
  const stored = await chrome.storage.session.get('homeDemoConnection');
  const parsed = demoSessionSchema.safeParse(stored.homeDemoConnection);
  return parsed.success && Date.parse(parsed.data.expiresAt) > Date.now() ? parsed.data : null;
}
export async function handleDemoAuth(
  input: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  const message = z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('connect') }).strict(),
      z.object({ type: z.literal('disconnect') }).strict(),
      z.object({ type: z.literal('connection-result'), payload: connectionSchema }).strict(),
    ])
    .parse(input);
  await trustedStorage();
  if (message.type !== 'connection-result') {
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab ||
      sender.url?.split('?')[0] !== chrome.runtime.getURL('sidepanel.html')
    )
      throw new Error('invalid_sender');
    if (message.type === 'disconnect') {
      await chrome.storage.session.remove(['homeDemoConnection', 'homeDemoPending']);
      return;
    }
    const state = crypto.randomUUID();
    const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    if (tab.id === undefined) throw new Error('missing_tab');
    await chrome.storage.session.set({
      homeDemoPending: { tabId: tab.id, state, expiresAt: Date.now() + 15 * 60_000 },
    });
    await chrome.tabs.update(tab.id, {
      url: `${demoConfig.miaOrigin}/extension/connect?extension_state=${state}`,
    });
    return;
  }
  const stored = await chrome.storage.session.get('homeDemoPending');
  const pending = pendingSchema.parse(stored.homeDemoPending);
  const url = new URL(sender.url ?? 'about:blank');
  if (
    sender.id !== chrome.runtime.id ||
    sender.frameId !== 0 ||
    sender.tab?.id !== pending.tabId ||
    sender.origin !== demoConfig.miaOrigin ||
    url.origin !== demoConfig.miaOrigin ||
    url.pathname !== '/extension/connect' ||
    url.searchParams.get('extension_state') !== pending.state ||
    pending.expiresAt <= Date.now() ||
    Date.parse(message.payload.expires_at) <= Date.now()
  )
    throw new Error('invalid_connection');
  const response = await fetch(demoConfig.miaOrigin + '/api/extension/me', {
    headers: {
      Authorization: 'Bearer ' + message.payload.access_token,
      Accept: 'application/json',
    },
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('connection_rejected');
  const profile = z
    .object({
      success: z.literal(true),
      user: z.object({ id: z.union([z.string(), z.number()]) }),
      tenant: z.object({ id: z.string().min(1) }),
    })
    .parse(await response.json());
  await chrome.storage.session.remove('homeDemoPending');
  await chrome.storage.session.set({
    homeDemoConnection: {
      token: message.payload.access_token,
      expiresAt: message.payload.expires_at,
      principal: profile.tenant.id + '/' + profile.user.id,
    },
  });
  // Only close our own verified handoff tab, never a tab the user navigated elsewhere.
  setTimeout(() => {
    void chrome.tabs
      .get(pending.tabId)
      .then((tab) => (tab.url === url.href ? chrome.tabs.remove(pending.tabId) : undefined))
      .catch(() => undefined);
  }, 1200);
}
