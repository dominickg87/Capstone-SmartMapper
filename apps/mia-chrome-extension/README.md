# MIA SmartMap extension for the capstone

This app is an imported MIA SmartMapper 1.4.23 extension alongside the preserved extension-prototype. Its runtime
comes from `MIA-Chrome-Extension`, branch `ChromeExtSave2AMS`,
commit `afe0c897c5412c0f16e8d69c35931811b73fde4f` (upstream version 1.4.21).
SmartMap is enabled in the toolbar. Chrome displays this copy as **MIA SmartMapper (Capstone)**.

## Build and load in Chrome

From the capstone repository root:

```sh
pnpm install --frozen-lockfile
pnpm build:extension
```

`pnpm build` also builds this app. Open `chrome://extensions`, enable Developer mode, choose
**Load unpacked**, and select **apps/mia-chrome-extension/dist**. Select the directory containing
`manifest.json`, rather than an individual file. Reload the extension in Chrome after rebuilding.
Disable other MIA extension copies while testing so the connection page hands the token to one copy.

For ongoing development, run `pnpm dev:mia-extension` from the repository root. It builds once, then
watches the runtime scripts, HTML, styles, manifest, and icons and rebuilds `dist` after edits.
Chrome still requires a manual extension reload to pick up the new files. A failed rebuild reports
the error and waits for the next edit. `pnpm build:mia-extension` is an alias for `pnpm build:extension`.

The application is static HTML, CSS, and JavaScript. The upstream manifest loads `src/content.js`
directly, and the side panel loads `src/sidepanel.js` directly. The build syntax-checks the scripts
and copies the runtime into `dist`; it needs no webpack dependencies.

## Teammate demo setup

1. Load the extension and open its side panel using the Chrome toolbar icon.
2. This capstone build defaults to `https://demo.mia.agency`. Existing saved `https://mia.agency`
   defaults migrate to the demo portal; tokens belonging to the old portal require a new sign-in.
   Other explicitly configured tenant origins remain configurable in Settings.
3. Open **SmartMap**, then **Sign into MIA**. Sign in using the demo account through the MIA website.
   Version **1.4.23** opens `https://demo.mia.agency/extension/connect?extension_state=...` by default,
   using a fresh random state per attempt and the existing connection-page token handoff. The
   **1.4.22** demo local SmartMap fallback, quote search, and Read Page remain unchanged.
4. Search dashboard quotes and select an authorized synthetic quote.
5. Open an approved HTTPS test form in the active browser tab. Click **Read Page** and grant the
   requested site access. Click **SmartMap** to request mappings and fill available fields.
6. Review the entered values. If the page changes, use **Continue Mapping** after reviewing it.
   Final submission and legal acknowledgements remain the user's responsibility.
7. **Save Training** saves reusable field mappings through MIA. It does not save or submit the
   completed target form, and it does not establish that a model is being fine-tuned.

Demo credentials are sufficient on the teammate's side only when the following backend features are
already deployed and the account is authorized for them. No separate AI key is entered in this
extension; any AI provider setup belongs to the MIA backend.

