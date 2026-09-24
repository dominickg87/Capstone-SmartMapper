# ADR 0007: Run the shared deterministic matcher with existing MIA quote retrieval

- Status: Implemented for testing at the user's explicit request; live response compatibility unverified
- Date: 2026-09-24

## Context

The semantic matcher branch originally wired its algorithm into the synthetic local API only.
Loading the extension still called MIA's existing mapping endpoint, so it did not try the new method.
The user requested trying that method with the existing MIA authentication and quote data APIs.

## Decision

Bundle the existing shared matcher into the existing MIA extension. Keep MIA sign-in, portal settings,
quote search, and detail retrieval. Default the normal SmartMap flow to deterministic matching, with
the existing server method available for comparison under Settings > Advanced mapping. Preserve
explicit saved preferences and identify server comparison mode on the main screen. Never silently substitute another
method or data provider. This extends ADR 0006's deployment: importing shared packages into an executor
does not duplicate the matching algorithm or create another automation core.

`mia-client` translates allowlisted canonical paths and the observed MIA home/auto saved-form paths.
It validates each source field using shared field schemas and preserves the original source path.
It supports partial quotes without manufacturing the missing required fields of a complete canonical
quote. Unknown, conflicting, malformed, or absent fields are review outcomes. It does not assume that
an applicant or additional driver corresponds to a numbered driver on the destination form.

The shared matcher plans versioned actions without values. Shared mapping/action policy approves
them before source resolution and entry. Competing source-field meanings with stronger or near-equal
signals become review items, so dictionary order cannot grant a weaker interpretation control of a
field. Browser-safe policy and value operations are exported from
the same automation-core package used by the remote executor. Node hashing stays in its Node entry.
The inherited browser filler gains a strict execution option for the deterministic path. Native
select choices require one exact normalized option match; existing values are preserved. Each field
is read back, normalized, compared, and hashed with browser Web Crypto. A mismatch pauses the run.

The request is bound to the read tab and document and rechecks field identity/layout before every
entry. It refuses changed pages instead of reusing ordinal field IDs on another page. Results expose
semantic/original source paths, status/reason codes, and hashes. No quote values enter logs or mapping
feedback/training requests in this mode. No automatic submission, consent, or legal action is added.

The panel and worker exchange their bundled build and protocol versions before deterministic page
reads and fills. The worker also validates the fill request version before planning. A stale worker
stops with extension reload instructions. Missing fill responses never trigger automatic retries:
the user must review any entered fields, reload, and read again. Expected planning errors return safe,
specific reason codes and messages without echoing page or quote data.

## Verification and limits

Tests cover the source boundary, policy/prohibited paths, signal ambiguity, native option translation,
date normalization, and real extension execution with intercepted synthetic MIA API responses. Browser
tests assert that the existing quote API is used, no server mapping request is made in deterministic
mode, missing details and changed pages stop filling, read-back mismatch pauses, and submit is untouched.
Existing server-mapping regressions remain in place.
Browser regressions also simulate a missing capability handler, mismatched worker, and missing fill
handler; each must stop visibly without calling the server mapper or clicking submit.

The deployed MIA quote endpoint has not been accessed. Its current implementation was unavailable;
aliases were verified against local MIA form source commit `4ef8583`, not live responses. Full detail
must be returned by the authorized quote endpoint; summary-only responses fail visibly. The dictionary
has limited coverage. Custom widgets and ambiguous repeated records require review. This is a single
page integration, not complete durable job orchestration or full ExtensionExecutor implementation.
After interruption, users must read the page again and review already-entered values. The inherited
server method retains its documented policy/provenance/read-back limitations. Live-carrier use still
requires separate authorization and designated test accounts.
