# Security and privacy design

## Active deterministic-registry data flow

[ADR 0018](adr/0018-human-trained-deterministic-mapping-registry.md) supersedes the model-assisted
runtime described by historical ADRs 0005, 0006, and 0009 through 0017. Build 0.3.0 sends no quote
data, carrier screenshot, prompt, or user feedback to an AI service. SmartMapper needs no Azure model
role or model credential.

Two separately authorized flows share the backend boundary.

### Training

The trainer's long-lived M.I.A. extension token stays in trusted extension session storage. Catalog
and grant calls require the separate `smart-map:training` ability, an enabled tenant, an active
subscription, and an exact tenant/user entry in the training-principal allowlist. The ordinary
mapping-principal allowlist does not grant training or publishing access. A quote-less training grant
is one-use, verifier-bound, tied to carrier origin, active tab, Home/Auto line, and expiry. The
backend redeems it directly with M.I.A.; the extension cannot self-assert trainer identity.

M.I.A. returns a value-free field catalog with reviewed questions, source paths/patterns, types,
conditions, choices, repeat limits, and schema revision. It does not include a quote ID or customer
answers. Raw carrier semantics exist ephemerally in the content script while it observes the active
tab and derives safe hints; numbered overlays beside the live DOM preserve trainer usability. Every
persisted carrier-derived label, section, context item, choice-group string, and option value/label
is a prefixed SHA-256 digest. Current values, checked state, validation text, page HTML, screenshots,
cookies, and browser storage are excluded from saved drafts and published mappings.

Eight-hour draft credentials bind tenant, trainer, carrier origin, tab, line of business, and expiry. Drafts use
monotonic revisions and Table ETags. Publishing requires every eligible field to have an explicit
schema-validated disposition. A representative deterministic job must prove the exact immutable
version before activation. Activating a new version supersedes the prior active version without
mutating its audit record.

The registry identity is exactly tenant, carrier origin, and Home/Auto line of business. The service
sets the carrier base URL to the origin and generates `Home workflow` or `Auto workflow` for display.
Trainer-supplied workflow names and state/product/program variants cannot create another scope.

### Mapping

Quote grants are one-use, verifier-bound, and expire after two minutes. M.I.A. rechecks quote
ownership, token revocation, subscription, principal, carrier origin, and tab. The redeemed source
capability and job credential bind tenant, user, quote, carrier, tab, and expiry. The source manifest
contains original questions and typed answers so a database value is never detached from its
meaning.

The backend resolves a verified active profile and compiles only the allowlisted action union.
Semantic source paths resolve to actual values only at the approved target. Browser execution
relocates the current target, applies the action, reads the rendered value back, normalizes it, and
returns a hash-bearing receipt. A missing/failed field creates a focused review while successful
independent receipts remain durable.

Exact M.I.A. and backend origins are allowlisted. Dom's supervised POC may accept any canonical HTTPS
carrier origin, but only after the user clicks the toolbar icon and Chrome grants temporary
`activeTab` access. The chosen origin is then bound into the M.I.A. grant, backend capability, tab and
mapping workflow. SmartMapper does not receive browser-wide carrier host permission. CORS rejects
unapproved extension/service origins; verifier-bound bearer authorization remains the security
boundary.

## Mapping-registry controls

Registry records are data, not executable code. Schemas allow semantic target locators, source
patterns, six explicit dispositions, bounded option crosswalks, and typed transformations. They do
not allow JavaScript, arbitrary selectors that execute code, arbitrary formulas, arbitrary URLs, or
free-form navigation.

Persistent identity excludes coordinates, current values, quote IDs, generated element IDs, and DOM
node identity. Runtime page and target signatures match live carrier semantics against the persisted
digests. Carrier-supplied text cannot change policy or grant authority. Unknown or changed pages,
controls, options, or required state fail closed.

`fixed_value` and `carrier_default` are limited server-side to recognized agency/carrier operational
targets. A fixed value also requires the matching operational classification and the closed reason
`approved_agency_identifier` or `approved_carrier_identifier`; there is no free-form rationale.
Neither can replace a missing customer or underwriting fact.
`leave_blank` applies only to an intentional optional blank; it cannot satisfy a carrier-required
field. `ignore` marks a non-data/not-applicable control and cannot hide a prohibited action.

