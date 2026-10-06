# ADR 0018: Human-trained deterministic mapping registry

- Status: Accepted by Dom, October 6, 2026; implemented in build 0.3.0.
- Supersedes ADRs 0005, 0006, and 0009 through 0017 for the active SmartMapper v2 runtime.
  Their evidence remains useful historical context. The shared executor, action policy,
  provenance, browser read-back, resumable state, and human-only final-action rules remain.

## Context

The Astra/PDF experiments proved that a multimodal planner could propose useful matches, but routine
quote entry remained slow and fragile. Model planning and verification repeated work that is stable
for a known carrier workflow. A rejected field or ordinary framework rerender also made the agentic
loop harder to diagnose than a versioned carrier mapping.

Dom chose a human-trained registry. An authorized trainer explicitly relates every observed carrier
field to the complete M.I.A. Home or Auto field catalog. Production jobs then compile that registry
into allowlisted browser actions and verify each result locally. Astra, PDF interpretation, mapping
chat, model suggestions, prompts, and model verification leave the active SmartMapper runtime.

## Decision

The side panel has separate **Map** and **Train** modes. A trainer selects a M.I.A. line of business.
SmartMapper binds the workflow to the tenant, the active tab's canonical carrier origin, and Home or
Auto; it uses that origin as the carrier base URL and generates `Home workflow` or `Auto workflow` as
display text. A trainer cannot create identity with a supplied name or state/product/program variant.
SmartMapper scans the current rendered page, groups DOM controls into logical fields, orders them in
document order, and gives them workflow-wide display numbers. Large numbered overlays on the carrier
page and linked panel rows let the trainer find either representation quickly.

The Home and Auto selectors use a M.I.A.-owned, value-free field catalog. It includes every reviewed
question definition, not only fields answered by the currently selected quote. Each choice shows the
question wording, section, entity and stable source pattern. Repeated applicants, drivers and
vehicles use wildcard patterns and an explicit same-position or fixed-index binding so all supported
instances remain available without hardcoding one quote's row count.

Every observed eligible carrier field receives one explicit disposition:

- map from a M.I.A. source pattern;
- keep the carrier-provided default;
- use an explicitly approved fixed operational value;
- require human entry;
- ignore a non-data/not-applicable control; or
- intentionally leave an optional field blank.

Approved transformations are typed and allowlisted: identity, date formatting and date-part
extraction, phone formatting, boolean and enum option crosswalks, and bounded split/compose rules.
Trainer-authored JavaScript and silent inference of customer or underwriting facts are unavailable.
Salutations and similar optional carrier questions that M.I.A. does not collect can be marked
**Leave blank** and are not reported as accidental missing mappings.
An approved fixed operational value has a recognized agency/carrier classification and the matching
closed reason `approved_agency_identifier` or `approved_carrier_identifier`; trainers cannot persist
a free-form rationale.

Training is page-by-page. The trainer manually navigates ordinary pages and reveals conditional
branches, then chooses **Capture next page** or **Capture scenario**. Display numbering continues
across captures. Persistent workflow identity uses exactly the tenant, canonical carrier origin, and
line of business. Pages and fields add privacy-safe route and semantic signatures; display label,
display number, current value, coordinates, quote IDs, generated framework IDs, and DOM node identity
are not registry keys. Conditional paths form a page-state graph rather than one assumed linear list.

Drafts autosave outside the extension service worker. **Mapping complete** validates that every
captured eligible field has a disposition and publishes an immutable `testable` version. A
representative job must execute the exact version with policy checks, complete proof coverage, and
normalized read-back before the backend marks it `verified`; only then can activation atomically make
it `active` and supersede the prior active version. Editing creates a new version; the last verified
version remains available for rollback. Training and publishing use a separate ability and
training-principal allowlist from ordinary mapping and are initially scoped to Dom's approved POC
principal and tenant.

Production resolves the active registry version and fills all independently supported fields. One
missing or failed field never invalidates successful siblings. The panel and carrier-page overlay
distinguish missing mapping, missing M.I.A. answer, changed target or options, intentional human entry,
intentional blank/default, and entry/read-back failure. After entry receipts, the extension takes a
fresh page observation before backend policy can issue a guarded trained Next/Continue. Required
unresolved fields stop navigation; known independent work remains saved. Bind, Issue, Sell, final
submit, payment, authentication, consent, attestation, and signature controls remain human-only.

## Storage and privacy

Published mapping metadata is stored in the provisioned versioned `SmartMapperMappings` Azure Table
in the existing storage account. Resumable training drafts use the existing job checkpoint store. The
extension never receives storage credentials. Raw carrier semantics are ephemeral in the active tab;
drafts and registry records persist carrier-derived labels, sections, context, group strings, and
option values/labels only as prefixed SHA-256 digests. Registry records also contain M.I.A. source
patterns, typed transformations, dispositions, version state, and redacted audit metadata. They never
contain customer answers, quote IDs, screenshots, HTML, cookies, tokens, or authenticated browser
state.

The existing App Service remains the authenticated boundary for M.I.A. source access, registry
authorization, publishing, resolution, checkpoints, and redacted telemetry. No Document Intelligence,
AI Search, vector store, database, queue, hosted browser, or additional web application is required.
After the deterministic build is deployed and verified, the SmartMapper Astra deployment and its
runtime configuration/role can be removed. Shared Foundry resources must be evaluated per deployment
because unrelated M.I.A. workloads may use the same account.

## Consequences

Known workflows become fast, explainable, testable and model-independent. Carrier changes require a
new training capture and version. Hidden conditional controls cannot be registered until the trainer
renders their state. Closed shadow roots, inaccessible frames and unsupported custom widgets remain
human exceptions unless a separately reviewed deterministic interaction is added.

The registry data-drives the existing carrier-adapter and shared automation contracts; it does not
create a second executor. The retained remote worker stays a synthetic regression harness. Historical
AI ADRs are superseded rather than deleted so the failed and successful experiments remain reviewable.

## Validation

Contract tests cover strict registry schemas, repeated-entity bindings, transformations, option
crosswalks, immutable version transitions and redacted persistence. Extension tests cover logical
field grouping, stable signatures, linked page overlays, numbering across pages, conditional scenario
capture, draft recovery and every disposition. Production tests cover registry lookup, deterministic
action compilation, provenance, independent failure isolation, changed pages/options, missing source
answers, read-back and guarded Next. Browser tests use synthetic Home and Auto flows with multiple
drivers and vehicles and assert that final controls are never activated. The registry lifecycle E2E
crosses the real training service, registry, active-tab job service, and built content executor to
publish, prove, verify, activate, reuse, continue after a failed field, and enforce the Next/final
stops.
