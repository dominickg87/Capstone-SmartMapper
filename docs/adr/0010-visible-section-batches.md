# ADR 0010: Plan and verify visible sections together

- Status: Accepted from Dom's request to fill sections instead of waiting on every field, October 1, 2026.
- Extends ADRs 0005 and 0009. First delivered in application build 0.2.2.

The previous loop made one planning call and one independent verification call per field. Permit up
to eight independent native fill/select/check entries in the same visible section per plan. Scrolling,
custom widgets, record creation and choices that reveal dependent fields remain single actions.
Page navigation remains manual. Each action retains its source IDs, transformation and policy checks.

The independent verifier audits every entry in one request with the current screenshot and manifest,
returning an exact action-ID-indexed result set. Missing, extra or duplicate results fail closed. Every
entry must pass; uncertain entries pause the proposed batch for review. Source answers are read once
per planning round. A changed source revision still ends mapping until a fresh job is started.

Return an initial action batch and optional followingBatches. The extension applies them sequentially,
checking the active tab and backend job before each, then posting a separate read-back receipt. The
backend accepts only the next expected action and advances through a queue of hashes and provenance;
raw plans and answers stay in request/extension memory, not checkpoints or logs. Pause, cancellation,
failure and new observations invalidate the queue. A lost panel/session recovers by observing again,
not by replaying an old plan. Model calls are per section; browser receipts are still per field.

The shared executor carries a plan revision forward only if its successful entry leaves all other
control values, labels, sections, options, rectangles, nodes and page identity unchanged. Hash visible
page text as well, to detect changes to plain legacy labels. Recheck this fingerprint immediately
before the next entry. Revealed fields, postbacks, node replacements, human edits and validation
changes stop continuation; the human can review and Resume on the fresh page.

Eight ready fields can therefore use two model requests instead of sixteen, plus ordinary browser
read-backs and backend receipts. This is a request-count reduction, not a guaranteed latency ratio.
Reactive forms may need smaller batches or renewed observation. Keep configured model/reasoning
settings, source equivalence checks, manual navigation and prohibited-action rules intact.

Regression tests cover request counts, per-action verifier results, ordered/idempotent receipts,
checkpoint privacy, pause and read-back failures, forbidden targets, viewport/section limits, legacy
multi-field entry, DOM/text changes and final submit never clicked.
