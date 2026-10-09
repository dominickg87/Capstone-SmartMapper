# M.I.A. SmartMapper

Build **0.3.0** replaces the model-planned proof of concept with a human-trained, deterministic
mapping registry. Astra, PDF interpretation, mapping chat, model suggestions, prompts, and model
verification are no longer part of the active SmartMapper runtime. The accepted design is recorded
in [ADR 0018](docs/adr/0018-human-trained-deterministic-mapping-registry.md).

SmartMapper remains an independent Chrome-extension POC on `Dom-astra-2.0approach`. Its companion
M.I.A. integration lives on `smartmapper2.0` in the sibling `MIA_web_app` repository. This POC does
not modify the live `MIA-Chrome-Extension` repository.

The current extension is **0.3.9**; the backend is **0.3.8**. Numbered outlines follow their carrier
controls through document and nested scrolling. During ordinary training, **Automatically number new
fields** captures revealed fields and subsequent pages after they settle. Existing fields keep their
numbers and mappings; new fields receive the next numbers. Hiding and reopening a captured section
reuses its saved state. See [ADR 0022](docs/adr/0022-live-training-discovery.md).

**Record carrier workflow** passively
captures visited page states. **Stop recording & annotate** opens a full-tab, autosaving field reference.
Use **Open field reference** for a saved draft or **Continue recording** to collect more states.
Readable captions use an approved static vocabulary; unfamiliar captions retain numbered fallbacks.
New captures include hashed DOM identity hints so changing help text does not automatically lose a
uniquely identified field. Plans now log matched/action/review counts and closed skip reasons.
See [ADR 0021](docs/adr/0021-recorded-carrier-reference.md) for compatibility and recording limits.

Preview page comparison accounts for
privacy-omitted choices on trained human-only fields, preserving saved drafts and field safeguards.
Mapping startup diagnostics distinguish
unavailable selections, changed preview tabs/users and inactive workflows. Each training field card has an
autosaving **Ignore** switch for optional fields. Use **Pause training & test** to try the current
page with a demo quote, then **Resume training** to keep editing the same draft. **Continue training
this mapping** creates an editable copy of a completed version. See [ADR 0020](docs/adr/0020-training-page-previews.md).

Saved drafts and completed mappings can be found from
a reopened carrier tab using fresh M.I.A. training authorization. Original capabilities and jobs stay
bound to their original tab; recovery preserves numbered choices in a new training session. Saved
overlays resolve current DOM targets instead of reusing stale identifiers. See
[ADR 0019](docs/adr/0019-saved-training-recovery.md).

Training captures use one shared operational-field
classification rule at both ends of the API. Unfamiliar labels remain trainable without gaining
permission for fixed values or carrier defaults. Capture errors identify the actual rejection reason
instead of treating every HTTP 409 as a stale draft. The toolbar still opens the panel directly from
the click; opening it does not require a running backend or M.I.A. deployment.

## How it works

The side panel has **Map** and **Train** modes.

In **Train**, a principal on the separate training allowlist:

1. opens a carrier workflow and chooses Home or Auto; SmartMapper binds the registry identity to the
   tenant, active carrier origin, and line of business, uses the origin as the base URL, and generates
   the display label `Home workflow` or `Auto workflow`;
2. captures the current rendered page;
3. matches the large numbered overlays on the carrier page to the identically numbered panel rows;
4. gives every carrier field an explicit disposition: map from M.I.A., keep the carrier default,
   use an approved fixed operational value, require human entry, ignore, or leave blank;
5. manually visits subsequent pages and conditional scenarios and captures each one; and
6. publishes an immutable `testable` version, proves it with a representative mapping job, marks it
   `verified`, then activates it.

The M.I.A. selector shows the original question, section, entity, and stable source path. The Home
catalog includes both supported applicants. The Auto catalog includes every supported source field
for up to five additional drivers and eight vehicles, with wildcard templates for same-position
rules. Matching uses SHA-256 digests of carrier semantics and optional DOM identity hints. A closed
vocabulary of static form captions and choices provides readable reference labels; unrecognized or
potentially personal text stays hashed. Training never stores quote answers, HTML, or screenshots.

In **Map**, SmartMapper retrieves the selected quote's semantic question-and-answer manifest,
resolves the active mapping for the tenant, carrier origin, and line of business, and compiles
allowlisted browser actions. Each entry retains source provenance and must pass normalized browser
read-back. A missing answer, missing mapping, changed control, or failed entry becomes a focused
review item. Successful independent fields remain complete and are never discarded because another
field failed.

After field execution, SmartMapper takes a fresh page observation. Only then, after a clean
whole-page review, may it use a trained ordinary Next/Continue control when automatic navigation is
enabled. Final Submit, Bind, Issue, Sell, payment, authentication, consent, attestation, signatures,
CAPTCHA, and MFA remain human actions.

The side panel opens only for the carrier tab on which the toolbar icon was activated. Jobs and
training capabilities remain bound to that tab and origin. **Train → Find saved training and mappings**
recovers durable drafts or opens a published version for testing on a newly authorized tab.

## Components

- `apps/extension-prototype`: unpacked MV3 extension with Map/Train modes, page overlays, M.I.A.
  sign-in, quote search, deterministic execution, read-back, and review UX.
- `apps/orchestrator-api`: authenticated mapping jobs, training drafts, mapping lifecycle, Azure
  Table persistence, and redacted telemetry.
- `packages/contracts`: strict source, registry, training, action, receipt, and job schemas.
- `packages/automation-core`: shared policy, registry matching, transformations, provenance,
  browser observation, execution, and read-back.
- `packages/mia-client`: verifier-bound quote and training-grant redemption plus semantic source
  access.
- `apps/mock-carriers`, `apps/automation-worker`, and `packages/carrier-adapters`: synthetic lab and
  retained v1 regression harness.

## Build and validate

Use Node 24 and the pinned pnpm version. This checkout also has local tools under `.tools`:

```powershell
$env:PATH = "$PWD\.tools\node-v24.19.0-win-x64;$env:PATH"
$env:COREPACK_HOME = "$PWD\.tools\corepack"
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.tools\playwright"
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Browser tests use synthetic profiles, M.I.A. manifests, and carrier pages. The registry lifecycle E2E
uses the real training, registry, mapping, and content-executor boundaries to publish, prove, verify,
activate, reuse, and exercise failure-safe continuation. These tests do not need an Azure model, real
M.I.A. account, or carrier account. If Windows hangs while stopping the mock server, run
`pnpm dev:mock-carriers` in another terminal before `pnpm test:e2e`.

The retained synthetic worker demo uses `pnpm dev:mock-carriers` followed by
`pnpm dev:worker -- --flow=modern`. The old v1 local API is available through
`pnpm --filter @smartmapper/orchestrator-api dev:legacy`; it is never the Azure startup entry point.

See [setup and deployment](docs/SMARTMAPPER_V2_SETUP.md),
[architecture](docs/ARCHITECTURE.md), [data contracts](docs/DATA_CONTRACT.md), and
[test strategy](docs/TEST_STRATEGY.md).

## Current limits

Home and Auto are the initial trained lines of business. A carrier workflow works only after a
verified registry version is active for its exact scope. Carrier redesigns, new options, and unseen
conditional branches require another training version. Closed shadow roots, inaccessible frames,
and unsupported custom widgets remain human exceptions. Training cannot create arbitrary scripts or
infer customer or underwriting facts that M.I.A. did not collect.

Local and synthetic tests do not establish acceptance on a live carrier. Carrier authorization,
designated test access, and supervised acceptance testing remain separate deployment requirements.
