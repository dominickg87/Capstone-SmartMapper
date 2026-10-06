# ADR 0017: Semantic active-tab batch execution

- Status: Implemented for the build 0.2.9 live-carrier experiment on October 2, 2026.
- Extends ADRs 0012, 0015 and 0016. It does not change source authorization, model
  verification, action policy or final-action prohibitions.

## Evidence

The completed build 0.2.8 run spent 0.6 seconds reading M.I.A. metadata, 2.3 seconds retrieving the
PDF, 11.4 seconds planning five actions for 27 observed controls, and 5.7 seconds independently
verifying those actions. The first browser entry verified. The second returned
`read_back_mismatch`; the next already-approved entry immediately returned `page_changed`. There was
no second planner call in that run.

The active-tab executor had required the entire page observation to remain byte-equivalent except
for the target value. Normal carrier validation text, geometry changes, global text updates or
framework rerenders therefore made a same-page entry look structural. It then read the detached old
node, cleared the page session and rejected the remaining actions. The extension also crossed its
message and HTTP boundaries separately before every field.

## Decision

Execute the already-approved non-navigation actions as one content-script batch. The content script
still applies actions sequentially and returns one normalized receipt per field. Each receipt is
accepted by the backend before the next field begins, preserving checkpoint order, pause behavior
and independent failure policy without a repeated job GET or a new page observation between fields.

Before every action, observe the current page and relocate the target by a semantic key derived from
its section, accessible label, control kind and stable DOM hints. SmartMapper-generated element IDs,
current values, validation state, coordinates and control order are not semantic identity. After an
entry, poll for bounded DOM and validation settling, observe again, relocate the fresh target and
read back that fresh control.

Immediately before writing, compare the relocated target with the last observed target snapshot. If
a person or the carrier changed that target, stop without overwriting it unless the new value already
equals the approved expected value. Value changes in sibling controls do not invalidate the batch.

A page remains the same when its origin, route, title, headings, authentication boundary, frame
boundary and semantic control set are unchanged. Values, rectangles, page text, validation messages,
control order and native node identity may change without invalidating independent work. A changed
route, heading, question, option set, required/disabled/human-only boundary or added/removed control
invalidates the remaining stale actions. An isolated read-back or validation failure becomes a
review item while other independent approved actions continue.

Pause and Cancel send a cancellation signal to the active content batch between fields. Navigation
remains a separately guarded action. Every fresh target is evaluated by the existing action policy;
Bind, Issue, Sell, final submit, payment, consent, signature, authentication and other prohibited
actions remain unavailable.

Redacted diagnostics record the action type, receipt status and reason, plus the semantic target-key
hash. They do not record labels, answers, entered values, PDF content or screenshots.

## Consequences and limits

The common path now performs one model plan, one independent model verification request and one
local active-tab execution batch. This repairs the failure observed in 0.2.8 without adding Azure
Document Intelligence, a vector database, a hosted browser, a VM or another App Service.

The content script still uses deterministic DOM events. Closed shadow roots, inaccessible frames,
custom widgets that reject synthetic events and full document postbacks may need human input or a
separately reviewed interaction method. A future restricted tool loop can repair exceptional fields,
but arbitrary model-generated JavaScript remains out of scope.

The planner can still silently omit a source-backed optional field because its current contract
returns actions and reviews rather than a disposition for every eligible control. The next planned
slice is a one-time per-job PDF fact index followed by a complete control-coverage ledger. That work
is independent of this executor repair.

## Validation

Unit coverage changes values, validation messages, page text, geometry and control order while
replacing all input nodes, and confirms semantic relocation. It also proves that route, heading,
question, option and newly revealed control changes invalidate stale work. Browser coverage runs a
single approved page batch through framework-style node replacement, isolated read-back failure and
dynamic-field reveal paths, while asserting that prohibited final controls are never activated.
