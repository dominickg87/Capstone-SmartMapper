# SmartMapper 2.0 deterministic-registry setup

This guide deploys backend **0.3.8** and extension **0.3.9**, the human-trained deterministic mapping registry accepted in
[ADR 0018](adr/0018-human-trained-deterministic-mapping-registry.md). It uses the resources already
provisioned in `rg-mia-smartmap-prod`, including the `SmartMapperMappings` Azure Table. It does not
modify the live `MIA-Chrome-Extension` repository.

The active runtime does not use Astra, a PDF quote sheet, Document Intelligence, AI Search, mapping
chat, prompts, or model verification. Do not configure Azure OpenAI variables for this build.

## Required infrastructure

| Resource         | Current value                                                              | Purpose                                              |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Subscription     | `47b7b9c8-dd15-407c-a380-f033eac1ad92`                                     | Existing Azure subscription                          |
| Resource group   | `rg-mia-smartmap-prod` in East US                                          | Existing SmartMapper resource boundary               |
| App Service      | `asp-smartmapper-dev`                                                      | Authenticated SmartMapper API                        |
| Backend origin   | `https://asp-smartmapper-dev-fgbqddfbewfrd2at.eastus-01.azurewebsites.net` | Extension API origin                                 |
| Storage account  | `stsmartmapperdevdg`                                                       | Jobs, drafts, and mappings                           |
| Existing table   | `SmartMapperJobs`                                                          | Expiring jobs and durable value-free training drafts |
| Registry table   | `SmartMapperMappings`                                                      | Persistent immutable registry versions               |
| Managed identity | App Service system identity                                                | Access to both Azure Tables                          |
| Monitoring       | `appi-smartmapper-dev` and its linked workspace                            | Redacted request/stage telemetry                     |

No SQL database, Redis cache, queue, hosted browser, VPN, private endpoint, Foundry Agent Service,
Document Intelligence, AI Search, vector store, or additional web application is required.

## 1. Deploy the M.I.A. integration

Use the `smartmapper2.0` branch in the sibling `MIA_web_app` repository. Its active SmartMapper API
under `/api/extension/smartmapper/v2` is:

| Method and path               | Authentication and purpose                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `GET /catalog/{formType}`     | Training-token ability; returns the complete value-free Home or Auto field catalog. |
| `POST /training/grants`       | Training-token ability; issues a one-use verifier-bound, quote-less grant.          |
| `POST /training/redeem`       | Backend redeems the training grant and receives its catalog and binding.            |
| `POST /quotes/{quote}/grants` | Mapping-token ability; authorizes the selected quote and carrier tab.               |
| `POST /redeem`                | Backend redeems the one-use quote grant and receives its semantic source manifest.  |
| `GET /source`                 | Rechecks ownership/revocation and returns current questions and answers.            |
| `DELETE /source`              | Revokes the quote source capability.                                                |

M.I.A. extension tokens receive separate `smart-map:map` and `smart-map:training` abilities. The
catalog and training routes require `smart-map:training`; ordinary users cannot publish mappings by
calling a training route with mapping-only access.

Set these private M.I.A. environment values for the approved tenant:

```dotenv
SMARTMAPPER_ENABLED=true
SMARTMAPPER_ALLOWED_PRINCIPALS=33f13d6c-17ed-4e78-b1f8-abaef0903513/4
SMARTMAPPER_TRAINING_PRINCIPALS=33f13d6c-17ed-4e78-b1f8-abaef0903513/4
SMARTMAPPER_ALLOW_ANY_CARRIER=true
SMARTMAPPER_CARRIER_ORIGINS=https://www.alliedtrustagents.com
```

Use M.I.A. tenant/user IDs, not Entra IDs. Append
`chrome-extension://njdbagmlilnljlgjbldeleblkjmokelf` to the existing `CORS_ALLOWED_ORIGINS` value without
removing live-extension origins.

