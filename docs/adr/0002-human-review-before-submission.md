# ADR 0002: Human review before submission

- Status: Accepted for capstone
- Date: 2026-08-27

## Context

Carrier quotes include underwriting decisions, legal disclosures, consumer-report authorization,
attestation, signature, purchase, and binding. Incorrect or unauthorized automation has material risk.

## Decision

Automation always stops before final submission or any legal/transactional action. Missing,
conflicting, unsupported, ambiguous, high-risk, and low-confidence required items go to human review.
The user performs final carrier actions manually.

## Rationale

This preserves human authority, prevents silent assumptions, and defines a measurable safety boundary.

## Alternatives

- Automatic submission after high confidence: rejected because confidence does not grant authority.
- Per-carrier opt-in submission during capstone: rejected because legal/security scope is unresolved.
- Review only on errors: rejected because a correct mapping can still precede an unauthorized action.

## Consequences

Completion means ready_for_review, not carrier submission. UIs and notifications must make ownership
clear. Tests must prove the mock submit control is never clicked.