Ordinary Next/Continue is a separately trained workflow control. After field receipts, the extension
takes a fresh page observation and sends it to the backend; only that refreshed state can pass the
clean whole-page navigation gate. Final Submit, Bind, Issue, Sell, purchase, payment, consent,
attestation, signature, CAPTCHA, MFA, authentication, access-control changes, and anti-bot bypass have
no approved action variant.

## Threats and controls

| Threat                         | Primary controls                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Wrong-field entry              | Verified immutable mapping, stable page/target signatures, source provenance, normalized read-back                         |
| Cross-person/vehicle entry     | Explicit fixed/same-position repeat binding, entity limits, representative max-repeat tests                                |
| Missing fact invented          | Answered source path required; fixed-value classification; no inference/model fallback; focused review                     |
| Malicious or mistaken training | Separate training ability and principal, strict dispositions/transforms, testable/verified/active gates, version audit     |
| Stale carrier mapping          | Route/page/control/option signatures, catalog revision, smallest-scope changed-target review                               |
| Prohibited final action        | No action variant, target-intent policy, clean-page navigation gate, E2E never-click assertion                             |
| Cross-tenant/session access    | Tenant/user/quote or training binding, origin/tab scope, one-use grants, expiry, token hashes                              |
| Credential or PII leakage      | Managed identity, no storage keys in extension, digest-only carrier semantics, redacted logs, no customer data in registry |
| Malicious carrier DOM          | DOM treated as hostile input, schema limits, no page instruction authority, constrained executor                           |
| Replay or concurrent overwrite | Verifier challenge, one-use grant, monotonic revision, ETag conditional writes, idempotent receipts                        |
| Extension compromise           | Exact service origins, temporary activeTab, trusted session storage, short-lived capabilities                              |
| Storage compromise             | Azure RBAC, tenant-scoped partitions, hashed bearer credentials, minimized persisted payloads                              |

## Data minimization and retention

`SmartMapperJobs` contains expiring job checkpoints and training drafts. Checkpoints retain scope,
mapping ID/version, counters, hashes, reason codes, bounded provenance, and short-lived capability
hashes. Raw source/entered/read-back values, page HTML, and screenshots are not durable fields.

The provisioned `SmartMapperMappings` table contains persistent digested carrier signatures, M.I.A.
source patterns, typed transforms, option crosswalks, dispositions, lifecycle state, and redacted
audit metadata. It never contains raw carrier semantic text, customer answers, quote IDs, cookies,
tokens, screenshots, or authenticated browser state. Published versions persist until an approved
archive/deletion policy removes them.

Application Insights receives status counts, stage duration, reason codes, and redacted hashes. The
application does not enable automatic request bodies, console capture, dependency payloads, or live
metrics. Support diagnostics must not add labels or values that reveal PII.

One-use M.I.A. grants expire in two minutes. Quote-source and mapping-job capabilities expire within
one hour; a redeemed training session expires after eight hours. Expiry denies access immediately.
Physical checkpoint cleanup runs periodically while the API is available; M.I.A. prunes expired
grant metadata through its application lifecycle. Operational retention, deletion verification, and
audit-access policy require approval before production use.

## Secrets

The App Service system identity accesses Azure Tables. No storage key, Azure OpenAI key, carrier
credential, or browser profile belongs in the extension or repository. Environment examples contain
identifiers and empty secret placeholders only.

Never put credentials, bearer tokens, cookies, browser storage, authenticated profiles, private
certificates, MFA recovery material, customer values, or live-carrier screenshots in Git, issues,
test fixtures, logs, or unprotected CI artifacts. Rotate/revoke a capability if it appears in output.

## Authorization and carrier compliance

M.I.A. leadership and applicable legal/compliance owners must approve automation. Each carrier's
agreements, restrictions, contacts, sandbox/test account, MFA/CAPTCHA behavior, network rules, and
allowed actions require written review. No bypass behavior is permitted. The user performs final
legal and transactional actions.

Live carrier access requires a separately approved task and designated test account. Unit and browser
tests use synthetic M.I.A. manifests, carrier pages, profiles, and artifacts.

## Artifact lifecycle

The active extension runtime does not persist screenshots or HTML. Local profiles, downloads, traces,
videos, test output, and databases remain ignored and synthetic. Future approved artifacts must be
encrypted, tenant/user/carrier/job scoped, access logged, time limited, revocable, and deletion
verified. The retained remote-worker harness must close every isolated browser context after success
or failure and remains outside the active cloud deployment.
