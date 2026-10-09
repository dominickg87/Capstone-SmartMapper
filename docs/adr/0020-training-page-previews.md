# ADR 0020: Pause training, preview a page, and resume the draft

- Status: Approved by Dom, October 8, 2026; implemented in build 0.3.4.
- Extends ADRs 0018 and 0019.

## Decision

**Pause training & test** saves pending page edits, creates an immutable preview of that captured
page, clears training overlays, and opens quote selection. The original training session stays a
draft. Unassigned fields are omitted from the preview and appear as missing-mapping review items;
previewing never invents a disposition. Explicitly removing a draft choice now persists as null.
Publication still requires every captured field and workflow control to have a decision.

Previews use the existing registry, source authorization, deterministic executor and local read-back.
Their status is `preview`, they have a separate mapping ID, and they record the originating training
ID, draft revision, page ID and tab ID. They are scoped to the creating trainer and tab. The backend
requires the captured route and semantic page signature. Previews contain no workflow actions and
cannot navigate, expand repeated records, verify a production mapping, or activate. They never occupy
or change an active registry slot. Normal mapping jobs cannot resolve previews.

**Resume training** stops the test, saves a value-free result summary against the exact preview,
ends its job and source authorization, and restores the draft's current page, choices and numbering.
**Test another demo quote** ends the prior job before unlocking quote selection. Entries already on
the carrier page remain; a later test can overwrite mapped entries with the newly selected quote.
Previews do not clear unrelated carrier fields or reset a carrier quote/session. A trainer should use
a fresh carrier quote when testing a different client across conditional or already populated fields.

**Continue training this mapping** copies a completed version into a fresh authorized draft.
Source paths, dispositions, numbering and semantic targets survive; transient element IDs/rectangles
are reconstructed from a fresh page observation. Its original version remains immutable, and a later
publication produces a new version with new proof requirements. Test snapshots do not consume that
production version lineage. Ignored workflow controls were not present in published versions and
remain excluded in their editable copies.

## Execution and diagnostics

The DOM observer excludes SmartMapper-owned overlay controls. Review badges cannot change the
carrier control manifest or trip the page-change guard. Resume fetches the latest job revision before
planning. Concurrent local Pause requests share one operation, and stopped batches pause the server
queue. Genuine page changes still stop execution and require review. A conflict during an operation
pauses mapping; the next explicit Resume refreshes the server state rather than retrying stale actions.

Receipt diagnostics record action type, hashed target key, status and reason, including blocked
receipts. Known API conflict reasons and available client/server revisions are allowlisted. Arbitrary
error text, customer values and source tokens remain excluded.

October 8 correction (extension 0.3.7 / backend 0.3.6): training can omit private dropdown choices
and require human entry. Comparing that capture's zero option count to the live list rejected the
unchanged page. Shared page comparison now normalizes the live choice count only for an exact
trained semantic target and occurrence whose saved metadata is human-only with no options.
It does not mutate stored signatures or live controls. Preview admission, registry page matching,
and training-overlay recovery use this same comparison, preserving existing saved work. Route,
control count/order/type, required state and ordinary dropdown domains remain checked; human-only
controls remain manual and all source provenance and read-back checks remain in force.

## Storage, deployment and validation

Use the existing SmartMapperMappings registry table, SmartMapperJobs training/checkpoint table and
App Service. M.I.A. APIs and infrastructure are unchanged. Value-free preview results are bounded to
the latest 100 summaries per training draft. Preview metadata remains in the registry; automatic
preview retention/cleanup is not added by this change. Direct version lookup avoids scanning registry
history for each field-planning request.

Unit coverage checks partial and immutable previews, draft editing, publication requirements,
trainer/tab/page boundaries, prohibited verification/activation, lineage, and redacted diagnostics.
The real-panel localhost browser test saves a partial draft, prefills with exception overlays, recovers
a stale server revision, resumes the same draft, changes a mapping, tests again, captures another page,
and checks that final submit remains untouched. All browser fixtures are synthetic.
