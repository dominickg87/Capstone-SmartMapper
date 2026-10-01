# Test strategy

## Active-tab v2 checks

Build before running tests so injected workspace packages and the unpacked extension are current.
V2 unit tests cover strict action policy, prohibited paths, provenance, identity transformations,
tab/origin binding, source revocation/change, ETag conflicts, pause during inference, receipt
idempotency, independent equivalence rejection, HTTP authorization and Azure request options.
Chat checks cover paused-state/revision requirements, source revocation and scope, invalid roles,
strict replies without actions, cancellation during inference, checkpoint redaction, forwarding
guidance on Resume, and rejection of forbidden actions or invented facts despite human chat.

The unpacked-extension browser tests use Chromium's extension action to grant actual activeTab
permission, capture a screenshot, run a scripted model through the real local service, enter and
read back fields, stop at a page boundary, and resume after manual navigation. Separate executor
checks cover native options, unverified custom options, stale DOM/human edits and Issue-policy
blocks. Every test asserts that the final synthetic submit control was not activated.
The side-panel test also checks visible connection IDs, free-text chat with a viewport screenshot,
conversation survival after panel reload, clearing guidance, and sending a message while a mapping
proposal is in flight. The interrupted proposal must never enter the field.

In the MIA web app, run `php artisan test --compact tests/Feature/SmartMapperV2Test.php tests/Feature/ExtensionApiTest.php`.
Those tests exercise original wording/context, false/zero/repeated records, unavailable metadata,
quote ownership, demo scope, grant verifier/replay/expiry, cancellation and token revocation.
Cloud RBAC, Azure Table persistence, live model behavior and real carrier acceptance remain separate
deployment checks; local passing tests do not claim those integrations were exercised.

## Test pyramid

Unit tests cover schemas, action policy, confidence gates, transitions, source paths, transforms,
normalization/read-back, redaction, provider errors, adapter recognition, and API repositories.
Integration tests connect synthetic provider, core, adapter, and executor boundaries. Playwright E2E
tests exercise two mock sites in isolated contexts.

## Required behavior paths

- Happy path for modern SPA and classic navigation.
- Missing required source pauses before unsafe navigation.
- Changed layout remains recognizable through aliases where approved.
- Deliberate ambiguity creates a blocking or nonblocking review item as specified.
- Conditional controls and multiple rows do not shift values.
- Async loading, modal interruption, and validation errors are observable.
- Read-back mismatch creates review.
- Unsupported domain/action/version fails closed.
- Authentication and legal/final language stop execution.
- Mock final-submit data-clicked remains false.
- Browser context closes after success or failure.

## Acceptance measurement

Maintain a frozen synthetic fixture set and versioned supported-field matrix. For each run record
declared supported fields, population count, correct target count, review-required conditions found,
executed audit events, read-back matches, elapsed automation time, and human wait time separately.

Population coverage = populated supported fields / declared supported fields.
Mapping precision = correctly targeted automatically entered fields / all automatically entered
fields. Review recall = surfaced required review conditions / known review conditions. A severe wrong
underwriting answer or prohibited action fails acceptance regardless of aggregate score.

## Real-site gate

Real carrier tests require private repository, approved carrier/leadership/legal use, approved
sandbox/test account, least privilege, network scope, synthetic/test data, artifact policy, and a
specific approved task. Do not turn a browser test toward a live domain by changing a URL.

## Commands and CI

pnpm test runs unit/contract tests. pnpm test:e2e starts the mock site and Chromium tests.
pnpm format:check, pnpm lint, pnpm typecheck, and pnpm build are independent required checks. CI uses a
locked install and no live credentials/traffic. Failure artifacts have three-day retention and must
remain synthetic.
