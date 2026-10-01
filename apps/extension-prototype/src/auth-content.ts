if (
  window.top === window &&
  location.pathname === '/extension/connect' &&
  new URL(location.href).searchParams.has('extension_state')
) {
  const content = document.getElementById('mia-extension-connection')?.textContent;
  if (content) {
    try {
      const payload: unknown = JSON.parse(content);
      void chrome.runtime
        .sendMessage({ type: 'connection-result', payload })
        .then((result: unknown) => {
          const message = document.createElement('p');
          message.textContent =
            result && typeof result === 'object' && 'ok' in result && result.ok === true
              ? 'SmartMapper connected. Return to your quote tab and open the SmartMapper panel.'
              : 'Connection failed. Start sign-in from the SmartMapper panel again.';
          document.querySelector('main')?.append(message);
        })
        .catch(() => undefined);
    } catch {
      /* The trusted background validates the connection before saving anything. */
    }
  }
}
