# Security and privacy design

## Threats and controls

The table describes required shared-core controls. The MIA extension is the active product base;
its inherited filler has not yet been integrated with all of these controls. Track those gaps using
the [extension guide](../apps/mia-chrome-extension/README.md) and [backlog](BACKLOG.md).

| Threat                      | Primary controls                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Wrong-field entry           | Versioned adapter, semantic evidence, confidence/risk gate, read-back comparison        |
| Missing fact invented       | Semantic source path required, no AI value generation, blocking review                  |
| Model prompt injection      | Structured sanitized input, untrusted output, strict schema/policy, origin gate         |
| Prohibited final action     | No action variant, target-intent policy, final-page stop, E2E never-click assertion     |
| Cross-tenant/session access | Tenant/user/carrier/job isolation and authorization; short-lived handoff                |
| Credential/PII leakage      | No real data in repo, secret references, redacted logs, ignored/expiring artifacts      |
| Malicious carrier DOM       | Treat page as hostile, no page instruction authority, constrained locators/actions      |
| Stale page/adapter          | Fingerprint/version validation and fail-closed page_changed                             |
| Extension compromise        | Review inherited MIA/AMS and optional HTTPS permissions; minimize token scope/retention |
| Worker compromise           | Ephemeral context, least network/access, managed identity, cleanup and revocation       |

## Data minimization

The target AI boundary receives semantic field metadata, not values, when deciding location.
The current MIA extension sends page context to its backend and receives assignments with values;
the backend's provider handling is unverified. Its token currently persists in Chrome local
extension storage. Review and integrate these paths before claiming the target minimization policy.
Shared-core jobs/queues carry references.
Logs record job/action IDs, field keys, state, reason codes, counts, and hashes. Screenshots and traces
are off by default, ignored locally, and uploaded in CI only on failure with synthetic pages.

Production classification, encryption, retention, deletion verification, support access, and incident
SLAs are TBD — Dom. Students receive no production PII unless an explicit approved plan changes that
default.

## Secrets

Use an approved vault and managed identity or equivalent short-lived mechanism. Environment examples
contain secret-name references only. Never put credentials, tokens, cookies, storage state, profiles,
private certificates, or MFA recovery material in Git, issues, CI variables exposed to untrusted code,
logs, screenshots, or fixtures.

## Authorization and carrier compliance

M.I.A. leadership and applicable legal/compliance owners must approve automation. Each carrier's
agreements, restrictions, contacts, sandbox, test accounts, MFA/CAPTCHA behavior, network rules, and
allowed actions must be assessed. No bypass attempts are permitted. The user performs final legal and
transactional actions.

## Artifact lifecycle

Contexts are isolated and closed. Local auth state, profiles, downloads, screenshots, traces, videos,
test output, and databases are ignored. Future approved artifacts must be encrypted, tenant/job
scoped, access logged, time limited, revocable, and deletion verified. Error logs must not contain page
HTML or raw payloads by default.
