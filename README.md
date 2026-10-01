# M.I.A. SmartMapper

Build **0.2.5** uses the selected M.I.A. Home/Auto **PDF quote sheet** as Astra context.
It plans fields across the current page, checks document citations independently, fills in
page order, and reads entries back. Clearly labeled fields use the DOM inventory; targeted
screenshots supply missing visual context. A clean fully verified batch avoids another AI
planning call. The panel opens only for the carrier tab activated with the toolbar icon.
See [ADR 0013](docs/adr/0013-pdf-context-and-tab-panel.md).

SmartMapper is the independent Chrome-extension POC on `Dom-astra-2.0approach`.
M.I.A. integration code lives on `smartmapper2.0` in the sibling `MIA_web_app` repository.
The live `MIA-Chrome-Extension` repository is not modified by this POC.

The extension selects a M.I.A. quote and maps the **current active page**. The Azure backend
uses the selected quote's PDF, together with structured DOM observations and targeted screenshots
of the expanded page. It plans up to
48 independent native fields across sections, checks each source fact in one verification request,
and executes each entry with normalized browser read-back. Page changes invalidate remaining entries
and trigger fresh inspection and repair.

After a clean page review, the local POC automatically uses recognized ordinary Next/Continue.
Uncertain or incomplete pages stop for review and **Resume mapping**. Final submit, Bind, Issue,
Sell, consent, signatures, payment and authentication remain human actions. See ADR 0012.

**Talk to SmartMapper** accepts free-text questions and corrections during a job. Sending pauses
mapping; the reply uses the current page images and PDF. The latest ten exchanges
guide subsequent mapping after Resume, without changing source facts or permanently training the model.
The side panel's **Connection details** provides the IDs needed for setup without developer tools.
Review items offer **Suggest a match** and **Skip this field**. Suggestions explain PDF evidence;
skipping preserves your carrier entry and continues other fields. Required-field checks still apply.

Local development can run M.I.A. through Herd and the mapping backend on loopback while using the
existing Azure model. Development-only memory checkpoints avoid cloud job storage; restarting the
local backend ends those test jobs. See the local testing section in the setup guide.

See [setup and deployment](docs/SMARTMAPPER_V2_SETUP.md), [architecture](docs/ARCHITECTURE.md),
[decision ADR](docs/adr/0005-active-tab-astra-poc.md), and [test strategy](docs/TEST_STRATEGY.md).

## Components

- `apps/extension-prototype`: unpacked MV3 extension, M.I.A. sign-in, quote search and side panel.
- `apps/orchestrator-api`: authenticated v2 jobs, Azure Table checkpoints and managed-identity model calls.
- `packages/contracts`: strict versioned source, observation, action, receipt and job schemas.
- `packages/automation-core`: shared policy, source equivalence checks, DOM observer and browser executor.
- `packages/ai-mapper`: `AiMapperProvider`, Azure Responses implementation and offline legacy mock.
- `packages/mia-client`: verifier-bound grant redemption and short-lived quote-source access.
- `apps/mock-carriers`, `apps/automation-worker`, `packages/carrier-adapters`: synthetic lab and v1 regression harness.

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
pnpm build
pnpm test
pnpm test:e2e
```

The browser tests use isolated synthetic profiles, a scripted model and local API; no Azure model,
real M.I.A. account or carrier account is needed. If Windows hangs stopping the mock-server process,
run `pnpm dev:mock-carriers` in another terminal first, then run the browser tests.

For the old synthetic worker demo, run `pnpm dev:mock-carriers` and then
`pnpm dev:worker -- --flow=modern`. The old local API is available through
`pnpm --filter @smartmapper/orchestrator-api dev:legacy`. It is never the Azure startup entry point.

## Current limits

The PDF source covers M.I.A. Home and Auto quote sheets. Anything omitted from the generated sheet,
blank, N/A, conflicting or ambiguous requires review; the model cannot invent missing facts.
The sheet uses the current document template, so it does not preserve historical question wording.
Embedded frames, closed shadow roots and widgets without observable read-back need human input.
Direct PDF context reduces extraction work, but latency still depends on model planning and verification.
Cloud deployment and authorized carrier acceptance testing are separate from the local checks.
