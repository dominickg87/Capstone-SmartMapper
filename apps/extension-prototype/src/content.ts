import { BrowserPageSession } from '@smartmapper/automation-core/browser-page';
import { ActionBatchSchema } from '@smartmapper/contracts';
import { z } from 'zod';

declare global {
  interface Window {
    smartMapperContentV2?: boolean;
  }
}
if (!window.smartMapperContentV2) {
  window.smartMapperContentV2 = true;
  const session = new BrowserPageSession();
  const messageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('observe'), tabId: z.number().int().nonnegative() }).strict(),
    z.object({ type: z.literal('execute'), batch: ActionBatchSchema }).strict(),
    z.object({ type: z.literal('clear-markers') }).strict(),
  ]);
  // Report fields the human changes by hand (trusted events outside SmartMapper's own actions).
  // The side panel uses this to keep corrected fields out of mapping memory.
  const reported = new Map<string, number>();
  const onHumanEdit = (event: Event): void => {
    if (!event.isTrusted || session.acting) return;
    void session
      .signatureOf(event.target)
      .then(async (signature) => {
        const now = Date.now();
        if (!signature || now - (reported.get(signature) ?? 0) < 1000) return;
        reported.set(signature, now);
        await chrome.runtime.sendMessage({ type: 'human-edit', signature });
      })
      .catch(() => undefined);
  };
  document.addEventListener('input', onHumanEdit, true);
  document.addEventListener('change', onHumanEdit, true);
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL('')) ||
      sender.tab
    )
      return false;
    const parsed = messageSchema.safeParse(message);
    if (!parsed.success) return false;
    const command = parsed.data;
    if (command.type === 'clear-markers') {
      session.clearMarkers();
      respond({ ok: true });
      return false;
    }
    const operation =
      command.type === 'observe'
        ? session.observe(command.tabId, true)
        : session.execute(command.batch);
    void operation.then(respond).catch(() => respond({ error: 'page_operation_failed' }));
    return true;
  });
}
