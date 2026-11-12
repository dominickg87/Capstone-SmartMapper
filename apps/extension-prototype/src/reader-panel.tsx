import { useEffect, useRef, useState } from 'react';
import type { ReadPageData } from '@smartmapper/contracts';
import { readActivePage } from './page-reader-client.js';
import { homeownersFields } from './homeowners-catalog.js';
import { downloadMappingNotes, NO_MIA_FIELD, type MappingNotes } from './mapping-notes.js';
import './reader-panel.css';

const catalogGroups = [...new Set(homeownersFields.map((field) => field.section))].map(
  (section) => ({
    section,
    fields: homeownersFields.filter((field) => field.section === section),
  }),
);

export function PageReader() {
  const boundTabId = Number(new URLSearchParams(location.search).get('tabId') ?? '-1');
  const [data, setData] = useState<ReadPageData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mappings, setMappings] = useState<MappingNotes>({});
  const [downloadStatus, setDownloadStatus] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    const changed: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (tabId, change) => {
      if (tabId !== boundTabId || (!change.url && change.status !== 'loading')) return;
      generation.current++;
      setData(null);
      setMappings({});
      setDownloadStatus('');
      setBusy(false);
      setError('Page changed. Read page data to refresh the list.');
    };
    chrome.tabs.onUpdated.addListener(changed);
    return () => chrome.tabs.onUpdated.removeListener(changed);
  }, [boundTabId]);
  const read = async (): Promise<void> => {
    const attempt = ++generation.current;
    setBusy(true);
    setError('');
    setDownloadStatus('');
    try {
      const next = await readActivePage(boundTabId);
      if (attempt === generation.current) {
        setData(next);
        setMappings((previous) =>
          Object.fromEntries(
            next.fields.flatMap((field) =>
              previous[field.key] ? [[field.key, previous[field.key]!]] : [],
            ),
          ),
        );
      }
    } catch (failure) {
      if (attempt === generation.current)
        setError(failure instanceof Error ? failure.message : 'Could not read this page.');
    } finally {
      if (attempt === generation.current) setBusy(false);
    }
  };
  const save = (): void => {
    if (!data || busy) return;
    try {
      downloadMappingNotes(data, mappings);
      setDownloadStatus('Download started. Check your Downloads folder.');
    } catch {
      setDownloadStatus('The notes could not be downloaded. Try again.');
    }
  };
  return (
    <main>
      <header>
        <h1>SmartMapper POC</h1>
        <span>Version {chrome.runtime.getManifest().version}</span>
      </header>
      <button type="button" disabled={busy} onClick={() => void read()}>
        Read page data
      </button>
      <p className="intro">
        Read the page, match its numbered fields, then download your mapping notes.
      </p>
      <div role="status" aria-live="polite">
        {busy ? 'Reading page…' : data ? `${data.fields.length} fields found` : ''}
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          {data.fields.length === 0 && (
            <p>No form fields were found in the accessible page content.</p>
          )}
          {data.truncated && (
            <p className="notice">
              This page exceeds the reader’s size limit. The list is incomplete.
            </p>
          )}
          {data.inaccessibleFrames > 0 && (
            <p className="notice">{data.inaccessibleFrames} embedded frame(s) could not be read.</p>
          )}
          {data.unreadableControls > 0 && (
            <p className="notice">{data.unreadableControls} control(s) could not be read.</p>
          )}
          <ol className="fields" aria-label="Page fields">
            {data.fields.map((field) => (
              <li key={field.key}>
                <div className="field-title">
                  <span className="number">{field.number}</span>
                  <h2>{field.label}</h2>
                </div>
                <p className="metadata">
                  {[
                    field.type,
                    field.required ? 'Required' : 'Optional',
                    !field.visible && 'Hidden',
                    field.disabled && 'Disabled',
                    field.readOnly && 'Read only',
                    field.frame > 0 && `Frame ${field.frame}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {field.section && field.section !== field.label && (
                  <p className="section">{field.section}</p>
                )}
                {(field.name || field.id) && (
                  <p className="identifier">
                    {field.name ? `Name: ${field.name}` : `ID: ${field.id}`}
                  </p>
                )}
                {field.choices.length > 0 && (
                  <ul className="choices" aria-label={`Choices for ${field.label}`}>
                    {field.choices.map((choice, index) => (
                      <li key={index}>
                        {choice.label}
                        {choice.disabled ? ' (disabled)' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {field.choicesIncomplete && (
                  <p className="notice">
                    Some choices are unavailable. Open this control on the page and read again.
                  </p>
                )}
                <label className="mapping-label" htmlFor={`mapping-${field.number}`}>
                  M.I.A. Homeowners field
                </label>
                <select
                  id={`mapping-${field.number}`}
                  aria-label={`M.I.A. field for ${field.number}. ${field.label}`}
                  value={mappings[field.key] ?? ''}
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMappings((previous) => ({ ...previous, [field.key]: value }));
                    setDownloadStatus('');
                  }}
                >
                  <option value="">Choose a M.I.A. field — unmapped</option>
                  <option value={NO_MIA_FIELD}>No matching M.I.A. field</option>
                  {catalogGroups.map((group) => (
                    <optgroup label={group.section} key={group.section}>
                      {group.fields.map((source) => (
                        <option value={source.sourcePath} key={source.sourcePath}>
                          {source.question} [{source.sourcePath}]
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </li>
            ))}
          </ol>
          <p className="footnote">
            Only fields already present in accessible page content can be read. Reveal conditional
            questions or dropdown choices, then read again. Closed components and protected frames
            may be unavailable.
          </p>
          <footer>
            <p className="footnote">
              {homeownersFields.length} M.I.A. Homeowners fields available. Notes stay in this
              panel; download before navigating or closing it. Hidden fields have no visible page
              marker. The file includes the field descriptions shown above and your selections.
            </p>
            <button type="button" disabled={busy || data.fields.length === 0} onClick={save}>
              Download mapping notes (.txt)
            </button>
            {downloadStatus && <p role="status">{downloadStatus}</p>}
          </footer>
        </>
      )}
    </main>
  );
}
