# Security and privacy design

## Active-tab v2 data flow

ADR 0005 supersedes the v1 metadata-only AI input and remote-worker assumptions below. V2 sends
the selected quote's Q&A and an active-tab screenshot to the configured US Data Zone deployment,
using Responses with `store:false`. Both remain in request memory. Ordinary logs and telemetry
contain status/counts; durable checkpoints contain hashes, scope IDs, bounded provenance and a
one-hour M.I.A. source capability. Storage RBAC protects that capability as a credential.

M.I.A.'s long-lived extension token stays in trusted extension session storage. Quote grants are
one-use, verifier-bound and expire after two minutes. Sources recheck ownership, revocation,
subscription and demo allowlists. Job bearer credentials bind tenant/user/quote/carrier/tab and
expire within one hour. Exact origins are allowlisted; redirects carrying credentials are rejected.
CORS rejects unapproved supplied origins; job authentication is still required when Chrome omits
the Origin header on a GET. CORS is not the authorization boundary.

Schema validation precedes policy. Page text/model output cannot grant authority. A second model
call checks fact preservation but is fallible: deterministic source binding, identity checks,
native-control constraints, DOM checks, receipt hashes and human review remain necessary.
No final transaction, navigation, consent, authentication or Enter-key action is available.

ADR 0006 adds human conversation as fallible mapping guidance, never as authority to change source
facts or bypass policy. Chat replies cannot contain executable actions. The latest ten exchanges
are stored in trusted Chrome session memory with the job and may contain user-entered/source values;
they are not a redacted audit log. They are sent to the model with `store:false` and excluded from
Azure checkpoints and default telemetry. Clearing chat, cancellation or ending the browser session
removes them; expired jobs are cleared when detected. Chat does not permanently train the model.

The extension stops on tab/origin/DOM changes. It requests only configured hosts and activeTab;
it does not require browser-wide host permissions. The POC is disabled for unconfigured accounts.
Tests use synthetic profiles, screenshots and data. The existing M.I.A. connection flow revokes
older tokens for the same account when it issues a new extension connection.

Expiry denies access immediately. Physical Azure deletion runs every five minutes while the app
is running; M.I.A. prunes expired grant metadata on later grant issuance in that tenant. Review the
operational retention limitations in `SMARTMAPPER_V2_SETUP.md` before production integration.

## Threats and controls

| Threat                      | Primary controls                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Wrong-field entry           | Versioned adapter, semantic evidence, confidence/risk gate, read-back comparison    |
| Missing fact invented       | Semantic source path required, no AI value generation, blocking review              |
| Model prompt injection      | Structured sanitized input, untrusted output, strict schema/policy, origin gate     |
| Prohibited final action     | No action variant, target-intent policy, final-page stop, E2E never-click assertion |
| Cross-tenant/session access | Tenant/user/carrier/job isolation and authorization; short-lived handoff            |
| Credential/PII leakage      | No real data in repo, secret references, redacted logs, ignored/expiring artifacts  |
| Malicious carrier DOM       | Treat page as hostile, no page instruction authority, constrained locators/actions  |
| Stale page/adapter          | Fingerprint/version validation and fail-closed page_changed                         |
| Extension compromise        | Minimal localhost hosts in bootstrap, no long-lived payload/secret storage          |
| Worker compromise           | Ephemeral context, least network/access, managed identity, cleanup and revocation   |

## Data minimization

AI sees semantic field metadata, not values, when deciding location. Jobs/queues carry references.
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
