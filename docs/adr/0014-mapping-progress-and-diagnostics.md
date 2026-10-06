# ADR 0014: Mapping progress and timeout diagnostics

- Status: Accepted under Dom's October 2 request for a loader, visible mapping steps and logs.
- Delivered in extension and backend build 0.2.6. Extends ADRs 0011 and 0013.

## Visible progress

The status card shows a spinner, actual current step, step elapsed time, field position in a
batch, verified count and recent activity. Browser stages cover authorization, field discovery,
page capture, filling, read-back, reinspection and navigation. The backend reports source access,
PDF preparation, planning, independent verification and chat through real operation boundaries.
The model's internal reading/thinking is not exposed; the UI does not invent intermediate stages
or percentages. A slow-step notice appears after 30 seconds. Failure stops the spinner and names
the last step; a restored inactive job offers Resume instead of claiming it is still running.

An active model request polls the authenticated `/v2/jobs/{jobId}/diagnostics` endpoint every two
seconds. Request IDs correlate the extension, backend stage records and model timing events.
Diagnostics do not modify job revisions, so polling cannot invalidate a plan or receipt.
Only the existing job token and scope can read that job's events. Missed polls do not stop mapping.

## Logging and retention

Strict schemas allow only stage/phase enums, UUID correlation IDs, timestamps, elapsed time,
numeric counts and enumerated failure codes. No quote IDs, tenant names, field labels, answers,
PDF content, images, arbitrary exception messages, stacks, URLs or tokens enter these records.
Backend events go to stdout and to Application Insights when already configured. Local stdout
remains `.tools/local-runtime/api.stdout.log`; extension events also appear in its panel console.

**Diagnostics → Copy diagnostics** combines the current panel's last 150 events with the backend's
recent events and build versions. A selectable text box provides a fallback when clipboard access
is unavailable. It can be used during a slow request or after a failure; it exports metadata only.
The panel buffer ends when the panel document closes. Backend recent-event buffers expire after
one hour of inactivity, hold at most 100 events per job and approximately 200 jobs, and reset on
process restart. They are operational telemetry, not durable checkpoints. In a multi-instance
deployment polling can miss events on another instance; aggregated backend logs remain authoritative.

## Deadlines and cancellation

The old extension waited 180 seconds while an SDK attempt could take 120 seconds and retry once,
in addition to source fetching and verification. Successful calls were timed, but failed stages
were not, leaving no evidence for a later timeout after the first field.

The backend now applies a 150-second total HTTP operation deadline and passes its abort signal
through source metadata calls and AI planning, verification and chat. Stage wrappers also stop
waiting when a dependency ignores cancellation. Browser model requests wait up to 165 seconds,
leaving time to receive the backend's named-stage error; ordinary requests have a 20-second limit
and diagnostic polls a five-second limit. PDF generation/cache fetch retains its bounded 90-second
fetch limit. Cancelling a shared PDF wait does not interrupt an existing prefetched document.

Pause or panel hiding cancels the outstanding browser model request. A disconnected HTTP client
cancels the backend request signal. Pending browser actions remain subject to job revision and
tab checks; a late model result cannot enter fields after Pause or timeout. Cancellation ends the
client's wait and HTTP work, not a guarantee that Azure has stopped all server-side computation.
The separate verifier, source checks, read-back and final-action prohibitions remain unchanged.

## Verification

Tests cover concurrent job log isolation, expiry/bounds, failing telemetry sinks, redaction,
authenticated diagnostics, model cancellation on deadline, and stale UI completion after Pause.
A synthetic browser case fills one field, stalls the next planning call, shows live progress,
times out with the stage identified, exports diagnostics, and never clicks Issue policy.

The prior log contains a 36.2-second plan and 5.7-second verification, but no failed-stage event.
That establishes one completed round only; it does not identify the original later failure.

Reference: [OpenAI retry and deadline guidance](https://developers.openai.com/api/docs/guides/rate-limits).
