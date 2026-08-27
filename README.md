# M.I.A. SmartMapper

SmartMapper is a safety-first capstone prototype for mapping normalized M.I.A. quote data into
approved insurance quote-intake workflows. The primary path is a localhost-only Chrome extension
prototype; a remote Playwright worker is an early feasibility proof of concept. Both use the same
contracts, automation policy, and versioned mock carrier adapters.

> Safety warning: this bootstrap connects to no live M.I.A. endpoint and no real carrier. It uses
> synthetic fixtures only. It must never submit, bind, purchase, sign, attest, accept legal terms,
> solve CAPTCHA, bypass MFA, or silently invent an underwriting answer.

## Current status

The repository is a compilable foundation, not production carrier automation. Two materially
different local mock flows exercise deterministic mapping, review escalation, read-back validation,
resumable state, layout change, and a mandatory stop before a clearly marked mock submit control.
Production access, carrier authorization, repository privacy, business rules, and infrastructure
remain product-owner decisions in DOM_NOTES.md.

## Repository map

- apps/extension-prototype — Manifest V3 localhost UI and resumable run-state boundary.
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

## Local mock demo

Run each command in a separate PowerShell terminal:

    pnpm dev:mock-carriers
    pnpm dev:extension
    pnpm dev:api
    pnpm dev:worker -- --flow=modern

Open http://127.0.0.1:4173 for mock flows. Load apps/extension-prototype/dist as an unpacked
extension only after running pnpm build.

## Validation

    pnpm format:check
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:e2e

Start with PROJECT_SCOPE.md, then complete DOM_NOTES.md. Architectural detail is in
docs/ARCHITECTURE.md and decisions are in docs/adr.
