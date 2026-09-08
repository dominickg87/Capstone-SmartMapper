# Test strategy

## Test pyramid

Unit tests cover schemas, action policy, confidence gates, transitions, source paths, transforms,
normalization/read-back, redaction, provider errors, adapter recognition, and API repositories.
Integration tests connect synthetic provider, core, adapter, and executor boundaries. Playwright E2E
tests load the MIA extension with synthetic API responses and exercise the supporting worker against
two mock sites in isolated contexts.

## Current extension coverage

`tests/e2e/mia-extension.e2e.spec.ts` loads the built MIA extension and checks that SmartMap is enabled,
its connection page hands off a synthetic token, quote search/selection works, a mapped field is
filled, low-confidence data is skipped, and mapping templates can be saved. It also checks mapper
failure, expired sign-in cleanup, and that the synthetic final-submit control is never clicked.
External DNS is disabled and responses come from test routing; the local form permission is added
only to the disposable test copy of the manifest.

The worker's tests exercise the shared core separately. Their provenance, read-back, and recovery
coverage must also be added at the MIA extension boundary as that integration is implemented.

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

pnpm test runs unit/contract tests. Build first with pnpm build; pnpm test:e2e then starts the mock site
and runs the MIA extension and worker regressions. The browser CI job builds the extension and shared packages before
running these tests. The extension's development watcher also has a rebuild/recovery regression.
pnpm format:check, pnpm lint, pnpm typecheck, and pnpm build are independent required checks. CI uses a
locked install and no live credentials/traffic. Failure artifacts have three-day retention and must
remain synthetic.
