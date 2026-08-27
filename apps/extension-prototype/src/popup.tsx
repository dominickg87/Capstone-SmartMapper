import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  initialRunState,
  parseExtensionResponse,
  type ExtensionMessage,
  type ExtensionResponse,
  type PageDetection,
  type PersistedRunState,
} from './messages.js';
import './popup.css';

async function send(message: ExtensionMessage): Promise<ExtensionResponse> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  return parseExtensionResponse(response);
}

function App() {
  const [state, setState] = useState<PersistedRunState>(initialRunState);
  const [detection, setDetection] = useState<PageDetection>();
  const [quoteReference, setQuoteReference] = useState('quote-synthetic-complete');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [stateResponse, detectionResponse] = await Promise.all([
      send({ type: 'get-state' }),
      send({ type: 'detect-page' }),
    ]);
    if (stateResponse.state) {
      setState(stateResponse.state);
    }
    setDetection(detectionResponse.detection);
    setError(detectionResponse.error ?? '');
  }, []);

  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(refreshTimer);
  }, [refresh]);

  async function perform(message: ExtensionMessage): Promise<void> {
    const response = await send(message);
    if (response.state) {
      setState(response.state);
    }
    if (response.detection) {
      setDetection(response.detection);
    }
    setError(response.error ?? '');
  }

  return (
    <main className="panel">
      <h1>SmartMapper</h1>
      <p className="warning">Synthetic localhost prototype. Human review is always required.</p>

      <section className="status">
        <strong>Page detection</strong>
        <p>{detection?.supported ? detection.adapterId : (detection?.reason ?? 'Checking…')}</p>
      </section>

      <label>
        Synthetic quote
        <select value={quoteReference} onChange={(event) => setQuoteReference(event.target.value)}>
          <option value="quote-synthetic-complete">Complete fixture</option>
          <option value="quote-synthetic-missing-phone">Missing phone fixture</option>
        </select>
      </label>

      <div className="actions">
        <button type="button" onClick={() => void perform({ type: 'start-run', quoteReference })}>
          Start
        </button>
        <button type="button" onClick={() => void perform({ type: 'pause-run' })}>
          Pause
        </button>
        <button type="button" onClick={() => void perform({ type: 'resume-run' })}>
          Resume
        </button>
        <button type="button" onClick={() => void perform({ type: 'cancel-run' })}>
          Cancel
        </button>
      </div>

      <section>
        <strong>Status: {state.status}</strong>
        <ol>
          {state.progress.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      </section>

      <section className="review">
        <strong>Unresolved review items</strong>
        {state.reviewItems.length === 0 ? (
          <p>None recorded.</p>
        ) : (
          <ul>
            {state.reviewItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

const root = document.querySelector('#root');
if (!root) {
  throw new Error('Extension popup root is missing.');
}
createRoot(root).render(<App />);
