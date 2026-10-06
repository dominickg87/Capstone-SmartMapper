import { useEffect, useState } from 'react';
import type { JobView } from '@smartmapper/contracts';
import { stageLabels, type MappingProgress } from './progress.js';

export function MappingStatus({
  progress,
  job,
  message,
}: {
  progress: MappingProgress;
  job: JobView | null;
  message: string;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!progress.active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress.active]);
  const event = progress.failure ?? progress.current;
  const elapsed = event
    ? Math.max(0, event.elapsedMs + (progress.active ? now - Date.parse(event.at) : 0))
    : 0;
  const recent = progress.events
    .filter((item) => item.stage !== 'request' && ['end', 'error'].includes(item.phase))
    .slice(-5);
  return (
    <section
      className={'status' + (progress.failure ? ' status-failed' : '')}
      aria-label="Mapping progress"
      aria-busy={progress.active}
    >
      <div className="status-heading">
        {progress.active && (
          <span className="spinner" role="img" aria-label="Mapping in progress" />
        )}
        <h2 aria-live="polite">
          {progress.failure
            ? progress.failure.code === 'timeout'
              ? 'Mapping timed out'
              : 'Mapping needs attention'
            : progress.active
              ? 'Mapping in progress'
              : job
                ? ['running', 'executing', 'planning'].includes(job.status)
                  ? 'Ready to resume'
                  : job.status.replaceAll('_', ' ')
                : 'Ready when you are'}
        </h2>
      </div>
      {event && (progress.active || progress.failure) && (
        <p className="current-step" aria-live="polite">
          {stageLabels[event.stage]}
          {event.counts?.batchSize
            ? ` — field ${event.counts.batchIndex} of ${event.counts.batchSize}`
            : ''}
        </p>
      )}
      {progress.active ? (
        <>
          <p className="counts" aria-label="Step elapsed time">
            {Math.floor(elapsed / 1000)}s on this step
          </p>
          {elapsed >= 30_000 && (
            <p className="slow-step">
              This step is taking longer than usual. You can Pause or copy diagnostics while
              waiting.
            </p>
          )}
        </>
      ) : (
        <p>{message}</p>
      )}
      {progress.failure && (
        <p>
          Last step: {stageLabels[progress.failure.stage]}. Copy diagnostics below, then review the
          page before resuming.
        </p>
      )}
      {job && (
        <p className="counts">
          {job.verified} entries verified · {job.failed} attempts need attention
        </p>
      )}
      {!!recent.length && (
        <details className="activity">
          <summary>Recent activity</summary>
          <ol>
            {recent.map((item) => (
              <li key={item.id}>
                <span>
                  {item.phase === 'error' ? '!' : '✓'} {stageLabels[item.stage]}
                </span>
                <small>
                  {(item.elapsedMs / 1000).toFixed(1)}s
                  {item.code ? ' · ' + item.code.replaceAll('_', ' ') : ''}
                </small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