| Route                                        | Required behavior                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /extension/connect`                     | After login, render a JSON element with ID `mia-extension-connection` containing `access_token` and token metadata. |
| `GET /api/extension/me`                      | Accept the extension bearer token and return its user/tenant.                                                       |
| `GET /api/extension/quotes/search?query=...` | Return a `results` array of quotes the signed-in account may access.                                                |
| `GET /api/extension/quotes/{id}`             | Return the authorized selected `quote`.                                                                             |
| `POST /api/extension/smart-map/map`          | Accept `quote_id` and a page snapshot; return `mapping.assignments` with target field IDs, values, and confidence.  |
| `POST /api/extension/smart-map/feedback`     | Record fill/pause feedback. Failure is logged without cancelling an already completed fill.                         |
| `POST /api/extension/smart-map/training`     | Save reusable mappings when the user chooses Save Training.                                                         |

The inherited authentication content script matches HTTPS `mia.agency`, `mia.test`, and their
subdomains. A demo portal on a different domain needs a reviewed manifest/auth configuration change;
changing Settings alone does not install the authentication content script there. The backend must
also permit the extension's requests, including any applicable CORS/origin/extension-ID rules.
Token expiry/401 requires another MIA sign-in; there is no refresh-token implementation here.

The actual demo URL, backend deployment, account roles, quote availability, provider configuration,
and live connectivity have not been verified. Use synthetic demo quotes. Prefer a demo user per
teammate for separate access and revocation. Share credentials through the approved private channel,
never Git, issue bodies, or files in this repository. MIA login does not grant carrier-site access.

## Demo local mapping fallback (1.4.22)

For the approved demo portal only, a 404 from `POST /api/extension/smart-map/map`
activates **Demo local mapping fallback**. The backend remains the first mapping attempt.
Other errors, expired authentication, and other portal origins never activate it.

The fallback reads only the already-selected quote in memory. It matches explicit first/last name,
email, street, city, state, ZIP, county, and unambiguous basic property values to rendered field
labels, names, IDs, placeholders, and local nearby text. It never derives names from display text,
looks up missing facts, or chooses between conflicting source values. Ambiguous, absent, protected,
unsupported, and populated fields are skipped for manual review. No quote values are logged.

The existing fill executor handles local assignments with additional demo-only checks: original
read-tab/page and target checks, protected control filtering, exact select choices, native value
entry, input/change events, source-path provenance, and normalized read-back. A changed page requires
**Read Page** again. Submit, SSN, payment, signature, consent, and attestation controls stay untouched.
Local fallback results cannot be saved as training or sent as mapping feedback.

This is a bounded demo adapter, not a registry or live-carrier compatibility guarantee. Unrecognized
quote schemas, repeated applicants, inaccessible frames, custom widgets, and uncertain answers remain
manual review items. Existing backend mapping behavior and its inherited limitations below remain.

Build and run the app-contained synthetic regression tests under Node 24:

```powershell
pnpm.cmd build:extension
pnpm.cmd --filter @smartmapper/mia-chrome-extension test:demo
```

The tests use synthetic quote data, isolated browser profiles, blocked external DNS, and intercepted
demo-portal responses. They prove visible form entry on 404, backend priority, failure-closed behavior
for non-404 errors and other portals, protected fields, changed-page stops, and no final submit.

## Source history and remaining work

All upstream runtime scripts, HTML, CSS, icons, and the bundled PDF library are included. The source
repository and its history are untouched. The source `.git` directory, dangling nested gitlink,
editor configuration, old webpack configuration, npm package/lockfile, and unused generated webpack
bundle are omitted. The capstone workspace supplies the package/build configuration. Upstream source
formatting and small lint-only cleanups follow this repository's checks; the PDF library is preserved.

Build new extension features here, reusing the MIA sign-in, quote selection, and side-panel flow.
This app does **not yet use** `packages/automation-core`, `MiaQuoteProvider`, or the capstone's versioned
action schemas. Integrating those safeguards into this extension is the next architectural step.
The deterministic registry baseline remains defined by [ADR 0018](../../docs/adr/0018-human-trained-deterministic-mapping-registry.md); this imported app has the limitations listed below.

Known inherited limitations that must be resolved before claiming capstone safety acceptance:

- Mapping assignments contain actual values; the filler uses a confidence cutoff of 0.5. It does not
  apply the capstone's schema, provenance, high-risk-field policy, or normalized post-entry read-back.
- Page snapshots include surrounding text, headings, options, and full page URLs, which may contain
  PII. MIA's server-side AI input handling, retention, and tenant isolation are outside this import.
- The active tab is looked up separately for read and fill; durable tab/job locking and recovery
  through the shared core still need implementation.
- The inherited permissions include MIA/AMS origins and optional access to any HTTPS origin, requested
  per active site. This import does not approve automation on any particular live carrier.
- The filler excludes submit/password/file/button controls, but it has no comprehensive semantic
  guard for legal-consent or attestation fields. Those require shared policy integration.
- The extension token is stored in Chrome local extension storage. Use an isolated demo browser
  profile, and remove the extension/profile to clear its state after the demo.

The browser regression uses synthetic responses and a local test form, tests real extension loading,
token handoff, quote selection, mapping/filling, training, expired sign-in, and explicitly checks that
the final submit control was not clicked. It does not establish real MIA/carrier compatibility.
