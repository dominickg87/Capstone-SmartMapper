import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PageReader } from './reader-panel.js';
import { demoSession, type DemoSession } from './demo-auth.js';
import { loadDemoQuote, searchDemoQuotes, type DemoQuoteSummary } from './demo-api.js';
import { runHomeDemo, type DemoFieldResult, type DemoProgress } from './demo-runner.js';
import './demo-panel.css';

function SmartMapper() {
  const [view, setView] = useState<'map' | 'reference'>('map');
  const [connection, setConnection] = useState<DemoSession | null>(null);
  const [query, setQuery] = useState('');
  const [quotes, setQuotes] = useState<DemoQuoteSummary[]>([]);
  const [selected, setSelected] = useState<DemoQuoteSummary | null>(null);
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DemoProgress | null>(null);
  const [results, setResults] = useState<DemoFieldResult[] | null>(null);
  const active = useRef<AbortController | null>(null);
  const boundTabId = Number(new URLSearchParams(location.search).get('tabId') ?? '-1');
  useEffect(() => {
    const refresh = () => {
      void demoSession()
        .then((next) => {
          active.current?.abort();
          setConnection(next);
          setSelected(null);
          setQuotes([]);
          setResults(null);
        })
        .catch(() => setMessage('Could not read the connection. Reload the extension.'));
    };
    refresh();
    const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area === 'session' && changes.homeDemoConnection) refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      active.current?.abort();
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void searchDemoQuotes(query)
        .then((next) => {
          if (!cancelled) {
            setQuotes(next);
            setMessage('');
          }
        })
        .catch(() => {
          if (!cancelled)
            setMessage('Could not search M.I.A. Check your connection and try again.');
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection, query]);
  const authenticate = async (type: 'connect' | 'disconnect') => {
    setMessage('');
    try {
      const response: unknown = await chrome.runtime.sendMessage({ type });
      if (!response || typeof response !== 'object' || !('ok' in response) || response.ok !== true)
        throw new Error();
      if (type === 'connect') setMessage('Complete sign-in in the M.I.A. tab, then return here.');
    } catch {
      setMessage('Could not start the M.I.A. connection. Try again.');
    }
  };
  const map = async () => {
    if (!selected || busy) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage('Loading your Homeowners quote…');
    setResults(null);
    setProgress(null);
    try {
      const data = await loadDemoQuote(selected.id);
      setMessage('Mapping the quote…');
      const next = await runHomeDemo(boundTabId, data, controller.signal, setProgress);
      setResults(next);
      setMessage('Mapping finished. Review the page and the items below.');
    } catch (error) {
      setMessage(
        error instanceof Error && !error.message.startsWith('[')
          ? error.message
          : 'Mapping stopped. Check the page and try again.',
      );
    } finally {
      active.current = null;
      setBusy(false);
    }
  };
  const shown = results ?? progress?.results ?? [];
  return (
    <div className="demo">
      <header className="demo-header">
        <div className="demo-brand">M.I.A.</div>
        <div>
          <h1>SmartMapper</h1>
          <p>Homeowners demo · {chrome.runtime.getManifest().version}</p>
        </div>
      </header>
      <nav aria-label="SmartMapper views">
        <button
          type="button"
          className={view === 'map' ? 'selected' : ''}
          disabled={busy}
          onClick={() => setView('map')}
        >
          Smart Mapper
        </button>
        <button
          type="button"
          className={view === 'reference' ? 'selected' : ''}
          disabled={busy}
          onClick={() => setView('reference')}
        >
          Page reference
        </button>
      </nav>
      {view === 'reference' ? (
        <PageReader />
      ) : (
        <main>
          <section className="demo-card">
            <div className="demo-card-title">
              <h2>M.I.A. connection</h2>
              <span className={connection ? 'connected' : 'disconnected'}>
                {connection ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <p>Choose a Homeowners quote from your demo account.</p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void authenticate(connection ? 'disconnect' : 'connect')}
            >
              {connection ? 'Disconnect' : 'Sign in to M.I.A.'}
            </button>
          </section>
          {connection && (
            <section className="demo-card">
              <h2>Select a client and quote</h2>
              <label htmlFor="quote-search">Client name or quote number</label>
              <input
                id="quote-search"
                type="search"
                value={query}
                disabled={busy}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your Homeowners quotes"
              />
              {searching && <p role="status">Searching…</p>}
              {!searching && !quotes.length && (
                <p>No Homeowners quotes found. Search by client name or quote number.</p>
              )}
              <div className="quote-results">
                {quotes.map((quote) => (
                  <button
                    type="button"
                    className={selected?.id === quote.id ? 'quote selected' : 'quote'}
                    key={quote.id}
                    disabled={busy}
                    onClick={() => {
                      setSelected(quote);
                      setResults(null);
                      setProgress(null);
                      setMessage('');
                    }}
                  >
                    <strong>{quote.client_name}</strong>
                    <span>{quote.quote_number} · Homeowners</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {selected && (
            <section className="demo-card">
              <h2>Ready to map</h2>
              <p>
                <strong>{selected.client_name}</strong>
                <br />
                {selected.quote_number}
              </p>
              <p>Allied Trust · Louisiana Homeowners</p>
              <button type="button" disabled={busy} onClick={() => void map()}>
                {busy ? 'Mapping…' : 'Map quote'}
              </button>
              {busy && (
                <button
                  type="button"
                  className="secondary stop"
                  onClick={() => active.current?.abort()}
                >
                  Stop mapping
                </button>
              )}
              <p className="demo-hint">
                Supported answers are entered and checked on the page. Items without a clear match
                stay for your review. Final actions remain manual.
              </p>
            </section>
          )}
          {message && (
            <p className="demo-message" role="status">
              {message}
            </p>
          )}
          {progress && busy && (
            <p>
              {progress.finished} of {progress.total} mapped fields checked
            </p>
          )}
          {!!shown.length && (
            <section className="demo-card">
              <h2>
                {shown.filter((item) => item.status === 'verified').length} verified ·{' '}
                {shown.filter((item) => item.status === 'review').length} to review
              </h2>
              <ul className="demo-results">
                {shown.map((item) => (
                  <li key={item.number} className={item.status}>
                    <strong>
                      {item.number}. {item.title}
                    </strong>
                    <span>{item.status === 'verified' ? 'Verified' : item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<SmartMapper />);
