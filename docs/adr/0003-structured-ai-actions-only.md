# ADR 0003: Structured AI actions only

- Status: Accepted for capstone
- Date: 2026-08-27

## Context

Semantic ambiguity may benefit from model reasoning, but page content and model output are untrusted.
Arbitrary generated code or browser commands would bypass deterministic authorization.

## Decision

AI providers return only versioned schema-validated mapping proposals and allowlisted action shapes.
The executor, never the model, performs actions after policy/confidence/origin checks. There is no
arbitrary JavaScript, navigation, submit, consent, signature, CAPTCHA, or MFA-bypass action.

## Rationale

A narrow language makes authorization reviewable, testable, auditable, and provider neutral.

## Alternatives

- Let the model drive Playwright directly: rejected as unbounded and hard to validate.
- No AI ever: retained as a supported operating mode, but not the only future fallback.
- Provider-specific tool calls in adapters: rejected because it couples policy and vendor.

## Consequences

New action types require security review and executor implementation. Model output may be discarded or
escalated frequently. Deterministic/mock development remains fully functional without an API key.
