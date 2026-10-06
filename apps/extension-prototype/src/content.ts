import { BrowserPageSession } from '@smartmapper/automation-core/browser-page';
import {
  ActionBatchSchema,
  MAX_PAGE_ACTIONS,
  type ActionBatch,
  type ActionReceipt,
} from '@smartmapper/contracts';
import { z } from 'zod';
import { receiptStopReason } from './batch-continuation.js';
import { TrainingMarkerSchema, TrainingOverlay } from './training-overlay.js';

declare global {
  interface Window {
    smartMapperContentV2?: string;
  }
}
const contentVersion = chrome.runtime.getManifest().version;
if (window.smartMapperContentV2 !== contentVersion) {
  window.smartMapperContentV2 = contentVersion;
  const session = new BrowserPageSession();
  const trainingOverlay = new TrainingOverlay();
  const cancelledExecutions = new Set<string>();
  const executionPorts = new Map<string, chrome.runtime.Port>();
  let activeExecutionId: string | undefined;
  const executionPortName = /^smartmapper-execution:([0-9a-f-]{36})$/;
  const progressReplySchema = z
    .object({
      type: z.literal('smartmapper-execution-ack'),
      executionId: z.string().uuid(),
      index: z.number().int().min(1).max(MAX_PAGE_ACTIONS),
      actionId: z.string().min(1).max(160),
      continue: z.boolean(),
    })
    .strict();
  const messageSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('observe'), tabId: z.number().int().nonnegative() }).strict(),
    z
      .object({ type: z.literal('training-observe'), tabId: z.number().int().nonnegative() })
      .strict(),
    z.object({ type: z.literal('execute'), batch: ActionBatchSchema }).strict(),
    z
      .object({
        type: z.literal('execute-batch'),
        executionId: z.string().uuid(),
        batches: ActionBatchSchema.array()
          .min(1)
          .max(MAX_PAGE_ACTIONS)
          .refine(
            (batches) => batches.every((batch) => batch.action.type !== 'next_page'),
            'Navigation must execute separately',
          ),
      })
      .strict(),
    z.object({ type: z.literal('cancel-execution'), executionId: z.string().uuid() }).strict(),
    z.object({ type: z.literal('clear-markers') }).strict(),
    z
      .object({
        type: z.literal('show-training-overlay'),
        markers: z.array(TrainingMarkerSchema).max(400),
      })
      .strict(),
    z
      .object({ type: z.literal('focus-training-field'), fieldId: z.string().min(1).max(240) })
      .strict(),
    z.object({ type: z.literal('clear-training-overlay') }).strict(),
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

  const reportExecutionProgress = async (
    port: chrome.runtime.Port,
    executionId: string,
    index: number,
    total: number,
    phase: 'begin' | 'end' | 'error',
    actionId: string,
    receipt?: ActionReceipt,
  ): Promise<boolean> => {
    return await new Promise<boolean>((resolve) => {
      const onMessage = (input: unknown): void => {
        const parsed = progressReplySchema.safeParse(input);
        if (
          !parsed.success ||
          parsed.data.executionId !== executionId ||
          parsed.data.index !== index ||
          parsed.data.actionId !== actionId
        )
          return;
        port.onMessage.removeListener(onMessage);
        port.onDisconnect.removeListener(onDisconnect);
        resolve(parsed.data.continue);
      };
      const onDisconnect = (): void => {
        port.onMessage.removeListener(onMessage);
        resolve(false);
      };
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
      try {
        port.postMessage({
          type: 'smartmapper-execution-progress',
          contentVersion,
          executionId,
          index,
          total,
          phase,
          actionId,
          ...(receipt ? { receipt } : {}),
        });
      } catch {
        port.onMessage.removeListener(onMessage);
        port.onDisconnect.removeListener(onDisconnect);
        resolve(false);
      }
    });
  };

  const executeBatches = async (
    executionId: string,
    batches: ActionBatch[],
  ): Promise<{
    receipts: ActionReceipt[];
    stopReason: 'complete' | 'cancelled' | 'blocked' | 'page_operation_failed';
  }> => {
    if (activeExecutionId) return { receipts: [], stopReason: 'page_operation_failed' };
    const port = executionPorts.get(executionId);
    if (!port) return { receipts: [], stopReason: 'page_operation_failed' };
    activeExecutionId = executionId;
    const receipts: ActionReceipt[] = [];
    try {
      for (const [offset, batch] of batches.entries()) {
        if (cancelledExecutions.has(executionId)) return { receipts, stopReason: 'cancelled' };
        const index = offset + 1;
        const ready = await reportExecutionProgress(
          port,
          executionId,
          index,
          batches.length,
          'begin',
          batch.action.actionId,
        );
        if (!ready || cancelledExecutions.has(executionId))
          return { receipts, stopReason: 'cancelled' };
        let receipt: ActionReceipt;
        try {
          receipt = await session.execute(batch);
        } catch {
          await reportExecutionProgress(
            port,
            executionId,
            index,
            batches.length,
            'error',
            batch.action.actionId,
          );
          return { receipts, stopReason: 'page_operation_failed' };
        }
        receipts.push(receipt);
        const shouldContinue = await reportExecutionProgress(
          port,
          executionId,
          index,
          batches.length,
          'end',
          batch.action.actionId,
          receipt,
        );
        const stopReason = receiptStopReason(
          receipt,
          shouldContinue && !cancelledExecutions.has(executionId),
        );
        if (stopReason) return { receipts, stopReason };
      }
      return {
        receipts,
        stopReason: cancelledExecutions.has(executionId) ? 'cancelled' : 'complete',
      };
    } finally {
      cancelledExecutions.delete(executionId);
      if (activeExecutionId === executionId) activeExecutionId = undefined;
    }
  };

  chrome.runtime.onConnect.addListener((port) => {
    const match = executionPortName.exec(port.name);
    const sender = port.sender;
    if (
      !match ||
      sender?.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL('')) ||
      sender.tab
    ) {
      port.disconnect();
      return;
    }
    const executionId = match[1]!;
    executionPorts.set(executionId, port);
    port.onDisconnect.addListener(() => {
      if (executionPorts.get(executionId) === port) executionPorts.delete(executionId);
      cancelledExecutions.add(executionId);
    });
    port.postMessage({
      type: 'smartmapper-execution-ready',
      contentVersion,
      executionId,
    });
  });

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
    if (command.type === 'cancel-execution') {
      if (activeExecutionId === command.executionId) cancelledExecutions.add(command.executionId);
      respond({ ok: true });
      return false;
    }
    if (command.type === 'clear-markers') {
      session.clearMarkers();
      respond({ ok: true });
      return false;
    }
    if (command.type === 'show-training-overlay') {
      trainingOverlay.show(command.markers);
      respond({ ok: true });
      return false;
    }
    if (command.type === 'focus-training-field') {
      respond({ ok: trainingOverlay.focus(command.fieldId) });
      return false;
    }
    if (command.type === 'clear-training-overlay') {
      trainingOverlay.clear();
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
              : command.type === 'training-observe'
                ? session.observe(command.tabId, false)
                : command.type === 'execute-batch'
                  ? executeBatches(command.executionId, command.batches)
                  : session.execute(command.batch);
    void operation.then(respond).catch(() => respond({ error: 'page_operation_failed' }));
    return true;
  });
}
