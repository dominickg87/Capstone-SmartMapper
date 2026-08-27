# ADR 0004: PII minimization

- Status: Accepted for capstone
- Date: 2026-08-27

## Context

Quote data is sensitive. Mapping often needs field meaning but not the applicant's actual value.
Remote providers, logs, queues, screenshots, and student environments increase exposure.

## Decision

Use semantic field identifiers and schema metadata through mapping. Resolve actual values only at the
approved target. Queue/jobs/notifications carry references. Default logs contain field keys, status,
reason codes, counts, and hashes. Development uses synthetic data; screenshots/traces are optional,
ignored, redacted/ephemeral, and subject to approval.

## Rationale

Minimization reduces breach impact and unnecessary processing while retaining mapping capability and
auditability.

## Alternatives

- Send full payloads to every component: rejected as unnecessary exposure.
- Log values for debugging: rejected; use synthetic reproduction and hashes.
- Store browser profiles for convenience: rejected by default; persistent sessions require an
  approved encrypted design.

## Consequences

Debugging requires semantic snapshots and synthetic fixtures. Production integrations need explicit
classification, retention, deletion, and access decisions. Some vision use cases may be deferred.
