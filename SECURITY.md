# Security policy

## Scope and reporting

Supported private reporting channel: TBD — Dom. Do not place a vulnerability, secret, client record,
credential, browser state, private URL, or screenshot containing PII in a public issue. Until a private
channel is approved, notify Dom that a confidential report is needed without including sensitive
details.

## Prohibited data

Source control, issues, pull requests, CI output, and default logs must contain no real client PII,
carrier or M.I.A. credentials, tokens, cookies, passwords, browser profiles, storage state, MFA
recovery codes, private certificates, or Azure/OpenAI secrets. Development uses synthetic fixtures.
Secret values belong in an approved manager; configuration contains only secret-name references.

## Carrier and authorization boundary

No contributor may test against a live carrier without explicit task-level approval, carrier/legal
review, and a designated least-privilege test account. SmartMapper must not bypass CAPTCHA, MFA,
anti-bot controls, access controls, carrier restrictions, or terms. It must stop before submission,
binding, purchasing, disclosures, attestations, consumer-report authorization, or signature.

## Incident triage

1. Stop the affected run without destroying evidence needed by the approved incident owner.
2. Revoke or rotate exposed credentials through the secure owner; do not paste replacements in Git.
3. Notify the incident contact through the approved private channel: TBD — Dom.
4. Identify affected tenants, users, jobs, logs, artifacts, and retention systems using redacted IDs.
5. Remove public access and preserve an audit timeline.
6. Validate deletion from working trees, Git history, CI artifacts, caches, releases, and forks as
   applicable.
7. Add regression controls and document the decision without repeating the sensitive value.

If material was committed, deleting the current file is not enough. Coordinate history rewriting,
credential revocation, GitHub cache/support handling, collaborator notification, and fresh-clone
verification with the repository owner. Never perform a destructive history rewrite unilaterally.

## Retention

Screenshots, traces, downloads, videos, storage state, and browser profiles are ignored by default.
Production retention, encryption, deletion verification, incident severity, and response time are
TBD — Dom.
