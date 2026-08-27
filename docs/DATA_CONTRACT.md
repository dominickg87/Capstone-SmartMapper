# Data contract

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
