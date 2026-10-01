# Data contract

## Active-tab v2

`packages/contracts/src/smartmapper.ts` is the current POC wire contract. All objects reject unknown
keys. Source answers carry stable answer/question IDs, source paths, original question text, section,
entity, context, choices, status and value. Unavailable question metadata is reported separately.

Observations contain an ephemeral screenshot, visible control metadata/values, a document ID,
route hash, DOM fingerprint and capture time. Uninspected/truncated content prevents a clean completion.
Actions bind to one observation and element ID, with source IDs, confidence and transformation.
They can fill/select/check, narrowly click, close a widget with Escape, scroll or wait. Other key
variants in the schema remain policy-blocked. Next/Continue and final transactions have no approved action.

Receipts report status/reason and a normalized observed-value hash. Server-issued batches and
revision numbers make replay and concurrent responses detectable. Persisted provenance retains
source IDs/revision, target key, transformation kind/explanation hash, expected/read-back hashes
and outcome; no raw source or target value is written to job storage.

`POST /v2/jobs/:id/chat` requires the job bearer token, a paused job, its current revision, a fresh
bound screenshot/observation, and an alternating user/assistant conversation ending in a user message.
Roles are limited to `user` and `assistant`, with at most 20 messages and 4,000 characters per message.
The strict reply contains only `version: "2.0"` and `reply`; no browser action is accepted through chat.
Chat advances the revision while remaining paused and rejects replies superseded by pause/cancel/resume.
Source authorization, ownership and revision are rechecked before discussion. Observe requests can
include the bounded conversation as fallible guidance; action authorization is unchanged. Chat text
is kept only in the extension's in-memory job session, not in server checkpoints. See ADR 0006.

Mapping memory (proposed ADR 0007, `packages/contracts/src/mapping-memory.ts`) adds a position-
independent `signature` to each page control, `origin` (`model` or `memory`) to action batches, and
`remembered`/`candidates` to the job view. `POST /v2/jobs/:id/mappings` takes the current revision,
the candidate IDs the human approved and memory-filled batch IDs the human corrected. It is refused
while planning or executing. Saved `LearnedMapping` rows contain the signature, question IDs, action
type, an allowlisted recipe, value digests for option/check choices, and counters, with no answer
values, labels or option text.

The following v1 contract is retained only for the synthetic worker/adapters and their regressions.

The canonical version is 1.0 and is implemented with strict Zod schemas in packages/contracts.
Unknown keys are rejected at external boundaries. Contract changes require compatibility tests and,
when cross-cutting, an ADR.

## MiaQuotePayload

The normalized payload contains version, applicant/address, drivers, vehicles, properties, optional
priorInsurance, requestedCoverage, and metadata. Metadata identifies only a synthetic/reference quote,
tenant reference, source-system contract, retrieval time, and schema version. Production payload shape
and field definitions are TBD — Dom; the bootstrap does not invent endpoints or authentication.

Values may be absent only where the schema permits. Absence is not permission to default. A required
target with no approved source becomes a review item.

## Browser semantics

CarrierPageSnapshot contains URL, title, headings, accessible controls, labels, options, validation
messages, iframe metadata, capture time, and optional approved screenshot reference. It intentionally
does not contain current client values. PageFingerprint ties a recognized page to adapter ID/version,
page ID, matched signals, and deterministic hash.

## Mapping and actions

FieldMappingCandidate ties a semantic source path to stable target hints with evidence, confidence,
risk, and review requirement. AutomationAction is a discriminated union limited to fillText,
selectOption, setRadio, setCheckbox, clickContinue, waitForPage, requestHumanInput,
pauseForAuthentication, and stop.

There is no arbitrary script, arbitrary navigation, submit, bind, purchase, terms acceptance,
attestation, signature, CAPTCHA solving, or MFA bypass action. Adding an action requires a security
review, schema/policy tests, ADR, executor support, and product approval.

AutomationActionResult records status/reason, provenance, a normalized observed hash, read-back match,
and time. It must not store raw values. ReviewItem records reason, risk, blocking status, and semantic
field path. AuditEvent records actor, reason, source key, and safe hash.

## Jobs

QuoteJob contains version, tenant/user/quote references, adapter/version, execution mode, state,
current page, review items, and timestamps. States are created, queued, provisioning,
waiting_for_login, running, waiting_for_user, ready_for_review, completed, failed, cancelled, and
expired. State transitions are enforced by automation-core.

## Provenance rule

Every action must name a source path or be a workflow control justified by an explicit adapter rule.
Transformations are named deterministic functions. Read-back normalization is field-specific. An
adapter may not embed a client value in its mapping.
