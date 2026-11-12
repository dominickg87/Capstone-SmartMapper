import type { CDPSession, Page } from '@playwright/test';

export async function activateToolbar(client: CDPSession, extensionId: string, carrier: Page) {
  await carrier.bringToFront();
  const { targetInfos } = await client.send('Target.getTargets', {
    filter: [{ type: 'tab', exclude: false }],
  });
  const target = targetInfos.find((candidate) => candidate.url === carrier.url());
  if (!target) throw new Error('synthetic_carrier_tab_target_missing');
  await client.send('Extensions.triggerAction', { id: extensionId, targetId: target.targetId });
}

export async function panelText(
  client: CDPSession,
  documentUrl: string,
  expression = 'document.body.innerText',
): Promise<string> {
  const { targetInfos } = await client.send('Target.getTargets', { filter: [{}] });
  const target = targetInfos.find(
    (candidate) => candidate.type === 'page' && candidate.url === documentUrl,
  );
  if (!target) return '';
  const { sessionId } = await client.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: false,
  });
  try {
    return await new Promise<string>((resolveText, reject) => {
      const receive = (event: { sessionId: string; message: string }) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message) as {
          id?: number;
          result?: { result?: { value?: string } };
        };
        if (message.id !== 1) return;
        clearTimeout(timeout);
        client.off('Target.receivedMessageFromTarget', receive);
        resolveText(message.result?.result?.value ?? '');
      };
      const timeout = setTimeout(() => {
        client.off('Target.receivedMessageFromTarget', receive);
        reject(new Error('synthetic_panel_read_timeout'));
      }, 3000);
      client.on('Target.receivedMessageFromTarget', receive);
      void client
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({
            id: 1,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true },
          }),
        })
        .catch((error: unknown) => {
          clearTimeout(timeout);
          client.off('Target.receivedMessageFromTarget', receive);
          reject(error instanceof Error ? error : new Error('synthetic_panel_read_failed'));
        });
    });
  } finally {
    await client.send('Target.detachFromTarget', { sessionId });
  }
}

export function clickPanelButton(client: CDPSession, documentUrl: string, label: string) {
  return panelText(
    client,
    documentUrl,
    `(() => {
    const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.trim() === ${JSON.stringify(label)});
    if (!button || button.disabled) return 'unavailable'; button.click(); return 'clicked';
  })()`,
  );
}
