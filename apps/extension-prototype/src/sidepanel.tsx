import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { diagnosticCode, type FieldReview, type JobView } from '@smartmapper/contracts';
import { ExtensionExecutor, type QuoteChoice, type TestableMapping } from './controller.js';
import { connectionDetails, jobSession } from './session.js';
import { config } from './config.js';
import { MappingStatus } from './mapping-status.js';
import { emptyProgress, type MappingProgress } from './progress.js';
import { TrainingPanel } from './training-panel.js';
import { TrainingController, trainingSession } from './training-controller.js';
import './sidepanel.css';

const reviewMessages: Record<FieldReview['reason'], string> = {
  missing_source: 'The trained M.I.A. field has no answer for this quote.',
  missing_mapping: 'This carrier field has no mapping in the active trained workflow.',
  missing_question_context: 'This field was not recognized in the trained workflow.',
  ambiguous_match: 'More than one trained field could match this carrier control.',
  human_only: 'This control must remain with you.',
  human_required: 'The trainer marked this field for human entry.',
  validation_error: 'The carrier page rejected this entry. Please review it.',
  read_back_mismatch: 'The carrier page did not retain the trained value.',
  unsupported_control:
    'This carrier control needs a separately reviewed deterministic interaction.',
  changed_target: 'The carrier field changed after this workflow was trained.',
  changed_options: 'The carrier choices changed after this workflow was trained.',
  source_mismatch: 'The proposed entry did not match its saved M.I.A. answer.',
  retry_limit: 'This field reached its retry limit. Other independent fields can continue.',
  page_changed: 'The page changed while SmartMapper was working.',
};

type PanelMode = 'map' | 'train';