`SMARTMAPPER_ALLOWED_PRINCIPALS` permits quote mapping. `SMARTMAPPER_TRAINING_PRINCIPALS` is the
smaller trainer allowlist; only listed principals receive the `smart-map:training` ability when they
reconnect the extension, and M.I.A. rechecks the same list on every catalog and training-grant call.

Deploy the reviewed M.I.A. branch through its normal release process, then run the tenant migrations.
For one approved tenant:

```powershell
php artisan tenants:migrate --tenants=TENANT_ID --force
php artisan config:cache
```

Run `SmartMapperV2Test.php` and `ExtensionApiTest.php` in local development or CI before deploying.
The production commands above apply migrations and configuration; they do not run the test suite.

The migrations include the existing quote grant table and the new training grant table. They do not
change quote answers. The value-free Home/Auto catalog is generated from reviewed M.I.A. form
definitions. When those forms change, regenerate `resources/smartmapper/questions.json`, review the
diff, and rerun `SmartMapperV2Test.php`; a source digest mismatch deliberately blocks a stale catalog.

The catalog includes both Home applicants and all supported Auto positions: five additional drivers
and eight vehicles. It returns the original question and context for every source path, without
customer values.

## 2. Verify the provisioned mapping registry table

Sign in to Azure CLI and select the existing subscription:

```powershell
az login --tenant 5ed8dddb-bd93-4e03-ac75-2fb1885da769
az account set --subscription 47b7b9c8-dd15-407c-a380-f033eac1ad92
```

Confirm the table in the existing storage account:

```powershell
az storage table exists `
  --account-name stsmartmapperdevdg `
  --name SmartMapperMappings `
  --auth-mode login
```

Expected output reports `exists: true`. The App Service system identity already has **Storage Table
Data Contributor** on the storage account. Confirm that role still covers both `SmartMapperJobs` and
`SmartMapperMappings`; no storage key belongs in application settings.

## 3. Configure the SmartMapper App Service

Azure Portal -> **App Services** -> **asp-smartmapper-dev** -> **Settings -> Environment variables**
must contain:

| Name                                    | Value                                                                |
| --------------------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`                              | `production`                                                         |
| `SMARTMAPPER_CHECKPOINT_STORE`          | `azure`                                                              |
| `AZURE_STORAGE_TABLE_ENDPOINT`          | `https://stsmartmapperdevdg.table.core.windows.net/`                 |
| `AZURE_STORAGE_JOBS_TABLE`              | `SmartMapperJobs`                                                    |
| `AZURE_STORAGE_MAPPINGS_TABLE`          | `SmartMapperMappings`                                                |
| `SMARTMAPPER_EXTENSION_IDS`             | `njdbagmlilnljlgjbldeleblkjmokelf`                                   |
| `SMARTMAPPER_MIA_ORIGINS`               | `https://demo.mia.agency`                                            |
| `SMARTMAPPER_ALLOWED_PRINCIPALS`        | `33f13d6c-17ed-4e78-b1f8-abaef0903513/4`                             |
| `SMARTMAPPER_CARRIER_ORIGINS`           | `https://www.alliedtrustagents.com` (required fallback allowlist)    |
| `SMARTMAPPER_ALLOW_ANY_CARRIER`         | `true` for Dom's supervised active-tab POC                           |
| `SMARTMAPPER_AUTO_NEXT`                 | `true` only for the approved trained ordinary Next/Continue behavior |
| `SCM_DO_BUILD_DURING_DEPLOYMENT`        | `false` for the prebuilt ZIP                                         |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Existing App Insights connection string                              |

Remove these obsolete settings after the deterministic package is deployed:

```text
AZURE_OPENAI_BASE_URL
AZURE_OPENAI_MODEL_DEPLOYMENT
SMARTMAPPER_DEFAULT_REASONING_EFFORT
SMARTMAPPER_ESCALATION_REASONING_EFFORT
```

