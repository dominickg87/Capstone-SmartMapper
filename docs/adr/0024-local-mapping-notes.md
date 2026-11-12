# ADR 0024: Number page fields and export local Homeowners mapping notes

- Status: Approved by Dom's November 12, 2026 request; extension 0.3.14.
- Extends ADR 0023's local reader. Supersedes its one-button-only UI and no-download restriction.

## Decision

**Read page data** shows matching numbers beside accessible controls and on panel cards. Each card
ends with a native dropdown containing all 144 expanded fields from the local M.I.A. Homeowners
form snapshot. Applicant 1 and Applicant 2 have distinct source paths. Fields are included regardless
of whether a quote answers them or a conditional question is currently visible in M.I.A. An empty
selection stays explicitly unmapped; **No matching M.I.A. field** records a required later decision.

The installed extension still requires no M.I.A. login, network service, catalog request or quote.
The snapshot was regenerated using M.I.A.'s existing catalog generator copied into this workspace's
ignored tools directory. It read MIA_web_app/main without writing to that repository. All 120 Home
FormField definitions were checked for coverage; expanding the 24 applicant patterns for the two
supported applicants produces 144 unique paths. `homeowners-catalog.ts` records source digests and
the checkout revision, labels, types, paths and predefined choices, with no customer records.
This is a bundled snapshot: future M.I.A. form changes require regenerating it and rebuilding the
extension. The retained authenticated catalog service is unrelated to this local worksheet.

The shared scanner retains ephemeral, random field keys by DOM element and structural signature in
the isolated browser world. Display numbers may change after insertion; unchanged controls retain
their panel selections. Replaced controls or changed structures receive new keys and start unmapped.
Mappings never transfer solely because a new field inherits an old display number. Current captures
replace previous captures; removed fields are excluded. Navigation and panel closure discard notes.
The panel instructs the user to download before leaving it. Failed rereads retain the last successful
capture until navigation, and do not overwrite its selections.

## Page markers

The scanner optionally creates an extension-owned, non-interactive marker host in each accessible
document. Its shadow tree contains only numbered badges. Scroll/resize and bounded observation of
captured controls reposition markers. Each radio option shares its group's number. Hidden controls
have a card but no visible marker; removed controls lose their marker. A reread disposes prior
observers, listeners and hosts before creating the new layer. Page unload also disposes the layer.
Markers may remain while the page stays open after panel closure, until reread or page reload.

The marker host has no pointer events or keyboard targets, cannot activate underlying controls, and
does not change their labels, names, values or selection state. Its shadow tree is excluded from
capture. The scanner still does not expand, navigate, select, enter values or submit.

## Explicit local export

**Download mapping notes (.txt)** downloads the current capture using a Blob and the browser's
normal download mechanism. Chrome's download directory and optional save-location prompt apply;
no downloads permission or cloud upload is added. The filename contains a timestamp and no client
or carrier identity. Each numbered entry includes the observed label, type, name/ID, section,
available choice labels, and selected M.I.A. question/path and predefined choices. Unmapped entries
and capture limitations remain explicit. This is a human-readable worksheet, never executable
mapping code, proof coverage or approval to fill an answer.

Dom explicitly requested this local export of page descriptions and chosen source fields. Those
descriptions can contain site-provided personal text; the UI states what will be downloaded. The
export does not query entered answers, checked states, cookies, storage, credentials, raw markup or
screenshots. It includes only the page origin, excluding URL paths, queries, fragments and userinfo.
Metadata is not logged or persisted elsewhere. The registry's separate closed caption/retention
policy remains unchanged; this worksheet must not be reused for registry ingestion.

The future demo with quote selection and deterministic filling is a separate implementation after
Dom supplies these notes. No live extension code, M.I.A. main changes or automatic final actions
are part of this update.

## Validation

Synthetic browser tests exercise actual installed markers, paired card numbers, grouped radios,
hidden controls, same-origin frames, scroll/layout changes, cleanup, rereads, key renumbering and
replacement, all source options, selection retention, and a real text download. They assert no
carrier input/click events or final submit. Unit tests cover the bundled catalog, selected/unmapped
entries, incomplete captures, origin sanitization and rejection of answer-bearing structures.
