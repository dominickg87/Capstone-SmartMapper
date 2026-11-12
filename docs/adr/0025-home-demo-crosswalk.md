# ADR 0025: Fixed Home demo profile from Dom's mapping notes

- Status: Approved by Dom's November 12 request to wire the remaining choices and prepare testing.
- Delivery: extension 0.3.15, fixed profile `home-demo-1`.
- Extends ADRs 0023/0024. The page-reference editor remains available.

## Scope and evidence

Dom supplied `smartmapper-homeowners-mapping-2026-11-12T19-41-45-290Z.txt`, containing 198 controls
and eleven selected source paths. The profile records the worksheet's SHA-256 hash and its
value-free field IDs, names, types and available option labels. Repository privacy was previously
confirmed in PROJECT_SCOPE.md. No authenticated carrier page was accessed by the agent; development
and acceptance checks use local synthetic pages and a synthetic M.I.A. API.

There are 52 source-backed field recipes, 75 visible controls requiring review, and 71 hidden,
navigation, search or final-action controls ignored by this profile. All eleven explicit selections
are preserved. A conflicting separately insured property address blocks the applicant-address
recipe rather than filling the wrong property. These counts describe recipes and dispositions;
actual verified coverage depends on the quote's answers and live field availability.

This is a fixed, versioned demo implementation, not an activation of an old registry draft. Its
profile and crosswalk ship atomically with the extension build after synthetic tests. Subsequent
profile changes require a new profile/build version. No training, registry publication, model or
stale-catalog refresh is part of the execution path.

## Crosswalk and execution

The carrier-independent recipe code lives in `packages/carrier-adapters/src/home-demo.ts`. It
resolves source values only for the specific target being processed. It matches full observed
name/ID hashes, requires exactly one target and uses the live option's actual value after matching
its label. Labels from the worksheet are never substituted for HTML option values.

Explicit aliases cover construction, supported roof materials/shapes, property type, alarms,
payor, fortified certificate and other unambiguous representations. Coverage B/C/D amounts convert
to percentages of Coverage A only when a listed percentage represents exactly the source amount
to the cent. Currency formatting and complete US/ISO dates are deterministic. Household/story
upper buckets use their explicit numeric thresholds. No nearest-limit selection or coverage
rounding is allowed. Array-derived answers require an actual nonempty source selection.

Ambiguous source detail remains a review item: generic metal/tile/three-tab roofs, partial-hip
percentages, flat-roof construction, raised-foundation subtypes, combined seasonal/secondary usage,
unspecified mortgage position or installment schedule, and unsupported limits. The shared policy
may additionally block human-only controls even when a source recipe exists. Missing source facts,
carrier-specific endorsements, credit authorization, paperless consent and underwriting defaults
are never invented. Existing page values remain unchanged for review-only fields.

The runner reuses `BrowserPageSession`, `ActionBatchSchema`, source provenance and the existing
action policy/read-back implementation. No second browser entry engine is introduced. Only native
fill/select actions are compiled. The shared observer now also excludes disabled optgroup options.
Each action is preceded by an active-tab, exact-URL, account/session and fresh-page check. Initial
recognition requires four captured field identities and the selected LA/HO3LA context.

Native postbacks are handled with up to three fresh observations of the same field on the same
bound URL. The shared executor detects already-correct values. Different URLs, inactive tabs,
authentication changes, missing or ambiguous controls, and exhausted retries stop or produce
explicit review results. The runner checks all successes again after dependent fields settle.
The open panel owns the bounded run independently of the service worker; closing it cancels further
work. Selecting the quote and running again safely rechecks already-entered fields. No automatic
Next, final submit, validation button, bind, consent, payment or credit-score request is executed.

## M.I.A. integration and UI

The POC adopts the live extension's navy/light visual style and familiar flow: **Smart Mapper**,
M.I.A. sign-in, search client/quote, select a Home quote, **Map quote**. The separate live extension
repository is read-only. The built POC connects to `https://demo.mia.agency` using the existing
`/extension/connect`, `/api/extension/me`, `/api/extension/quotes/search` and quote-detail endpoints.
No change to MIA_web_app/main or backend deployment is needed. Home search filters the existing
API's results; a specific client/quote query may be needed when recent results are other products.

The verified handoff is bound to a short-lived nonce, origin, tab, top frame and expiry. Profile
verification precedes token storage. Tokens live only in trusted `chrome.storage.session`; source
quote data and results stay in panel memory. API calls omit cookies, disallow redirects and bypass
HTTP caches. Expired or changed accounts stop work. There are no carrier host permissions: the
existing active-tab grant applies. The only permanent host permission is the configured M.I.A.
origin; a content script runs only on its connection page. Test builds use exact localhost origins.

No raw quote values, credentials, authenticated profiles or carrier screenshots are committed or
logged. Output results identify field number/title, status/reason and source paths. Synthetic test
artifacts remain ignored. The reference editor's explicit local worksheet download remains under
ADR 0024's separate data-handling boundary.

## Validation and limits

Unit coverage checks the eleven supplied links, all 198 dispositions, exact option/code resolution,
coverage ratios, repeated/changed identities, disabled/missing/duplicated options, unsupported facts,
date validity, address conflicts, no-source behavior and protected consent/final controls. Auth tests
reject wrong origin/tab/frame/nonce, replay, expired tokens, page-originated connection requests and
failed profile verification. The browser test signs in through the real handoff scripts, selects a
Home quote, maps through a native reload, re-runs with a disabled option and asserts no consent or
final action. The reader and retained registry suites remain required.

Live acceptance belongs to Dom. The worksheet did not include every conditional scenario or the
underlying page scripts. Custom formatting, unavailable fields, incomplete captures and live
carrier validation can still require review or a follow-up correction based on test feedback.
