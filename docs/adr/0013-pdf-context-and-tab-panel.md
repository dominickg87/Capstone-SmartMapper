# ADR 0013: PDF quote-sheet context and a tab-specific panel

- Status: Accepted by Dom, October 1, 2026; build 0.2.5.
- Extends ADR 0012. Dom approved using the M.I.A. PDF quote sheet as model context,
  planning the current page in batches, and opening the panel only on the activated tab.

## Source and authority

The extension defaults to `VITE_SMARTMAPPER_SOURCE_FORMAT=pdf`. M.I.A. issues the same
single-use quote/tab/origin grant and returns PDF source metadata when requested.
The backend uses that short-lived capability to fetch `quote-sheet/metadata` and
`quote-sheet` under `/api/extension/smartmapper/v2`. Both routes recheck the issuing
token, ownership, subscription, principal allowlist and expiry. The feature middleware
still runs before grant-table access. No migration or new Azure service is required.

M.I.A. reuses its Home/Auto document generators. PDF responses contain bounded base64,
tenant/user/quote binding, a source revision and a SHA-256 content digest. The revision
covers form data, notes, templates and generator code. Temporary PDF/DOCX files are
removed after reading or failed conversion. This source path does not depend on the
database-to-question catalog. The legacy `questions` mode remains for regression tests.

PDF generation starts after grant redemption while the extension inspects the page.
The backend keeps at most 20 documents in memory, for five minutes or grant expiry,
whichever is earlier; cancellation evicts the document. Each planning/chat request
rechecks current M.I.A. authorization and source revision before using the cached PDF.
A restart refetches the PDF using the still-valid capability. Raw documents are never
included in checkpoints, browser storage or normal logs.

Astra receives the PDF as an inline Responses `input_file` with `store:false`.
There is no Document Intelligence, file upload/vector store, or separate extraction call.
The planner returns bounded, schema-validated actions and PDF citations: printed question,
printed answer, entity and page. Citation IDs incorporate the document digest and evidence.
These are untrusted transcriptions. The separate verifier receives the original PDF and
independently validates each transcription, target, entity and transformation. It cannot
verify a PDF-derived source without the PDF. Blank/N/A/missing facts do not authorize entries.
The shared action policy and normalized browser read-back remain mandatory.

## Fewer captures and planning calls

The full DOM inventory includes visible controls outside the viewport. PDF mode captures
the top viewport and additional viewports needed by unlabeled fields or custom controls.
It does not require images for every clearly labeled native field. Ambiguous targets must
still have current visual evidence. Capture limits and incomplete-page navigation checks
remain. Custom, hidden, virtualized and embedded forms can still require human review.

Independent approved entries execute in document order, up to 48 per batch. A controlling
answer that changes the form invalidates the remaining batch; fresh inspection plans the
new fields. Existing answer hashes, page structure, labels/options, required fields and
errors are checked before accepting a completed batch. If every editable field is verified
and the page is unchanged and clean, the backend completes review without another model
planning call. Otherwise it replans. This does not remove independent source verification
or authorize new facts or final commitments. A PDF alone is not a speed guarantee.

## Interactive review

Each review item offers **Suggest a match**, which asks the existing PDF-aware chat for the
best supported interpretation and its evidence. Suggestions do not execute actions; absent
facts remain absent. The human can enter an answer on the carrier page and select **Skip this
field** to leave that field alone while mapping continues. Skips are checked by the backend,
not just prompt guidance, and are bound to the current document/route and control shape.
Only an existing review of an editable, non-human-only control can be skipped. Changing pages
clears skips. Empty required fields and validation errors still prevent automatic Next.
Checkpoints retain only field keys and shape hashes for skips, never the entered answer.

## Panel behavior

The global panel is disabled. A toolbar click enables and opens a tab-specific panel with
that tab ID in its extension URL and disables other tabs' panels. Switching tabs hides it;
returning to its tab shows it again. A different origin closes/disables it. Ordinary same-
origin carrier navigation retains it. Mapping is still bound to its original quote/tab/
origin; changing carriers requires cancelling that job. Authentication remains shared
within the extension's trusted session storage.

## Validation

Tests cover real M.I.A. Home/Auto PDF generation, capability revocation, disabled/unmigrated
tenants, revision changes, temporary-file cleanup, bounded PDF transport, digest checks,
forged citations, N/A, wrong-quote documents, verifier rejection, and redacted checkpoints.
Chrome tests cover single-tab panel activation, origin changes, one-image native page
batches, top-to-bottom execution, dynamic-field repair and final Issue never being clicked.
Interactive tests cover suggestions without execution, preserving manually entered values,
model attempts to overwrite skipped fields, required-field stops and prohibited/stale skips.
An October 1 live Azure smoke test with an in-memory synthetic PDF confirmed direct input,
approved a supported answer, and rejected a deliberately forged source transcription.
This establishes endpoint compatibility; it is not a carrier performance benchmark.

References: [Azure Responses file input](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses#file-input),
[Chrome tab-specific side panels](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).
