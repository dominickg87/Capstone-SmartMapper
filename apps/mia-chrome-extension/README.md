# MIA SmartMap extension for the capstone

This app is the capstone's only Chrome extension and the basis for extension development. Its runtime
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

For ongoing development, run `pnpm dev:extension` from the repository root. It builds once, then
watches the runtime scripts, HTML, styles, manifest, and icons and rebuilds `dist` after edits.
Chrome still requires a manual extension reload to pick up the new files. A failed rebuild reports
the error and waits for the next edit. `pnpm build:mia-extension` is an alias for `pnpm build:extension`.

The application uses HTML, CSS, and JavaScript. The build syntax-checks the scripts and uses esbuild
to bundle the shared matcher, quote-field translation, schemas, and core policy/value operations into
the background worker. Build/watch also tracks the shared source packages. No remote code is loaded.

## Try the deterministic matcher with your existing MIA connection

Build and reload the same extension, then close and reopen its side panel. The version display is
**1.4.21-semantic.2**. Keep your existing portal URL and sign-in, open SmartMap, and select a saved
quote. The new deterministic matcher is the default SmartMap flow: click **Read Page**, then
**SmartMap**. There is no method selector on the main mapping screen.

This mode refreshes the selected quote through `GET /api/extension/quotes/{id}` and uses the shared
`packages/semantic-matcher` locally. It does not call the server mapping endpoint or require the
local API, a model key, or synthetic quote substitution. The existing server mapping method remains
an explicit selection under **Settings > Advanced mapping** for comparison; it is never an automatic
fallback. Changing methods requires a fresh page read. The method preference is saved separately
from the portal URL and authentication. A previously saved server preference remains selected and
is identified as comparison mode on the mapping screen.

Before reading or mapping, the panel checks the background worker's bundled build and protocol.
A missing or mismatched worker stops with instructions to reload at `chrome://extensions` and
reopen the panel. A missing fill response asks you to review any entered fields before restarting;
it does not retry entry automatically. Reopening the panel alone may load new UI files while the
old worker is still running, so reload the extension after every build.

The quote response must include `quote.id` and supported source fields, not just its display summary.
The translation accepts explicit canonical applicant/driver/vehicle/property paths and the MIA
home/auto `quote.form_data` fields (including the stored JSON/nested `form_data` envelope). These
aliases come from the local MIA form definitions at commit `4ef8583`: applicant1 identity and physical
address, vehicleYear/vehicleMake, yearBuilt, squareFootage, and numberOfStories. It never derives an
applicant from `client_name`, invents a missing value, or assumes applicant/additional-driver order.
Conflicting or malformed values become review items. A deployed endpoint returning only summary
fields needs to expose its authorized quote detail before this mode can fill; the current deployed
response format has not been verified.

Each deterministic candidate passes schema, confidence, and action policy checks. Entry is bound to
the tab/document/layout captured by Read Page. The inherited filler uses strict text/native-select
entry, preserves existing values, and verifies normalized post-entry read-back. Review items name
semantic fields and reason codes. Successful entries retain semantic and original MIA source paths
plus read-back hashes, not raw values. Training and feedback requests are not sent in this mode.

Known limits: the dictionary's field coverage is finite; custom widgets, unknown source formats,
ambiguous repeated blocks, and unsupported choices need review. Page runs are not durable jobs;
after worker/browser interruption, read the page again and review existing entries. This integration
does not claim live-carrier compatibility or complete the shared resumable workflow architecture.
See [ADR 0007](../../docs/adr/0007-extension-deterministic-mia-flow.md).

## Local demo with no MIA backend and no AI

The legacy server mapping method posts the page snapshot to MIA and fills the backend's assignments.
That needs a deployed tenant, a demo account, and backend mapping support. For local work you can point the
extension at this repository's own API instead, which answers the same routes using the
deterministic matcher in `packages/semantic-matcher`. No model, no key, no network.

```sh
pnpm install
pnpm build:extension
pnpm dev:api             # terminal 1 - the local mapping backend on 127.0.0.1:4300
pnpm dev:mock-carriers   # terminal 2 - the synthetic carrier lab on localhost:4173
```

Load `apps/mia-chrome-extension/dist` at `chrome://extensions` with Developer mode on, then open
the side panel from the toolbar icon.

The local API accepts any bearer token, so skip the MIA sign-in by seeding one. Right-click inside
the side panel, choose **Inspect**, and run this once in that console:

```js
await chrome.storage.local.set({
  miaSmartMapAuth: {
    access_token: 'local-dev-token-not-a-credential',
    token_type: 'Bearer',
    base_url: 'http://127.0.0.1:4300',
    expires_at: null,
  },
});
await chrome.storage.sync.set({ miaBaseUrl: 'http://127.0.0.1:4300' });
location.reload();
```