function App() {
  const extensionVersion = chrome.runtime.getManifest().version;
  const [mode, setMode] = useState<PanelMode>('map');
  const [connected, setConnected] = useState(false);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [quotes, setQuotes] = useState<QuoteChoice[]>([]);
  const [selected, setSelected] = useState('');
  const [job, setJob] = useState<JobView | null>(null);
  const [testableMapping, setTestableMapping] = useState<TestableMapping | null>(null);
  const [verifiedTestMapping, setVerifiedTestMapping] = useState(false);
  const lastVerificationRevision = useRef<string | null>(null);
  const [message, setMessage] = useState(
    'Connect to M.I.A., select a quote, and open the trained carrier page you want to fill.',
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<MappingProgress>(emptyProgress);
  const [diagnostics, setDiagnostics] = useState('');
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const controller = useRef<ExtensionExecutor | null>(null);

  useEffect(() => {
    const executor = new ExtensionExecutor((next, status) => {
      setJob(next);
      setMessage(status);
    }, setProgress);
    controller.current = executor;
    const refresh = (): void => {
      void connectionDetails().then((details) => {
        setConnected(details.connected);
        setPrincipal(details.principal);
      });
    };
    refresh();
    void jobSession().then((saved) => {
      const mappingSelection = saved?.mappingSelection;
      if (!mappingSelection) return;
      setTestableMapping({
        mappingId: mappingSelection.mappingId,
        mappingVersion: mappingSelection.mappingVersion,
      });
      void trainingSession().then((training) => {
        const publishedMapping = training?.publishedMapping;
        if (
          publishedMapping?.mappingId === mappingSelection.mappingId &&
          publishedMapping.mappingVersion === mappingSelection.mappingVersion &&
          ['verified', 'active'].includes(publishedMapping.status)
        )
          setVerifiedTestMapping(true);
      });
    });
    void executor
      .restore()
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : 'Could not restore this job.'),
      );
    chrome.storage.onChanged.addListener(refresh);
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') {
        executor.halt();
        void executor.pause().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      executor.halt();
      chrome.storage.onChanged.removeListener(refresh);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  useEffect(() => {
    if (
      !testableMapping ||
      verifiedTestMapping ||
      job?.status !== 'page_complete' ||
      job.failed > 0 ||
      job.reviews.length > 0 ||
      lastVerificationRevision.current === `${job.jobId}:${job.revision}`
    )
      return;
    lastVerificationRevision.current = `${job.jobId}:${job.revision}`;
    void (async () => {
      const evidence = await jobSession();
      if (!evidence || evidence.job.jobId !== job.jobId) return;
      try {
        const verified = await new TrainingController().verify(evidence.job.jobId, evidence.token);
        if (
          verified.publishedMapping &&
          ['verified', 'active'].includes(verified.publishedMapping.status)
        ) {
          setVerifiedTestMapping(true);
          setMessage(
            'The trained workflow passed a clean coverage and read-back test. Cancel this completed job, open Train, then activate it.',
          );
        } else {
          setMessage(
            'This trained scenario passed and its coverage was saved. Cancel this completed job, open another trained scenario, and start the next test.',
          );
        }
      } catch (failure) {
        setMessage(
          failure instanceof Error
            ? failure.message
            : 'Continue through the remaining trained pages, then Resume mapping.',
        );
      }
    })();
  }, [job, testableMapping, verifiedTestMapping]);

  async function perform(operation: () => Promise<void>, blocks = true): Promise<void> {
    setError('');
    if (blocks) setWorking(true);
    try {
      await operation();
    } catch (failure) {
      controller.current?.reportFailure(failure);
      setError(
        diagnosticCode(failure) === 'timeout'
          ? 'This step timed out. Copy diagnostics, then review the page before resuming.'
          : failure instanceof Error
            ? failure.message
            : 'Mapping paused. Please try again.',
      );
    } finally {
      if (blocks) setWorking(false);
    }
  }

  return (
    <main>
      <header>
        <div className="eyebrow">M.I.A. · PROOF OF CONCEPT</div>
        <h1>SmartMapper</h1>
        <p>Version {extensionVersion}</p>
        <p>Train once. Map quickly. Review every exception.</p>
      </header>

      <nav className="mode-tabs" aria-label="SmartMapper mode">
        <button
          type="button"
          className={mode === 'map' ? 'active' : ''}
          aria-current={mode === 'map' ? 'page' : undefined}
          onClick={() => setMode('map')}
        >
          Map
        </button>
        <button
          type="button"
          className={mode === 'train' ? 'active' : ''}
          aria-current={mode === 'train' ? 'page' : undefined}
          disabled={!!job}
          onClick={() => setMode('train')}
        >
          Train
        </button>
      </nav>

      <section>
        <div className="connection">
          <span className={connected ? 'dot connected' : 'dot'} />
          {connected ? 'Connected to M.I.A.' : 'M.I.A. connection needed'}
        </div>
        <button
          className="secondary"
          disabled={working || !!job}
          onClick={() =>
            void perform(async () => {
              const result: unknown = await chrome.runtime.sendMessage({ type: 'connect' });
              if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true)
                throw new Error('Could not start sign-in.');
            })
          }
        >
          {connected ? 'Reconnect to M.I.A.' : 'Connect to M.I.A.'}
        </button>
        <details className="connection-details">
          <summary>Connection details</summary>
          <label htmlFor="extension-id">Extension ID</label>
          <input id="extension-id" readOnly value={chrome.runtime.id} />
          <label htmlFor="mia-account">M.I.A. tenant/user ID</label>
          <input
            id="mia-account"
            readOnly
            value={principal ?? 'Connect to M.I.A. to show this ID'}
          />
          <p>{config.miaOrigin}</p>
          <button
            className="secondary"
            onClick={() =>
              void perform(async () => {
                await navigator.clipboard.writeText(
                  'Extension version: ' +
                    extensionVersion +
                    '\nExtension ID: ' +
                    chrome.runtime.id +
                    '\nM.I.A. tenant/user ID: ' +
                    (principal ?? 'Not connected') +
                    '\nM.I.A. URL: ' +
                    config.miaOrigin,
                );
                setMessage('Connection details copied.');
              }, false)
            }
          >
            Copy connection details
          </button>
        </details>
      </section>

      {mode === 'train' ? (
        <TrainingPanel
          connected={connected}
          onTrainingResolved={() => {
            setTestableMapping(null);
            setVerifiedTestMapping(false);
            lastVerificationRevision.current = null;
          }}
          onTestMapping={(mapping) => {
            setTestableMapping(mapping);
            setVerifiedTestMapping(false);
            lastVerificationRevision.current = null;
            setMode('map');
            setMessage(
              `Testing trained mapping version ${mapping.mappingVersion}. Select a representative demo quote.`,
            );
          }}
        />
      ) : (
        <>
          <section>
            <label htmlFor="quote-search">Find a quote</label>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void perform(async () => {
                  const results = ((await controller.current?.search(query)) ?? []).filter(
                    (quote) => ['home', 'auto'].includes(quote.form_type.trim().toLowerCase()),
                  );
                  setQuotes(results);
                  setSelected(results[0]?.id ?? '');
                  if (!results.length)
                    setMessage(
                      'No supported Home or Auto quotes found. Try another name or quote number.',
                    );
                });
              }}
            >
              <input
                id="quote-search"
                placeholder="Client name or quote number"
                value={query}
                disabled={working || !!job}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button disabled={!connected || working || !!job}>Search</button>
            </form>
            {quotes.length > 0 && (
              <>
                <label htmlFor="quote">Selected quote</label>
                <select
                  id="quote"
                  value={selected}
                  disabled={working || !!job}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {quotes.map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.client_name} · {quote.quote_number} · {quote.form_type}
                    </option>
                  ))}
                </select>
              </>
            )}
            {testableMapping && !job && (
              <div className="testable-notice" role="status">
                <strong>Test mode: mapping version {testableMapping.mappingVersion}</strong>
                <p>
                  This run uses the unpublished testable version. It does not replace the active
                  mapping.
                </p>
                <button className="link-button" onClick={() => setTestableMapping(null)}>
                  Use active mapping instead
                </button>
              </div>
            )}
            {verifiedTestMapping && (
              <div className="verified-notice" role="status">
                This version passed its clean deterministic mapping test. Return to Train to
                activate it after closing this job.
              </div>
            )}
          </section>

          <MappingStatus progress={progress} job={job} message={message} />
          {(!!job || !!progress.events.length) && (
            <details className="diagnostics">
              <summary>Diagnostics</summary>
              <p>Step timings and error codes. Quote answers and sign-in tokens are excluded.</p>
              <button
                className="secondary"
                disabled={copying}
                onClick={() => {
                  setCopying(true);
                  setCopied(false);
                  void (async () => {
                    try {
                      const report = (await controller.current?.diagnosticReport()) ?? '';
                      setDiagnostics(report);
                      try {
                        await navigator.clipboard.writeText(report);
                        setCopied(true);
                      } catch {
                        /* The report below supports manual copying. */
                      }
                    } finally {
                      setCopying(false);
                    }
                  })();
                }}
              >
                {copying ? 'Preparing diagnostics…' : 'Copy diagnostics'}
              </button>
              {copied && <p role="status">Diagnostics copied.</p>}
              {!!diagnostics && (
                <textarea
                  aria-label="Diagnostic report"
                  readOnly
                  rows={6}
                  value={diagnostics}
                  onFocus={(event) => event.currentTarget.select()}
                />
              )}
            </details>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            {!job && (
              <button
                disabled={!selected || !connected || working}
                onClick={() =>
                  void perform(async () => {
                    await controller.current?.start(selected, testableMapping ?? undefined);
                  })
                }
              >
                {testableMapping ? 'Start test mapping' : 'Start mapping'}
              </button>
            )}
            {job && (
              <>
                <button
                  disabled={working}
                  onClick={() =>
                    void perform(async () => {
                      await controller.current?.run(true);
                    })
                  }
                >
                  Resume mapping
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void perform(async () => {
                      await controller.current?.pause();
                    }, false)
                  }
                >
                  Pause
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void perform(async () => {
                      await controller.current?.cancel();
                    }, false)
                  }
                >
                  Cancel job
                </button>
              </>
            )}
          </div>
          {!!job?.reviews.length && (
            <section>
              <h2>Missing fields and exceptions</h2>
              <p>SmartMapper preserved successful fields and continued other independent work.</p>
              <ul className="review-list">
                {job.reviews.map((review, index) => (
                  <li key={`${review.elementId ?? 'page'}-${index}`}>
                    <strong>
                      {review.entity ? `${review.entity}: ` : ''}
                      {review.question}
                    </strong>
                    <p>{reviewMessages[review.reason]}</p>
                    <div className="actions">
                      {review.elementId && (
                        <button
                          className="secondary compact"
                          onClick={() => void controller.current?.focusReview(review.elementId!)}
                        >
                          Show on carrier page
                        </button>
                      )}
                      {review.elementId &&
                        ![
                          'human_only',
                          'human_required',
                          'validation_error',
                          'page_changed',
                        ].includes(review.reason) && (
                          <button
                            className="secondary compact"
                            disabled={working}
                            onClick={() =>
                              void perform(async () => {
                                await controller.current?.run(true, review.elementId!);
                              })
                            }
                          >
                            Skip this field
                          </button>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <footer>
        SmartMapper fills only trained, supported fields and verifies browser read-back. Binding,
        issuing, selling, payment, consent, attestation and signatures stay with you.
      </footer>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
