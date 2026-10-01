# ADR 0007: Local M.I.A. and mapping backend for POC testing

- Status: Accepted from Dom's request to test locally, October 1, 2026.
- Extends ADRs 0005 and 0006; deployed POC behavior remains unchanged.

Use the existing Herd agency `https://admin.mia.test` and its local SQLite data for development.
Run the same mapping backend on loopback so it can reach Herd directly. An Azure-hosted backend
cannot call the developer's local `.test` origin without additional networking; no tunnel is needed
when both applications run locally. The model remains the existing US Azure deployment, authenticated
using the developer's Azure sign-in. The POC extension selects explicit local origins at build time.

`SMARTMAPPER_CHECKPOINT_STORE=memory` selects the existing checkpoint interface's in-memory adapter
only when `NODE_ENV=development`. Development mode binds the HTTP server to `127.0.0.1`. Production
defaults to Azure Table storage and rejects memory checkpoints. Both modes use the same job service,
action policy, provider, source authorization, chat, provenance and read-back implementation.

Local checkpoints survive extension service-worker and panel restarts, but disappear when the backend
process restarts. This is a documented development limitation, not a replacement for durable Azure
jobs. Local M.I.A. keeps its normal database; only its new authorization table is added. Default
logs remain redacted. Herd's public CA is trusted explicitly without disabling TLS verification.

All new M.I.A. routes have an early feature-and-tenant gate. Disabled or unlisted tenants cannot query
the new grant table, including before their databases have been migrated. Existing user/quote and
token authorization remains in the controller. Tests cover every v2 route with the grant table absent
and verify that the existing extension profile endpoint remains available.
