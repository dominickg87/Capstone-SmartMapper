# Test strategy

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
