# ADR 0001: Shared core with two executors

- Status: Accepted for capstone
- Date: 2026-08-27

## Context

Local active-tab and remote-browser modes manipulate different browser surfaces but require identical
mapping, policy, provenance, validation, review, and state semantics. Separate systems would duplicate
carrier knowledge and drift.

## Decision

Maintain one automation core and versioned carrier adapter contract. Implement ExtensionExecutor and
RemoteBrowserExecutor behind a browser-neutral Executor interface. Keep Chrome and Playwright types
outside core and adapter packages.

## Rationale

Shared policy and adapters reduce maintenance, allow common tests/metrics, and prevent remote mode from
weakening local safety.

## Alternatives

- Two independent automators: rejected because rules and safety would diverge.
- Playwright as the universal core abstraction: rejected because the extension cannot depend on it.
- Extension-only: not selected because a bounded remote feasibility spike is a capstone deliverable.

## Consequences

Executors must translate a narrow action language. Some environment-specific features require adapter
capability checks, not core coupling. Cross-executor contract tests are mandatory.
