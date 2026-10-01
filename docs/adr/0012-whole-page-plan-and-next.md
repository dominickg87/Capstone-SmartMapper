# ADR 0012: Whole-page planning, repair and ordinary Next/Continue

- Status: Accepted under Dom's October 1, 2026 workflow request and explicit answer,
  "Automatically use ordinary Next/Continue".
- Extends ADRs 0005, 0009, 0010 and 0011; application build 0.2.4.
- Supersedes the eight-field/single-section planning limit and mandatory manual page navigation
  for this opt-in workflow. Astra, source authority, independent verification and final-action
  restrictions remain in place. This does not authorize agent-operated live-carrier testing.

## Page inspection and execution

On Start and each repair pass, the shared browser core expands native details and explicit native
button disclosures with aria-expanded/aria-controls. Only inspectable disclosures are opened;
human-only controls and answer choices are excluded. Expansion is bounded to 30 operations.
The extension scrolls the active tab across overlapping viewports, captures up to 12 JPEG images,
and restores the page to its top. DOM controls use document coordinates; every image carries its
document offset. Structured page text and controls replace arbitrary source-code/JavaScript upload.
Screenshots remain in memory. No new browser permission or cloud browser service is needed.

Capture permits up to 20 MB of image data, 400 controls and two attempts if the page changes during
inspection. Incomplete capture, unopened recognized sections, omitted controls or frames prevent
automatic navigation. The existing content-script injection uses the currently loaded build;
listeners from previous builds ignore new requests.

The planner receives all images, the current page inventory, and the original M.I.A. Q&A with
question/section/entity/option context. It proposes up to 48 independent native fill/select/check
actions across photographed sections. The independent verifier sees the same images with offsets
and the authoritative source facts. Custom widgets, added records and dependent choices remain
single interactions followed by inspection. Old observations without page images retain the
eight-field viewport-section limit.

Every entry still passes policy, provenance, equivalence, active-tab binding, current DOM checks,
and normalized browser read-back. Target-specific uncertainty excludes that field while supported
independent fields can proceed. A structural plan violation blocks the entire plan. Both explicit
model review items and independent verification failures exclude their target from execution.

After execution, a fresh inspection feeds the next plan, which fills missing or newly revealed
fields. A stale remaining action is discarded and triggers automatic reinspection; an unexecuted
stale action does not consume a field retry. Expected page changes do not select maximum reasoning.
An answer-triggered document reload can destroy the extension reply channel. For native entries,
the extension permits bounded recovery only to a new document on the same bound tab/origin/route,
reports the entry as interrupted rather than verified, and requests fresh inspection. Other
navigation or authentication requires the human. Both inline reveal and full-postback browser
tests cover the repair flow without final submission.
Actual failed entries still escalate for a bounded repair attempt. Unresolved validation/read-back
failures, ambiguous source facts and human-only actions pause for review. Representation reasoning
may never invent insurance facts.

## Ordinary navigation

`SMARTMAPPER_AUTO_NEXT` defaults false. Dom's local POC sets it true. After a fresh model
page_complete decision with no review items, the backend may generate one internal `next_page`
action. The model's compact output union cannot emit this action; the backend also rejects direct
model navigation proposals. Reuse the shared versioned action/policy/executor contract.

Exactly one enabled, recognized Next/Continue control is required. Native links/buttons must
remain in the same origin/tab. Exact ordinary labels, no commitment context, complete page capture,
no missing required inputs, authentication, carrier errors, unchecked consent or unsupported frames
are required. The executor rechecks the page and form validity before dispatch. Bind, Issue, Sell,
payment, final submit, consent, signatures and authentication remain human-only.

Dispatch is acknowledged before a document navigation destroys the message channel. The extension
then waits for a changed document, route (including query/hash), or same-page state. It does not
click Next repeatedly if navigation fails. Missing navigation, cross-origin transitions, unexpected
navigation or changed job revisions pause. Ordinary Next can post data to the carrier as part of
moving through its quote workflow; the authorization is for that intermediate transition only.

Eight inspection/repair passes per page, five attempts per control, 150 actions per page, 12 unchanged
observations and 20 automatic transitions per job bound execution. Pause/chat invalidate queued
work. Resume is explicit after human intervention. Checkpoints store counters, hashes and scoped
metadata, never images or proposed values. Local backend restart ends memory-backed jobs.

## Evidence and limitations

Synthetic tests cover multi-viewport planning, both expansion patterns, a newly revealed field,
ordered partial execution, withheld unsafe entries, source/read-back checks, automatic Next,
missing data, consent, incomplete capture, ambiguous navigation, page limits, failed transitions
and Pause. The end-to-end test reaches a review page without clicking Issue policy.

A synthetic call to the existing Azure Astra deployment planned twelve fields across three images
in one request, and the independent check approved all twelve. At low reasoning this measured 9.8s
for planning and 4.9s for verification, including initial credential setup and excluding browser
entry. This establishes multi-image operation, not a comparison against the prior build on a live
carrier. Only aggregate timing/count metadata was retained; screenshots stayed in memory.

Unsupported custom accordions, nested scroll regions, virtualized controls, frames/shadow DOM,
very large or continuously changing pages can require human assistance. Generic navigation checks
cannot prove every carrier's server-side meaning; visible or ambiguous commitment steps remain
manual. Larger plans reduce repeated AI rounds, but image capture and model latency remain, and
this change alone does not establish a 10x speed improvement or carrier acceptance.

Image requests follow [OpenAI image input documentation](https://developers.openai.com/api/docs/guides/images-vision).
Visible-tab capture is paced below [Chrome's two-per-second limit](https://developer.chrome.com/docs/extensions/reference/api/tabs#property-MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND).