In the side panel, open **SmartMap** and search `synthetic`, then select **Avery Example**.

For this legacy local-API demo, open **Settings > Advanced mapping** and select
**MIA server mapping (comparison)**: the synthetic API implements
that route using the deterministic matcher, while its quote-detail route returns a display summary.
For each page below: open the URL in the active tab, click **Read Page**, then click **SmartMap**.

### Steps to reproduce

| Page                        | Should fill                                                                 | Should stay empty                   |
| --------------------------- | --------------------------------------------------------------------------- | ----------------------------------- |
| `/modern` step 1            | First name, Date of birth, State                                            | Occupancy radios, Currently insured |
| `/modern` step 2 (Continue) | Driver 1 DOB, Driver 2 DOB, Vehicle year, Vehicle make, Second vehicle year | **Usage details**, Valid license    |
| `/modern` step 3 (Continue) | nothing                                                                     | **Mock submit is never clicked**    |
| `/classic?step=1`           | Applicant first/last name, Contact phone, Year built                        | Insurance status radios             |
| `/classic?step=2`           | Both listed driver names, both auto makes                                   | **Additional details (optional)**   |
| `/classic?step=3`           | nothing                                                                     | **Mock submit is never clicked**    |
| `/modern?layout=changed`    | same as step 1, every label reworded                                        | as above                            |

The bolded columns are the point. "Usage details" and "Classification code" are deliberately
ambiguous fields in the mock lab, and a field left blank there is the matcher refusing to guess.

Expected behavior worth checking by hand:

- **Date of birth receives ISO** on `type="date"` inputs and `MM/DD/YYYY` in a plain text box.
- **State resolves `IL` to the "Illinois" option** rather than blanking the select.
- **Driver 1 gets Avery, Driver 2 gets Riley** — never the same person twice, never swapped.
- **Changed layouts still fill.** `?layout=changed` renames every label ("Given name", "Birth date",
  "Model year", "Vehicle manufacturer") and the fields still resolve, because the match is on meaning
  rather than an exact string.
- **A missing source is left blank.** The synthetic applicant has no second address line, so an
  "Apt/Suite" control is skipped rather than invented.
- **Two identical controls tie and are left alone.** No value entered beats a wrong value entered.

Every assignment carries a `source_path` and the evidence string that justified it, so any fill can
be traced back to the signal behind it. The same expectations run headlessly as
`apps/orchestrator-api/src/mock-carrier-pages.test.ts` under `pnpm test`.

To go back to the real MIA backend, clear the override:

```js
await chrome.storage.local.remove('miaSmartMapAuth');
await chrome.storage.sync.remove('miaBaseUrl');
```

This path is development-only. The local API binds to loopback, serves synthetic quotes, and
performs no authorization; it must never be exposed off the machine. See
[ADR 0006](../../docs/adr/0006-deterministic-semantic-matcher.md).

## Teammate demo setup

1. Load the extension and open its side panel using the Chrome toolbar icon.
2. Open Settings and set the MIA portal URL to the approved demo tenant's URL. The inherited default
   is the main MIA site; it is not evidence that a demo tenant has been configured.
3. Open **SmartMap**, then **Sign into MIA**. Sign in using the demo account through the MIA website.
   The extension opens `/extension/connect` and receives an extension token from that page.
4. Search dashboard quotes and select an authorized synthetic quote.
5. Open an approved HTTPS test form in the active browser tab. Click **Read Page** and grant the
   requested site access. Click **SmartMap** to request mappings and fill available fields.
6. Review the entered values. If the page changes, use **Continue Mapping** after reviewing it.
   Final submission and legal acknowledgements remain the user's responsibility.
7. In server comparison mode, **Save Training** saves reusable field mappings through MIA. It does not save or submit the
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

## Source history and remaining work

All upstream runtime scripts, HTML, CSS, icons, and the bundled PDF library are included. The source
repository and its history are untouched. The source `.git` directory, dangling nested gitlink,
editor configuration, old webpack configuration, npm package/lockfile, and unused generated webpack
bundle are omitted. The capstone workspace supplies the package/build configuration. Upstream source
formatting and small lint-only cleanups follow this repository's checks; the PDF library is preserved.

Build new extension features here, reusing the MIA sign-in, quote selection, and side-panel flow.
The deterministic mode now uses shared matching, quote translation, policy, value operations, and
versioned action schemas. The existing server-mapping mode still uses the inherited assignment
protocol. Full `MiaQuoteProvider`/`ExtensionExecutor` job orchestration remains future work.
See [ADR 0005](../../docs/adr/0005-import-mia-extension.md) and the [backlog](../../docs/BACKLOG.md).

Known inherited server-mapping limitations that must be resolved before claiming capstone safety acceptance:

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
