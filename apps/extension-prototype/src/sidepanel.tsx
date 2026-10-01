import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { FieldReview, JobView, MappingChatMessage } from '@smartmapper/contracts';
import { ExtensionExecutor, type QuoteChoice } from './controller.js';
import { connectionDetails, jobSession } from './session.js';
import { config } from './config.js';
import './sidepanel.css';

const reviewMessages: Record<FieldReview['reason'], string> = {
  missing_source: 'A matching saved answer is missing or unavailable in M.I.A.',
  missing_question_context: 'I could not confidently identify what this field asks.',
  ambiguous_match: 'I am not confident which answer belongs here. Please review.',
  human_only: 'This control needs you to handle it.',
  validation_error: 'The page reported a validation error. Please check this entry.',
  unsupported_control: 'I could not safely perform the proposed action on this control.',
  source_mismatch: 'The proposed entry could not be verified against the saved M.I.A. answer.',
  retry_limit: 'I reached the retry limit for this field. Please review it.',
  page_changed: 'The page changed. Please review it, then Resume mapping.',
};

function App() {
  const extensionVersion = chrome.runtime.getManifest().version;
  const [connected, setConnected] = useState(false);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [conversation, setConversation] = useState<MappingChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [chatting, setChatting] = useState(false);
  const [query, setQuery] = useState('');
  const [quotes, setQuotes] = useState<QuoteChoice[]>([]);
  const [selected, setSelected] = useState('');
  const [job, setJob] = useState<JobView | null>(null);
  const [message, setMessage] = useState(
    'Connect to M.I.A., select a quote, and open the page you want to fill.',
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<ExtensionExecutor | null>(null);

  useEffect(() => {
    const executor = new ExtensionExecutor((next, status) => {
      setJob(next);
      setMessage(status);
    });
    controller.current = executor;
    const refresh = (): void => {
      void connectionDetails().then((details) => {
        setConnected(details.connected);
        setPrincipal(details.principal);
      });
      void jobSession().then((session) => setConversation(session?.conversation ?? []));
    };
    refresh();
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

  async function perform(operation: () => Promise<void>, blocks = true): Promise<void> {
    setError('');
    if (blocks) setWorking(true);
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Mapping paused. Please try again.');
    } finally {
      if (blocks) setWorking(false);
    }
  }

  return (
    <main>
      <header>
        <div className="eyebrow">M.I.A. • PROOF OF CONCEPT</div>
        <h1>SmartMapper</h1>
        <p>Version {extensionVersion}</p>
        <p>Your answers. One page at a time.</p>
      </header>
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
                setMessage('Connection details copied. You can paste them into our chat.');
              }, false)
            }
          >
            Copy connection details
          </button>
        </details>
      </section>
      <section>
        <label htmlFor="quote-search">Find a quote</label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              const results = (await controller.current?.search(query)) ?? [];
              setQuotes(results);
              setSelected(results[0]?.id ?? '');
              if (!results.length) setMessage('No quotes found. Try another name or quote number.');
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
      </section>
      <section aria-live="polite" className="status">
        <h2>{job ? job.status.replaceAll('_', ' ') : 'Ready when you are'}</h2>
        <p>{message}</p>
        {job && (
          <p className="counts">
            {job.verified} entries verified · {job.failed} attempts need attention
          </p>
        )}
      </section>
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
                await controller.current?.start(selected);
              })
            }
          >
            Start mapping
          </button>
        )}
        {job && (
          <>
            <button
              disabled={working || chatting}
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
          <h2>Needs your review</h2>
          <p>
            Ask for a suggested match, or enter the answer on the carrier page and skip that field.
            Skipping leaves its value alone and continues mapping.
          </p>
          <ul>
            {job.reviews.map((review, index) => (
              <li key={index}>
                {review.entity ? review.entity + ': ' : ''}
                {review.question} — {reviewMessages[review.reason]}
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={working || chatting}
                    onClick={() => {
                      setChatting(true);
                      void perform(async () => {
                        try {
                          await controller.current?.sendChat(
                            'Suggest the best supported match for ' +
                              review.question +
                              ' (' +
                              review.entity +
                              ', field ' +
                              (review.elementId ?? 'page') +
                              '). Explain the PDF question and answer it comes from. If the quote sheet does not support an answer, say so. Do not invent facts or fill anything yet.',
                          );
                        } finally {
                          setChatting(false);
                        }
                      }, false);
                    }}
                  >
                    Suggest a match
                  </button>
                  {review.elementId &&
                    !['human_only', 'validation_error', 'page_changed'].includes(review.reason) && (
                      <button
                        className="secondary"
                        disabled={working || chatting}
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
      {job && (
        <section className="mapping-chat" aria-label="Mapping chat">
          <h2>Talk to SmartMapper</h2>
          <p>
            Explain what went wrong or ask about this page. Sending pauses mapping; you choose when
            to Resume.
          </p>
          <div
            role="log"
            aria-label="Mapping conversation"
            aria-live="polite"
            className="chat-messages"
          >
            {conversation.length === 0 && (
              <p className="chat-hint">
                Try: “That field is for the second driver. Explain which answer you used.”
              </p>
            )}
            {conversation.map((item, index) => (
              <div className={'chat-message ' + item.role} key={index}>
                <strong>{item.role === 'user' ? 'You' : 'SmartMapper'}</strong>
                <p>{item.text}</p>
              </div>
            ))}
            {chatting && <p role="status">Reading your message and the current page…</p>}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim() || chatting) return;
              setChatting(true);
              void perform(async () => {
                try {
                  await controller.current?.sendChat(draft);
                  setDraft('');
                } finally {
                  setChatting(false);
                }
              }, false);
            }}
          >
            <label htmlFor="mapping-message">Your message</label>
            <textarea
              id="mapping-message"
              value={draft}
              maxLength={4000}
              rows={4}
              disabled={chatting}
              placeholder="Tell SmartMapper what to look at or do differently…"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button disabled={!draft.trim() || chatting}>
              {chatting ? 'Sending…' : 'Send message'}
            </button>
          </form>
          <p className="chat-hint">
            The latest 10 exchanges guide this job. Chat stays in this browser session and ends with
            the job; it does not permanently train the model.
          </p>
          {!!conversation.length && (
            <button
              className="secondary"
              disabled={working || chatting}
              onClick={() =>
                void perform(async () => {
                  await controller.current?.clearChat();
                })
              }
            >
              Clear chat guidance
            </button>
          )}
        </section>
      )}
      <footer>
        Ordinary Next/Continue can run after a clean page review. Binding, issuing, selling, consent
        and signatures stay with you.
      </footer>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
