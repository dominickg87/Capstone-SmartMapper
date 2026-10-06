# ADR 0016: One plan for a stable carrier page

- Status: Accepted by Dom, October 2, 2026; build 0.2.8.
- Supersedes ADR 0013 only where it required a verified SmartMapper receipt for every editable
  carrier control before local completion.

## Context

The PDF planner already receives the selected M.I.A. quote sheet, the complete visible DOM control
inventory and targeted page images. It returns all independent supported mappings for the current
page in one schema-validated plan. The prior completion check nevertheless demanded a SmartMapper
receipt for every editable control. A carrier-provided Agent Code and a blank optional Middle Initial
therefore caused another whole-page Astra request even though the first plan had finished its work.

## Decision

One complete model plan governs each stable page shape. Astra reads the PDF and the entire current
page, returns all supported independent actions together, and leaves an optional field blank when the
authoritative PDF contains no fact for it. Required, material, ambiguous and unsupported fields remain
review items. The backend independently checks every proposed PDF fact and target before returning an
ordered batch. The extension applies that batch locally and sends one normalized read-back receipt per
entry.

The checkpoint keeps only each planned semantic control key and its expected-value hash. It never keeps
the raw answer. Planned targets that have produced a receipt remain cumulative across same-page repair
passes, so a later repair cannot hide drift in an earlier entry. Approved but unexecuted targets are
discarded when a structural reinspection invalidates a batch. A human skip removes that control from the
planned ledger. A document/route advance clears the ledger.

The backend completes a page locally only when:

- the source is the PDF quote sheet and the current page shape matches the latest plan;
- capture is complete, required fields are satisfied, and the page has no validation, frame,
  authentication, consent or commitment blocker;
- no review item remains; and
- every planned target is still present, its latest audit result is verified, and its current browser
  value matches the checkpointed expected hash.

Carrier-prefilled controls and optional blank controls omitted by the plan need no SmartMapper receipt.
A changed layout, newly revealed control, required blank, page error, review, or failed planned read-back
prevents the shortcut and causes repair or human review. Ordinary Next/Continue remains a separate
backend-generated action after the clean-page checks. Bind, Issue, Sell, Submit, payment, consent,
signature and authentication actions remain blocked.

## Consequences and limits

The common case uses one planner request and one independent verification request for the whole stable
page, followed by local browser execution. It no longer pays for a second planner request merely to
confirm intentional optional blanks or carrier defaults.

The current plan contract expresses mappings and review items; it does not return a disposition record
for every optional control. The prompt requires whole-page inspection and all clearly supported entries,
but a model omission of an optional source-backed field cannot be proven from an omitted action alone.
The human still reviews the page before any final commitment. A future contract may add compact per-field
dispositions if testing shows omissions. The 48-action batch limit also permits an additional planning
pass on unusually large pages.

## Validation

Browser coverage includes a stable page with a carrier-prefilled required Agent Code, a blank optional
Middle Initial, and PDF-supported First and Last Name fields. It asserts one planner call, leaves the
prefill and optional blank untouched, verifies both planned entries, and never clicks Issue. Existing
coverage retains dynamic-field reinspection, framework rerenders, read-back mismatches, human review,
required-field stops and prohibited final actions.