Under **Configuration -> General settings**, use Node 24 LTS on Linux, Always On, HTTPS Only, TLS
1.2 or later, and startup command `node dist/server.js`. App Service Easy Auth is not part of this
flow; the API enforces extension origin plus verifier-bound M.I.A./job capabilities.

Missing scope or storage settings deliberately prevent startup. Any-carrier mode accepts only an
HTTPS origin bound into the M.I.A. grant and job capability for the explicitly activated tab. It does
not make carrier requests from the backend or add blanket carrier host permissions to the extension.

## 4. Build and load the POC extension

Copy `apps/extension-prototype/.env.example` to
`apps/extension-prototype/.env.local` and set exact origins:

```dotenv
VITE_SMARTMAPPER_BACKEND_ORIGIN=https://asp-smartmapper-dev-fgbqddfbewfrd2at.eastus-01.azurewebsites.net
VITE_SMARTMAPPER_MIA_ORIGIN=https://demo.mia.agency
VITE_SMARTMAPPER_ALLOW_ANY_CARRIER=true
VITE_SMARTMAPPER_CARRIER_ORIGINS=https://www.alliedtrustagents.com
```

Then run the required repository checks:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Open `chrome://extensions`, enable Developer mode, and **Load unpacked** from
`apps/extension-prototype/dist`. For an existing load, click **Reload**, close the old panel, and open
it again. Confirm **Version 0.3.3** in the panel and on Chrome's extension card.

Click the toolbar icon on the carrier tab. The panel stays attached only to that activated tab.
Connect to M.I.A. through the normal agency sign-in. **Connection details** supplies the extension ID
and M.I.A. tenant/user scope without exposing its bearer token.

Opening the panel does not require deploying M.I.A. or the Azure backend. Those paired deployments
are needed for retrieving field catalogs, saving training, and running registry-backed mapping.
If the panel does not open, check that Chrome's extension card shows 0.3.3, close any stale panel,
return to a normal HTTP/HTTPS carrier tab, and click this POC's toolbar icon. Restricted pages such
as `chrome://extensions` cannot activate the carrier panel. An opening failure shows a `!` badge;
the extension service worker console records only `smartmapper.panel` and a reason code such as
`panel_open_failed`, without carrier URLs or raw error text.

Reconnect once after deploying the M.I.A. branch so the extension receives the new separate
`smart-map:map` and `smart-map:training` abilities.

## 5. Train a workflow

For the record-first workflow in extension **0.3.9**:

1. Open the carrier tab, connect to M.I.A., choose **Train**, then Home or Auto.
2. Choose **Record carrier workflow**, or **Continue recording** in an existing draft.
3. Keep the panel open. Navigate and reveal conditional sections yourself. Pause for a few seconds
   on each state so the observer sees a stable form. Recording performs no carrier clicks or entry.
4. Choose **Stop recording & annotate**. A full browser tab opens the saved field reference.
5. Select a page on the left. Assign M.I.A. fields, transformations or Ignore/blank/human dispositions.
   Changes autosave. **Open field reference** reopens this editor from an existing training draft.
6. Open the matching carrier page, then choose **Pause training & test** in the reference. It returns
   to the carrier panel; select a demo quote and choose **Test prefill on this page**.
7. Review exceptions, then **Resume training**. Complete, verify and activate the workflow as below.

This is a record of visited states, not every possible branch. Unknown/private captions and choices
retain numbered fallbacks; existing captures do not retroactively acquire readable labels or new DOM
identity hints. Address suggestion selection remains manual. See [ADR 0021](adr/0021-recorded-carrier-reference.md).

Training is deliberate and page-by-page:

1. Open the carrier's first quote page and click the SmartMapper toolbar icon on that tab.
2. Open **Train** in the panel.
3. Choose **Home** or **Auto** and review the read-only carrier origin. SmartMapper uses that origin as
   the base URL and generates `Home workflow` or `Auto workflow`; trainers do not supply an identity
   name or state/product/program variant.
