# SmartMapper contributor instructions

These instructions apply to every human contributor and coding agent in this repository.

## Read before changing behavior

Read PROJECT_SCOPE.md, DOM_NOTES.md, relevant files in docs/adr, and the package or app documentation
before changing architecture. Confirm that any Dom-dependent decision is approved; do not turn a TBD
into an assumption.

## Architectural invariants

- Keep one shared automation core with ExtensionExecutor and RemoteBrowserExecutor adapters.
- Keep carrier adapters independent from execution environments.
- Keep provider-specific AI code behind AiMapperProvider.
- Treat all model output as untrusted and schema validate it before policy evaluation.
- The model may emit only the versioned allowlisted AutomationAction union.
- Resolve semantic source paths to actual values only at the approved target field.
- Preserve source-field provenance for every action and perform normalized post-entry read-back.
- Keep long-running state resumable outside an extension service worker's lifetime.
- Isolate browser sessions and artifacts by tenant, user, carrier, and job.
- Keep remote worker hosting behind an interface.

## Non-negotiable safety

- Never add secrets, credentials, real PII, cookies, browser storage, authenticated profiles, or
  screenshots containing PII.
- Never access a live carrier site without a separately approved task, written authorization, and
  designated test account.
- Never add automatic submit, bind, purchase, attestation, legal-consent, signature, CAPTCHA-solving,
  MFA-bypass, access-control bypass, or anti-bot bypass behavior.
- Never infer a material underwriting fact missing from source data.
- Missing, conflicting, unsupported, high-risk, or low-confidence answers become review items.
- Never broaden extension host permissions beyond approved development origins without review.
- Do not add real carrier names, endpoints, payloads, or internal rules while repository privacy is
  unresolved.
- Default logs must contain semantic field keys, status, reason codes, and hashes—not raw values.

## Repository layout

Applications live under apps, reusable runtime packages under packages, synthetic data under
fixtures, E2E tests under tests/e2e, and cross-cutting decisions under docs/adr. Do not create another
automation core in an app. Do not make an adapter depend on Chrome or Playwright.

## Commands

- pnpm build — build every package and application.
- pnpm lint — run repository ESLint rules.
- pnpm format:check — verify Prettier formatting.
- pnpm typecheck — run strict TypeScript project references.
- pnpm test — run unit and contract tests.
- pnpm test:e2e — run localhost mock-carrier browser tests.
- pnpm dev:mock-carriers — serve the synthetic carrier lab.
- pnpm dev:extension — run the extension development build.
- pnpm dev:api — run the in-memory API.
- pnpm dev:worker -- --flow=modern — run the worker against an already-running mock site.

## Testing expectations

Add or update tests with every behavior change. Policy changes need prohibited-path tests. Adapter
changes need recognition, changed-layout, transformation, repeated-record, and read-back coverage.
UI or executor changes need localhost E2E coverage and an assertion that the final mock submit control
was not clicked. Use only synthetic fixtures.

Before declaring work complete, run formatting, linting, strict type checking, unit tests, builds, and
relevant browser tests. Do not weaken TypeScript, lint, schemas, policies, or assertions to make a
check pass.

## Pull requests and done criteria

Use small branches named feat/..., fix/..., docs/..., or spike/.... Reference an issue, explain the
safety impact, and obtain at least one review. Update documentation and add an ADR for cross-cutting
decisions. Avoid unrelated changes.

Work is done only when behavior and failure paths are tested, provenance and read-back are preserved,
review/stop behavior is explicit, logs remain redacted, documentation is current, all checks pass, and
known limitations are recorded. Direct pushes to main must be disabled after bootstrap.
