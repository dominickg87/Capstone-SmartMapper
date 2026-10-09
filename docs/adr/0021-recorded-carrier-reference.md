# ADR 0021: Record a carrier reference, annotate later, and test the same targets

- Status: Requested by Dom October 8, 2026. Dom delegated the editor presentation choice.
- Extends ADRs 0018–0020; extension 0.3.8 / backend 0.3.7.

## Decision

The side panel offers **Record carrier workflow** and **Continue recording**. While the activated
carrier tab and its training panel remain visible, a bounded passive observer checks the current DOM
every 1.2 seconds. Two consecutive equal structural observations admit a capture. Entered answers
are not part of this deduplication key. Existing capture validation and durable draft persistence
apply. Identical captures do not create another page; changed pages/conditional states receive new
sequential numbers. The recorder never clicks, expands, navigates, or enters values. The trainer
reveals branches and navigates. Authentication, origin/tab changes and capture errors pause recording.

**Stop recording & annotate** opens an extension-owned full browser tab. It lists captured pages,
searchable field cards, M.I.A. questions, transformations, Ignore switches and workflow decisions.
It reuses the existing editor, catalog, authorized backend and autosave API. Metadata editing does
not require the carrier tab to be active. Live testing switches back to the authorized carrier tab,
validates the captured page and creates the existing immutable preview. The side panel then provides
quote selection, deterministic execution, read-back, exceptions and Resume training.

## Privacy and identity

This records a form reference, not HTML, JavaScript, screenshots or browser/session state. Raw
customer values, selected states, validation messages and arbitrary page text remain excluded.
Readable reference captions are optional metadata, admitted only by a shared closed form-caption
grammar. Known entered strings are removed before admission; suspicious captions are omitted.
Readable option labels use a closed static vocabulary, and entity/private choices remain omitted.
Unknown captions/options retain their hashes and numbered fallbacks. The backend enforces the same
caption policy. This deliberately does not use a best-effort PII regex as the only gate for retaining
arbitrary text. Reference captions do not authorize actions or substitute for semantic identity.

Existing hashed labels/context remain the primary semantic representation. New observations also
carry hashes of bounded DOM name/id attributes, excluding recognizable generated identifiers.
Training, published versions and recovered drafts preserve those optional hints. A unique matching
hint may resolve a field after help text changes, only when label, section, tag, type and role still
agree. Ambiguous or changed semantic targets remain exceptions. Legacy captures without hints keep
their existing matching path. Per-signature occurrence order now agrees with training's visual order.
Neither the carrier origin alone nor a training display number selects a target.

## Diagnostics and compatibility

Planning emits redacted counts for observed controls, trained fields, matched fields, executable
actions and review items, plus closed review-reason counts. This distinguishes missing sources and
targets from browser entry/read-back failures without logging client data. Existing receipt events
continue to describe execution. Existing drafts and mapping versions remain intact. Old captures
cannot retroactively acquire readable captions or identity hints; fresh captures receive them.
Editor saves send repeat-position overrides only when explicitly changed, so inferred positions on
ordinary fields cannot prevent otherwise valid source/Ignore choices from being saved.

No M.I.A. deployment, new cloud service, model or permissions expansion is required. Reference and
mapping data use SmartMapperJobs and SmartMapperMappings. Captures cover only states the trainer
visits, not all possible carrier branches. Keep the panel open and pause on each state for a few
seconds. Recording is capped at 100 states and uses the existing 400-control capture bound. Closed
shadow roots, inaccessible frames and unsupported custom widgets remain limits. Unknown captions
may still need inspection on the live page. Address autocomplete suggestion selection remains manual.

## Validation

Unit tests cover caption privacy, ambiguous names/record choices, unique-identity recovery after help
text changes, layout reordering and rejection of changed labels/types/sections or duplicate identities.
The real-extension localhost test records a newly revealed section, opens the reference tab, edits
and reloads saved source/Ignore choices, changes carrier help text, returns to a preview and verifies
the entered value. Existing final-submit protection and registry lifecycle tests remain required.

Delivery check, October 8: all 215 unit tests and nine localhost browser tests passed, as did
formatting, lint, strict type checking and workspace builds. The browser tests also exercise testing
a published mapping from the reference editor. Azure CLI deployed backend 0.3.7 and `/health`
confirmed that build; extension 0.3.8 is built for the existing demo/Azure origins. No agent accessed
a live carrier. Dom's live-carrier acceptance and address-widget behavior remain to be tested.