4. Choose **Start training and capture this page**.
5. Use the large numbered badges on the carrier page and matching numbered rows in the panel. A
   badge or row focuses its counterpart.
6. Assign every field one disposition: M.I.A. source, carrier default, approved fixed operational
   value, human required, ignore, or leave blank.
7. When mapping from M.I.A., select the question shown with its section/entity/path. For repeated
   people or vehicles, choose a fixed position or same-position pattern as appropriate. Configure
   only the provided date, date-part, phone, boolean, enum, multiselect membership/join, split, or
   compose transform.
8. Leave **Automatically number new fields** enabled and keep the Train panel open. Reveal each
   material conditional branch or manually navigate to the next page. Within a few seconds of a
   stable form, new fields appear with the next available numbers. Existing fields keep their numbers
   and saved mappings, including when sections are hidden and reopened. Discovery waits for pending
   edits to save and pauses during prefill tests. **Capture next page** and **Capture scenario** remain
   available for manual capture if automatic numbering is turned off.
9. Choose **Mapping complete** only when every captured field has a disposition. This creates an
   immutable `testable` mapping version; it does not make that version available to ordinary jobs.

Use **Leave blank** for optional fields M.I.A. intentionally does not collect, such as an unused
salutation. Use **Ignore** for a control that is not quote data. Neither option can satisfy a required
carrier field. Fixed values are limited to approved operational values such as an agency code and
cannot create a customer or underwriting fact. Their classification and reason are closed enums;
there is no free-form rationale.

Extension 0.3.5 adds an **Ignore** switch at the upper right of each carrier field card. It works
without expanding the card and autosaves the same Ignore disposition as the dropdown. Turning it off
returns the field to **Missing mapping** so a new disposition can be selected. Required and human-only
fields cannot be ignored with the switch; published mappings remain read-only.

Drafts autosave in `SmartMapperJobs`. Carrier semantics and option identities persist as SHA-256
digests. New captures may also retain readable form captions and static option labels from a closed
allowlist for the reference editor. Unknown or private text receives a numbered fallback. Quote
answers, current control values, HTML, screenshots, cookies, and browser credentials are excluded.

### Reopen saved work after closing a tab or reloading the extension

1. Reconnect to M.I.A. if needed. Open the carrier page, click the extension toolbar icon and choose **Train**.
2. Under **Saved training and mappings**, choose Home or Auto and click **Find saved training and mappings**.
3. For unfinished work, choose **Resume saved draft**. Saved choices and field numbers are copied into a freshly
   authorized session for this tab. The original saved draft remains intact.
4. For a completed version, choose **Open saved mapping for testing**, then **Test this mapping**.
   Select a demo quote in Map and click **Start test mapping**. Ordinary Start mapping resolves active
   versions; it cannot use an unverified testable version.

Finding saved work does not replace the local session until a record is explicitly selected. The
library is scoped to the freshly authorized account, carrier and line of business. A changed M.I.A.
catalog blocks draft recovery pending review. Metadata restoration does not depend on successfully
drawing overlays in an old tab. Overlays use freshly observed controls and never saved DOM IDs.
See [ADR 0019](adr/0019-saved-training-recovery.md).

The backend uses these training-session capability routes under `/v2/training/sessions/{id}`:
`GET /library`, `POST /recover` with a saved draft ID and current revision, and `POST /open` with an
exact mapping ID/version and current revision. Existing M.I.A. grant endpoints authorize discovery;
no M.I.A. redeployment or additional cloud resource is needed for this recovery update.

### Test during training (0.3.4)

1. Configure any fields on the current captured page. Choose **Pause training & test**; pending
   choices are saved before a preview is created. Other fields can remain unmapped.
2. Search for and select a demo M.I.A. quote for the same line of business, then choose
   **Test prefill on this page**. Known entries run and are read back; missing mappings/answers
   appear as exceptions. This preview never uses Next or Add controls.
