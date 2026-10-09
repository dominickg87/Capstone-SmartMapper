import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TrainingPanel } from './training-panel.js';
import { TrainingController } from './training-controller.js';
import { connectionDetails } from './session.js';
import './sidepanel.css';
import './reference.css';

function Reference() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void connectionDetails().then((details) => setConnected(details.connected));
  }, []);
  return (
    <main className="reference-app">
      <header className="reference-header">
        <div>
          <div className="eyebrow">M.I.A. SMARTMAPPER / FIELD REFERENCE</div>
          <h1>Know the page. Map it once.</h1>
          <p>Review captured questions, choose their M.I.A. source, and test on the carrier.</p>
        </div>
        <div>
          <span className="reference-version">Version {chrome.runtime.getManifest().version}</span>
          <button
            className="secondary"
            onClick={() =>
              void new TrainingController()
                .returnToCarrier()
                .catch((failure: unknown) =>
                  setError(
                    failure instanceof Error ? failure.message : 'Could not open the carrier tab.',
                  ),
                )
            }
          >
            Return to carrier
          </button>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!connected && (
        <p className="error">
          Connect to M.I.A. from the carrier side panel to edit this reference.
        </p>
      )}
      <TrainingPanel
        studio
        connected={connected}
        onTrainingResolved={() => undefined}
        onTestMapping={(mapping) => {
          void new TrainingController()
            .returnToCarrier()
            .then(() =>
              chrome.runtime.sendMessage({
                type: 'smartmapper-reference-test-ready',
                preview: mapping.preview === true,
              }),
            )
            .catch((failure: unknown) =>
              setError(
                failure instanceof Error ? failure.message : 'Could not open the carrier test.',
              ),
            );
        }}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Reference />);
