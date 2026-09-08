(() => {
  const CONNECTION_PAYLOAD_ID = 'mia-extension-connection';

  function parseConnectionPayload() {
    const payloadElement = document.getElementById(CONNECTION_PAYLOAD_ID);
    const rawPayload = payloadElement?.textContent?.trim();

    if (!rawPayload) {
      return null;
    }

    try {
      return JSON.parse(rawPayload);
    } catch (error) {
      console.error('MIA extension: unable to parse connection payload', error);
      return null;
    }
  }

  function renderConnectionStatus(message, isError = false) {
    const main = document.querySelector('main');
    if (!main) {
      return;
    }

    let status = document.getElementById('mia-extension-connection-status');
    if (!status) {
      status = document.createElement('p');
      status.id = 'mia-extension-connection-status';
      status.style.marginTop = '12px';
      status.style.fontWeight = '700';
      main.appendChild(status);
    }

    status.textContent = message;
    status.style.color = isError ? '#b42318' : '#00026a';
  }

  function closeConnectionTabSoon() {
    window.setTimeout(() => {
      chrome.runtime
        .sendMessage({
          type: 'MIA_SMART_MAP_CLOSE_AUTH_TAB',
        })
        .catch((error) => {
          console.warn('MIA extension: unable to close connection tab', error);
        });
    }, 3000);
  }

  async function sendConnectionPayload(payload) {
    const response = await chrome.runtime.sendMessage({
      type: 'MIA_SMART_MAP_AUTH_TOKEN',
      payload: {
        ...payload,
        baseUrl: window.location.origin,
      },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'The extension could not save the MIA connection.');
    }
  }

  const payload = parseConnectionPayload();
  if (!payload?.access_token) {
    return;
  }

  sendConnectionPayload(payload)
    .then(() => {
      renderConnectionStatus('Connection saved. This tab will close in 3 seconds.');
      closeConnectionTabSoon();
    })
    .catch((error) => {
      console.error('MIA extension: connection handoff failed', error);
      renderConnectionStatus(error instanceof Error ? error.message : String(error), true);
    });
})();
