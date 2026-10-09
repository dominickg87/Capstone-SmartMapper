# ADR 0022: Keep training markers aligned and discover revealed fields

- Status: Approved by Dom's October 9, 2026 request.
- Extends ADRs 0018–0021; extension 0.3.9 / backend 0.3.8.

## Decision

Numbered training markers use the live control's viewport rectangle. Captured document coordinates
are no longer used to position outlines. Document and nested scroll events, viewport resize, DOM
layout changes and a bounded layout timer update their positions. Hidden, disconnected and clipped
controls have no visible marker. Selecting a field scrolls its actual element into view, including
its scrollable ancestors. This does not enter values or navigate the carrier.

Ordinary side-panel training now uses the existing passive recorder to discover changed page states.
**Automatically number new fields** starts enabled. The observer runs every 1.2 seconds while the
editable draft's carrier tab and Train panel are active. Two equal structural observations are
required before capture. Pending edits/autosave and prefill tests suspend capture. Metadata editors
are briefly locked while a capture is saved; draft revisions still enforce concurrent-write checks.
The separate reference editor does not capture live pages in the background.

Only newly identified controls receive new sequential numbers. Same-route fields may share a
logical identity across snapshots when unique hashed DOM identity hints and semantic domains agree,
or when unchanged semantic occurrence groups identify a control unambiguously. Changed labels,
types, option domains, human-only classification and conflicting identity hints cannot inherit a
mapping. Repeated groups with changed membership require unique hints. Different routes never share
logical identity automatically. Ambiguous fields receive new numbers and require training.

Each page-state field keeps a distinct snapshot ID for proof coverage. An optional logicalFieldId
links its number and data-field annotations to compatible occurrences in other captured states.
Publishing and reopening an editable mapping preserve these links. Navigation approvals remain
specific to each scenario and are never propagated. Existing drafts without logicalFieldId continue
to work; later captures can link to their original field IDs. Existing duplicate numbers/annotations
from historical captures are not retroactively merged.

Revisiting the exact captured structure returns the existing page without a new revision or duplicate
state. Explicit manual recapture uses the same preservation rules. Changes remain value-free and
durable in the existing draft store; no new service, M.I.A. deployment or host permission is required.
The existing limits of 100 captured states and 400 controls per state still apply. Discovery reports
errors and pauses rather than losing unsaved work. Unrevealed controls, inaccessible frames and
closed shadow roots are not automatically discoverable.

## Validation

Unit coverage exercises 1–20 becoming 1–40, saved-choice propagation, hide/reveal deduplication,
revision conflicts, changed domains/routes/identities, repeated-row insertion, scenario-specific
navigation approval and identity preservation through publish/edit. The real-extension localhost
tests exercise automatic conditional capture, returning to prior states, pause/test/resume, nested
horizontal/vertical scrolling, document scrolling, layout changes, clipping and field focus.
Final-submit controls remain untouched. Live-carrier acceptance remains with Dom.

Delivery check, October 9: formatting, lint, strict type checking, workspace builds, all 219 unit tests
and all nine localhost browser tests passed. The overlay browser test also passed after adding a
carrier-style override regression. Azure CLI deployed backend 0.3.8 and `/health` confirmed that build.
Extension 0.3.9 is built for the existing demo/Azure origins and requires reloading in Chrome.
