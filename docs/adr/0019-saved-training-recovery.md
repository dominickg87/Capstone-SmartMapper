# ADR 0019: Recover saved training through fresh authorization

- Status: Implementation clarification of ADR 0018, October 7, 2026, build 0.3.3.

## Context

Dom closed the tab used to train a carrier and reopened the site to test prefill. The panel read the
saved draft but attempted to restore overlays with its old tab binding before displaying metadata.
That failure displayed an empty training form and hid the saved mapping. Reloading an extension also
clears its session storage, so recovery cannot depend on retaining a browser-local capability.

## Decision

The training view restores metadata independently of browser overlays. An authorized trainer can
choose **Find saved training and mappings** in the currently activated carrier tab. The extension
requests a fresh M.I.A. training grant through the existing catalog/grant flow. The backend lists
value-free drafts for that exact tenant, user, carrier origin and Home/Auto scope, plus published
mapping versions in the existing tenant/carrier/line-of-business registry scope. It returns views
only, never stored capability hashes, tokens, source answers or browser values.

Selecting a draft copies its numbered fields, dispositions and workflow controls into the fresh,
empty training session. Its fresh tab binding, token, expiry, catalog and ID remain in effect. The
original record and all existing job bindings remain unchanged. Recovery rejects stale target
revisions, nonempty targets, different owners/origins/lines of business and changed catalog revisions.
An expired original capability cannot authorize any operation. Fresh authorization can recover its
durable metadata while it exists; expiry is a capability limit, not a training retention deadline.

Selecting a published version opens the exact immutable mapping in the fresh session for explicit
testing or activation of an already verified version. Opening a testable mapping does not activate
it. Existing durable proof, source provenance, normalized read-back and atomic activation rules apply.

Overlay restoration observes the current page and resolves each saved semantic signature and
occurrence onto current element IDs and rectangles. Radio choices resolve as logical groups.
Changed routes, incompatible layouts or unmatched targets receive no stale overlay.

Training drafts and jobs share `SmartMapperJobs`. Expired-job cleanup removes only job UUID rows;
`training-*` rows remain durable value-free records. No new Azure resource or M.I.A. deployment is
required. Authenticated browser capabilities remain in trusted session storage; they are not moved
to disk or persistent browser storage.

## Validation and limits

Synthetic tests cover closed-tab restoration, fresh-target overlay resolution, scope isolation,
expired-capability recovery, catalog/revision rejection, preservation of the original draft and
prohibited activation of an unverified version. Browser tests exercise the real side panel, training
API, registry and deterministic prefill after closing the original carrier tab, with final submit
remaining untouched.

Library results are bounded to 500 drafts and 500 published versions. Draft discovery is limited to
the original trainer; published mappings are shared within their registry tenant scope. Recovery
preserves a snapshot rather than merging concurrent edits. Editing or extending published versions
still requires a new training/version workflow. A catalog mismatch requires review; this change does
not silently migrate old source paths. Metadata already removed before this fix cannot be restored.