3. Review the carrier entries. Choose **Resume training** to save the test summary and return to
   the same draft, or **Test another demo quote** to end the old job and unlock quote selection.
4. Correct choices, test again, or manually navigate and let automatic numbering capture new fields. Choose
   **Mapping complete** only when you are ready for whole-workflow verification and activation.
5. For an already completed version, choose **Continue training this mapping** in its saved-library
   row or its opened mapping view. This makes an editable draft and preserves the original version.

Test prefill preserves existing carrier entries on return to training. It does not reset the carrier
session or clear unrelated fields. Use a fresh carrier quote when changing clients if the page has
other populated or conditional fields. Preview results are tied to their draft revision; a preview
is never evidence that a completed production version has passed full coverage.

No M.I.A. web app deployment or additional Azure provisioning is required for this update. Deploy
SmartMapper backend 0.3.8 and reload extension 0.3.9 before using previews. These builds include the fix for false
`preview_page_changed` rejections caused by dropdown choices omitted during private training capture.
Saved drafts and mappings keep their existing IDs, signatures, and choices; retraining is unnecessary
for this correction. Trained human-only fields still require human action. Actual route, control
structure, and ordinary dropdown-domain changes retain their existing checks.

## 6. Test, verify, and activate the mapping

1. From the completed training view, choose the test action for its exact mapping ID/version.
2. Switch to **Map**, select a representative demo M.I.A. quote for that line of business, and run the
   entire trained workflow.
3. Confirm repeated Home applicants or Auto drivers/vehicles map to the correct same-position targets.
4. Confirm each browser receipt passes normalized read-back. One failed field must become a focused
   exception while successful independent fields remain complete.
5. Confirm missing answers, missing mappings, changed targets/options, human-required fields,
   intentional blanks/defaults, and entry failures appear as distinct outcomes.
6. Confirm SmartMapper takes a fresh post-entry observation before an enabled ordinary Next/Continue
   occurs, and that the refreshed page passes a clean review. Confirm final Submit, Bind, Issue, Sell,
   payment, consent, attestation, signatures, CAPTCHA, MFA, and authentication are never clicked.
7. Each clean completed test page automatically records durable proof for the exact mapping
   ID/version. Repeat the trained pages and conditional scenarios until the Train view reports the
   version as verified. The backend requires the same tenant, carrier origin, line of business, and
   mapping version; every trained page, mapped field, and enabled Next/Add control; normalized
   read-back; zero failures; and no unresolved reviews.
8. Activate the verified version. Activation supersedes the prior active version atomically.
9. Start a new ordinary Map job without a test selection and confirm it resolves the new active
   version.

When a carrier changes, capture and publish a new version. The current active version remains intact
until the replacement passes test, verification, and activation.

## 7. Package and deploy the backend

After all required checks pass:

```powershell
.\apps\orchestrator-api\package-app-service.ps1
```

This creates `artifacts/smartmapper-api-*.zip` with compiled packages and production dependencies.
It must not contain environment files, source answers, Azure credentials, screenshots, or browser
profiles. Deploy the reviewed ZIP:

```powershell
az webapp deploy `
  --resource-group rg-mia-smartmap-prod `
  --name asp-smartmapper-dev `
  --type zip `
  --src-path 'FULL_PATH_TO_REVIEWED_ZIP'
```

Open the backend `/health` endpoint and expect `status: "ok"`, protocol `version: "2.0"`, and
`buildVersion: "0.3.8"`. Health verifies process startup only. Complete the training and mapping
checks above to verify M.I.A., identity, both Azure Tables, and browser execution.

