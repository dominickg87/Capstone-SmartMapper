# M.I.A. SmartMapper

SmartMapper builds on the MIA Chrome extension to fill approved insurance quote-intake forms from
saved MIA quotes. **apps/mia-chrome-extension is the project's only Chrome extension and the basis
for all extension development.** It comes from branch `ChromeExtSave2AMS`, with SmartMap enabled.
The shared automation packages, synthetic mock sites, and remote worker support this work.

> Use synthetic data and approved test environments. The MIA extension can connect to the configured
> MIA portal and request HTTPS site access. Its current limitations are documented in its app README.
> Live carrier authorization, repository privacy, and production data access remain unresolved.

## MIA extension with SmartMap enabled

Run `pnpm build:extension`, then open `chrome://extensions`, enable Developer mode, click
**Load unpacked**, and select **apps/mia-chrome-extension/dist**. Chrome names this package
**MIA SmartMapper (Capstone)**. Set the demo portal URL in Settings and use **SmartMap → Sign into MIA**.

See [the teammate setup guide](apps/mia-chrome-extension/README.md) for quote selection, form filling,
required backend endpoints, and known limitations. Demo credentials work only if the demo backend
supports this extension's API and grants the account access to the saved quotes and mapper.

For development, run `pnpm dev:extension`. It builds the same `dist` folder and rebuilds when runtime
files change. Click **Reload** on the extension's card in Chrome after each rebuild. `pnpm build`
builds the extension and all supporting packages; `pnpm build:mia-extension` remains an alias for
the extension-only build.

## Current status

The MIA extension already has sign-in/token handoff, quote selection, page reading, backend mapping
requests, staged filling, and reusable mapping templates. Browser tests exercise those features with
synthetic responses. The actual demo backend has not been verified.

The next integration work connects this extension to the shared contracts, policy, provenance,
read-back, and resumable job state. The shared core and remote worker have separate regression
coverage against two local mock flows; those results do not establish that the extension already
enforces the same safeguards. See [the prioritized backlog](docs/BACKLOG.md).
Production access, carrier authorization, repository privacy, business rules, and infrastructure
remain product-owner decisions in DOM_NOTES.md.

## Repository map

- apps/mia-chrome-extension — the MIA Chrome extension and SmartMap development base.
- apps/mock-carriers — synthetic modern SPA and classic multi-page quote flows.
- apps/orchestrator-api — typed in-memory prototype job API.
- apps/automation-worker — isolated Playwright remote-executor proof of concept.
- packages/contracts — versioned schemas and shared types.
- packages/automation-core — workflow, policy, confidence, provenance, normalization, and validation.
- packages/carrier-adapters — versioned localhost mock adapter plugins.
- packages/mia-client — provider interface and synthetic in-memory implementation.
- packages/ai-mapper — provider-neutral interface and offline deterministic mock.
- packages/observability — PII- and secret-redacting log helpers.
- fixtures — synthetic inputs and expected outcomes.
- docs — architecture, security, adapter, testing, backlog, and decisions.

## Prerequisites

- Node.js 24 LTS
- Corepack
- pnpm 11, pinned by packageManager
- Chromium installed through Playwright for browser tests
- Git

Docker and GitHub CLI are optional during bootstrap.

## Install

    corepack enable
    corepack prepare pnpm@11.24.0 --activate
    pnpm install --frozen-lockfile
    pnpm exec playwright install chromium

## Supporting mock lab and remote worker

Run each command in a separate PowerShell terminal:

    pnpm dev:mock-carriers
    pnpm dev:api
    pnpm dev:worker -- --flow=modern

Open http://127.0.0.1:4173 for mock flows. These commands exercise the shared-core/worker prototype.
The MIA extension uses the configured MIA backend; the in-memory API is not a replacement for its
quote/mapping endpoints. The MIA extension currently requires HTTPS target pages, so its browser
regression supplies a synthetic local HTTPS form separately.

## Validation

    pnpm format:check
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:e2e

Start with PROJECT_SCOPE.md, then complete DOM_NOTES.md. Architectural detail is in
docs/ARCHITECTURE.md and decisions are in docs/adr.
