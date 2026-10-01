import { BrowserPageSession } from '@smartmapper/automation-core/browser-page';
import { ActionBatchSchema } from '@smartmapper/contracts';
import { z } from 'zod';

declare global {
  interface Window {
    smartMapperContentV2?: string;
  }
}
const contentVersion = chrome.runtime.getManifest().version;
if (window.smartMapperContentV2 !== contentVersion) {
  window.smartMapperContentV2 = contentVersion;
  const session = new BrowserPageSession();
  const messageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('observe'), tabId: z.number().int().nonnegative() }).strict(),
    z.object({ type: z.literal('execute'), batch: ActionBatchSchema }).strict(),
    z.object({ type: z.literal('clear-markers') }).strict(),
    z.object({ type: z.literal('prepare-survey'), tabId: z.number().int().nonnegative() }).strict(),
    z
      .object({
        type: z.literal('survey-position'),
        tabId: z.number().int().nonnegative(),
        x: z.number().nonnegative(),
        y: z.number().nonnegative(),
      })
      .strict(),
    z
      .object({
        type: z.literal('finish-survey'),
        tabId: z.number().int().nonnegative(),
        complete: z.boolean(),
        targeted: z.boolean().optional(),
      })
      .strict(),
  ]);
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      window.smartMapperContentV2 !== contentVersion ||
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
      command.type === 'prepare-survey'
        ? session.prepareSurvey(command.tabId)
        : command.type === 'survey-position'
          ? session.surveyPosition(command.tabId, command.x, command.y)
          : command.type === 'finish-survey'
            ? session.finishSurvey(command.tabId, command.complete, command.targeted)
            : command.type === 'observe'
              ? session.observe(command.tabId, true)
              : session.execute(command.batch);
    void operation.then(respond).catch(() => respond({ error: 'page_operation_failed' }));
    return true;
  });
}
