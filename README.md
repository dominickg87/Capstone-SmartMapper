# M.I.A. SmartMapper

SmartMapper is the independent Chrome-extension POC on `Dom-astra-2.0approach`.
M.I.A. integration code lives on `smartmapper2.0` in the sibling `MIA_web_app` repository.
The live `MIA-Chrome-Extension` repository is not modified by this POC.

The extension selects a M.I.A. quote and maps the **current active page**. The Azure backend
uses the original question wording, section, entity, answer options and saved answers, together
with a screenshot and structured DOM observation. It proposes one action at a time, independently
checks that the source fact is preserved, and requires normalized browser read-back.

When the page is complete or needs help, the human reviews it, navigates, and presses **Resume mapping**.
Submit, Bind, Issue, Sell, consent, signatures, payment and authentication remain human actions.

**Talk to SmartMapper** accepts free-text questions and corrections during a job. Sending pauses
mapping; the reply uses the current viewport screenshot and source Q&A. The latest ten exchanges
guide subsequent mapping after Resume, without changing source facts or permanently training the model.
The side panel's **Connection details** provides the IDs needed for setup without developer tools.

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

The initial M.I.A. catalog covers extractable Auto and Home form questions. Unsupported form types,
unresolved conditional questions and unrecognized fields require review. The catalog is checked
against the current form source; it is not a historical record of wording shown when an older quote
was created. Embedded frames, closed shadow roots and widgets without observable read-back need human input.
Cloud deployment and authorized carrier acceptance testing are separate from the local checks.