Startup HTTP 409 errors now preserve an allowlisted `apiReason` in copied diagnostics and backend
events, even before a job exists. `mapping_selection_unavailable` means the selected version was not
found in the authorized account/carrier/quote-type scope; `preview_tab_changed` and
`preview_owner_changed` identify the preview binding that needs recovery. These errors do not weaken
scope checks or automatically substitute another version. Use the panel's recovery message, then
retry. A failure at `/v2/jobs` occurs before field entry, so it cannot establish an autocomplete
interaction failure. Native address text entry is supported; selecting a dynamic address suggestion
is not part of the current trained executor and may require manual selection on the carrier page.

Increment the affected app's patch version for every changed delivery. The extension manifest and
panel read the extension package version; `/health` reports the backend package version. Rebuild and
reload/redeploy after a version change.

## 8. Local development

Dom's local M.I.A. tenant runs at `https://admin.mia.test`. Keep its existing database; run tenant
migrations and never reset or reseed it merely to test SmartMapper. Its private environment needs
the same SmartMapper enablement, mapping-principal allowlist, narrower training-principal allowlist,
carrier scope, and extension CORS origin.

For local supervised testing, create ignored
`apps/orchestrator-api/.env.development.local`:

```dotenv
NODE_ENV=development
SMARTMAPPER_CHECKPOINT_STORE=memory
SMARTMAPPER_ALLOW_ANY_CARRIER=true
SMARTMAPPER_AUTO_NEXT=false
SMARTMAPPER_API_PORT=4300
SMARTMAPPER_EXTENSION_IDS=YOUR_POC_EXTENSION_ID
SMARTMAPPER_MIA_ORIGINS=https://admin.mia.test
SMARTMAPPER_ALLOWED_PRINCIPALS=LOCAL_TENANT_ID/LOCAL_USER_ID
SMARTMAPPER_CARRIER_ORIGINS=http://localhost:4173,http://127.0.0.1:4173
```

The memory store needs no Azure storage or model setting. Start the compiled local backend and mock
carrier lab with:

```powershell
pnpm build
.\apps\orchestrator-api\start-local.ps1
```

Memory jobs and drafts survive extension worker/panel restarts but disappear when the local backend
restarts. Use the mock Home and Auto workflows for repeatable training and E2E checks. A live carrier
test remains a separately authorized, supervised task with its designated test account.

## 9. Retire model-era resources after cutover

After the deterministic build is deployed, a registry version is active, and ordinary mapping succeeds without
model configuration:

1. remove the obsolete App Service AI/reasoning variables listed above;
2. remove **Cognitive Services OpenAI User** from the SmartMapper App Service identity;
3. delete the `smartmapper-astra-dev` model deployment;
4. delete the `mia-smartmap-chat` deployment after the reviewed M.I.A. branch (which removes its
   legacy routes/configuration) is deployed; and
5. remove the Foundry project/account only after one final deployment inventory confirms that these
   were its only deployments.

Keep the App Service, its plan, storage account, `SmartMapperJobs`,
`SmartMapperMappings`, system identity, Application Insights, and the workspace linked to Application
Insights. The App Service plan may be resized later from measured deterministic workload, but resizing
is not required for cutover.

`log-smartmapper-dev` is not the workspace linked to `appi-smartmapper-dev`, and the SmartMapper App
Service, storage account and Foundry account currently have no diagnostic setting targeting it. Treat
it as a deletion candidate after confirming no resource outside this resource group sends logs there.

## Retention and limitations

One-use M.I.A. grants expire in two minutes. Quote-mapping capabilities expire in one hour; a redeemed
training capability expires after eight hours. Its value-free saved draft can be recovered with fresh
authorization. The API periodically purges expired job rows and preserves training rows in the same
table. Published mapping versions persist until a reviewed
archive/delete policy removes them. Default logs contain correlation IDs, stages, status/reason codes,
counts, and hashes rather than source or entered values.

Unseen conditional branches, changed carrier structures/options, inaccessible frames, closed shadow
roots, and unsupported custom widgets require training or human handling. Deterministic mapping does
not infer facts missing from M.I.A. and does not remove the user's final review responsibility.
