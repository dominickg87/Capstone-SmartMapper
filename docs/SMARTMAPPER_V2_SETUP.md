# SmartMapper 2.0 setup and deployment

This guide uses the resources Dom already provisioned. It does not create replacement resources
or modify the live M.I.A. Chrome Extension. Complete the local checks before publishing either backend.

## Local testing without a production M.I.A. deployment

Build **0.2.5** defaults to PDF quote-sheet context. Apply the companion M.I.A. `smartmapper2.0`
changes for the capability-protected `quote-sheet` and `quote-sheet/metadata` endpoints.
No additional migration or Document Intelligence resource is needed. M.I.A. must be able
to generate its normal Home/Auto PDF; the existing local LibreOffice conversion is available.
`VITE_SMARTMAPPER_SOURCE_FORMAT=questions` retains the earlier catalog flow only when explicitly
selected for regression testing. Rebuild the extension when changing this setting.

Reload the unpacked extension and verify **0.2.5** in the panel. The backend `/health` must also
report `buildVersion: "0.2.5"`. Start a new job after restarting the memory-backed local API.
Click the toolbar icon on the carrier tab: the panel now stays with that tab and disappears
when you switch away. Activating it on another tab disables the previous tab's panel.
Cancel the old job before mapping a different carrier. No live repository or Azure deployment
is performed by the local build; publish both companion backends before using this mode remotely.

Dom's local agency is `https://admin.mia.test`, served by existing Laravel Herd. Its tenant ID is
`36f643ca-b227-4140-bfbe-f06180b1f966`; the local user ID is `1`. These differ from the production
demo IDs. The local M.I.A. application uses its existing SQLite database. Only the SmartMapper
authorization-table migration is needed in that tenant; do not run a database reset or seed over
existing local data. M.I.A. middleware rejects disabled or unlisted tenants before grant-table access.

The current ignored extension `.env.local` selects:

```dotenv
VITE_SMARTMAPPER_BACKEND_ORIGIN=http://127.0.0.1:4300
VITE_SMARTMAPPER_MIA_ORIGIN=https://admin.mia.test
VITE_SMARTMAPPER_ALLOW_ANY_CARRIER=true
VITE_SMARTMAPPER_CARRIER_ORIGINS=http://localhost:4173,http://127.0.0.1:4173,https://www.alliedtrustagents.com
```

The local M.I.A. `.env` needs `SMARTMAPPER_ENABLED=true`, the local tenant/user principal above,
`SMARTMAPPER_ALLOW_ANY_CARRIER=true`, the same localhost carrier origins, and the POC extension
origin appended to `CORS_ALLOWED_ORIGINS`.
Those settings apply to the local M.I.A. checkout, independently of Azure's demo configuration.

Create ignored `apps/orchestrator-api/.env.development.local` with:

```dotenv
NODE_ENV=development
SMARTMAPPER_CHECKPOINT_STORE=memory
SMARTMAPPER_ALLOW_ANY_CARRIER=true
SMARTMAPPER_AUTO_NEXT=true
SMARTMAPPER_API_PORT=4300
AZURE_OPENAI_BASE_URL=https://foundry-smartmap-prod.services.ai.azure.com/openai/v1/
AZURE_OPENAI_MODEL_DEPLOYMENT=smartmapper-astra-dev
SMARTMAPPER_DEFAULT_REASONING_EFFORT=low
SMARTMAPPER_ESCALATION_REASONING_EFFORT=max
SMARTMAPPER_EXTENSION_IDS=njdbagmlilnljlgjbldeleblkjmokelf
SMARTMAPPER_MIA_ORIGINS=https://admin.mia.test
SMARTMAPPER_ALLOWED_PRINCIPALS=36f643ca-b227-4140-bfbe-f06180b1f966/1
SMARTMAPPER_CARRIER_ORIGINS=http://localhost:4173,http://127.0.0.1:4173,https://www.alliedtrustagents.com
```

Build 0.2.5 uses `low` reasoning for the current local speed trial; failed browser entries still
escalate planning to `max`. The configuration also accepts `medium`, `high` and `max`; an unset
default still selects `high`, preserving existing Azure deployments. Astra, US processing,
independent visual source verification and browser read-back remain in place.

The earlier 0.2.3 synthetic eight-field comparison measured 26.5s before and 12.9s after for planning plus
verification, excluding browser entry. This is approximately 2x, not a 10x or live-carrier guarantee.
The development API logs only stage timing, token counts and a validated service-tier label to
`.tools/local-runtime/api.stdout.log`; it never logs prompts, answers or screenshots. Application
Insights receives stage duration when configured. These measurements help diagnose the next test.
See ADR 0011. Reload the unpacked extension after building and start a new job after restarting
the memory-backed API; verify **0.2.5** in the panel and `/health`. Whole-page
planning, repair and ordinary Next/Continue remain under ADR 0012. `SMARTMAPPER_AUTO_NEXT=true` opts in;
its unset default remains false, so existing Azure settings do not silently enable navigation.

Build with `pnpm build`. Start the backend and synthetic carrier lab from PowerShell in Smart-Mapper:

```powershell
.\apps\orchestrator-api\start-local.ps1
```

The launcher starts hidden local processes, records their PIDs in `.tools/local-runtime/processes.json`,
and uses Herd's public CA certificate for Node HTTPS trust. TLS verification remains enabled.
It does not start or change Herd. The backend listens only on `127.0.0.1:4300`; memory checkpoints
are rejected outside `NODE_ENV=development`. Azure deployments default to Azure Table storage.
Local jobs survive extension-worker/panel restarts, but restarting the local backend loses the jobs.
No source answers or screenshots are written to a local job database.

Azure model calls use the local developer's existing Azure CLI sign-in through `DefaultAzureCredential`.
This is separate from the App Service managed identity. Dom's existing Foundry access was verified
with a synthetic text inference on October 1. No API key or new cloud resource is required for this
local configuration. A successful text check does not establish end-to-end mapping quality.

Reload the existing unpacked extension, reconnect to the local M.I.A. account, and open
`http://127.0.0.1:4173/modern`. Click the extension toolbar icon on that tab, choose a local Auto/Home
quote with test data, and start mapping. Use the chat and review entries. Ordinary Next/Continue can
run automatically after a clean page review; unresolved questions and final actions require you.
The deployed Azure backend cannot directly reach your computer's `admin.mia.test`; the local backend
is what makes this path work without a public tunnel.

Dom approved his own supervised testing across carrier websites. Any-carrier mode accepts new HTTPS
origins without editing the site lists. It defaults off and only runs in local M.I.A. / development
backend environments. Listed localhost HTTP pages remain available for synthetic tests.
The extension requests permanent host permissions only for its backend and M.I.A.; the carrier tab
uses Chrome's temporary `activeTab` permission. After rebuilding, reload the unpacked extension,
open the carrier quote page and click its toolbar icon before starting. Click the icon again after
moving to a different site. Each job stays bound to its original tab and origin; cancel it and start
a new job when changing carriers. Dom signs in, reviews and performs final actions.
The agent does not open or operate live carrier sites. Browser-internal and non-HTTPS carrier pages
are not enabled. See ADR 0008.

To return to the deployed POC later, restore the Azure backend and `https://demo.mia.agency` origins
in the extension build configuration, rebuild/reload, and reconnect. The local setup does not
publish the M.I.A. changes or alter the Azure app settings.

## Existing Azure resources

| Setting                   | Value                                                                          |
| ------------------------- | ------------------------------------------------------------------------------ |
| Subscription              | `47b7b9c8-dd15-407c-a380-f033eac1ad92`                                         |
| Entra tenant              | `5ed8dddb-bd93-4e03-ac75-2fb1885da769`                                         |
| Resource group            | `rg-mia-smartmap-prod`                                                         |
| Region                    | East US                                                                        |
| Web App                   | `asp-smartmapper-dev`                                                          |
| Backend origin            | `https://asp-smartmapper-dev-fgbqddfbewfrd2at.eastus-01.azurewebsites.net`     |
| Demo M.I.A. origin        | `https://demo.mia.agency` (confirmed October 1, 2026)                          |
| System identity object ID | `b2eb29f4-7df6-419f-9057-1dc74ad33e3a`                                         |
| Foundry account / project | `foundry-smartmap-prod` / `proj-smartmap`                                      |
| Deployment                | `smartmapper-astra-dev`                                                        |
| Model settings            | gpt-6-astra; US Data Zone Standard; 200K TPM / 200 RPM; upgrade to new default |
| Storage / table           | `stsmartmapperdevdg` / `SmartMapperJobs`                                       |
| Monitoring                | `log-smartmapper-dev` / `appi-smartmapper-dev`                                 |

The managed identity already has **Cognitive Services OpenAI User** on the Foundry parent resource
and **Storage Table Data Contributor** on the storage account. No API keys, database, VPN,
private endpoint, Foundry Agent Service, vector index or project SDK is required by this implementation.
The OpenAI SDK calls `/openai/v1/responses`; the Foundry project endpoint is not its base URL.

## 1. Configure and publish the M.I.A. integration

Use `MIA_web_app` branch `smartmapper2.0`. The changes add routes without replacing existing extension APIs:

| Method and path under `/api/extension/smartmapper/v2` | Purpose                                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /quotes/{quote}/grants`                         | Existing M.I.A. extension token authorizes a quote-specific, verifier-bound grant                                    |
| `POST /redeem`                                        | Azure exchanges the one-use grant for a short-lived source capability                                                |
| `GET /source`                                         | Rechecks token revocation, quote ownership, subscription and demo scope, then returns original questions and answers |
| `GET /quote-sheet/metadata`                           | Rechecks authorization and returns the current PDF source revision without generating the document                   |
| `GET /quote-sheet`                                    | Rechecks authorization, generates the selected Home/Auto PDF and returns bound content with its digest               |
| `DELETE /source`                                      | Revokes the capability                                                                                               |

Set these in the M.I.A. deployment's private environment configuration:

```dotenv
SMARTMAPPER_ENABLED=true
SMARTMAPPER_ALLOWED_PRINCIPALS=DEMO_TENANT_ID/DEMO_USER_ID
SMARTMAPPER_CARRIER_ORIGINS=http://localhost:4173,http://127.0.0.1:4173
```

Use the actual **M.I.A. tenant ID and user ID**, not the Azure Entra IDs. For an approved carrier test,
replace or extend the exact carrier origins in all three configurations (M.I.A., Azure backend,
extension build). No wildcard host or account is enabled by default.

Append `chrome-extension://YOUR_POC_EXTENSION_ID` to M.I.A.'s existing `CORS_ALLOWED_ORIGINS`
setting. Preserve the existing live-extension origins. Use a comma to separate entries.
The tenant hostname alone does not establish its internal tenant ID; obtain the scope after sign-in
using the procedure below.

After deploying the reviewed M.I.A. branch through its existing deployment process:

1. Run the tenant migration using the application's normal tenant migration process. For only the
   demo tenant: `php artisan tenants:migrate --tenants=DEMO_TENANT_ID --force`.
2. Run `php artisan config:cache` through the normal deployment process.
3. Keep the existing document generators and templates together in the release; verify normal
   Home/Auto PDF generation and the production document converter configuration. The PDF change
   adds no migration beyond the initial SmartMapper grant-table migration.
4. Run `php artisan test --compact tests/Feature/SmartMapperV2Test.php` before publishing.
5. For legacy `questions` mode, keep `resources/smartmapper/questions.json` with its form sources.
   If Auto/Home form wording changes, regenerate using
   `node resources/smartmapper/generate-catalog.mjs`, inspect the diff, and run
   `php artisan test --compact tests/Feature/SmartMapperV2Test.php` before publishing.

In legacy `questions` mode, catalog drift blocks source access. PDF mode does not use this catalog.
No fallback fabricates a question label from a database key.
The catalog covers current English source components; unresolved dynamic conditions are human-only.
Existing quotes do not retain historical question wording, so this catalog cannot establish exactly
what an older form displayed when the answer was entered.
The existing M.I.A. connection endpoint revokes older extension tokens when reconnecting the same
account. Plan the demo sign-in accordingly when another extension is using that account.

## 2. Build and load this POC extension

1. Copy `apps/extension-prototype/.env.example` to `.env.local` in the same folder.
2. Set `VITE_SMARTMAPPER_MIA_ORIGIN=https://demo.mia.agency`. This is the confirmed demo agency
   origin; do not substitute the central login domain.
3. Keep the provided Azure backend origin. Keep carrier origins localhost until the test task is approved.
4. Run `pnpm build` from Smart-Mapper.
5. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select
   `apps/extension-prototype/dist` from this repository.
6. If this extension was already loaded, click its **Reload** button in `chrome://extensions` after
   rebuilding, then close and reopen its side panel.
7. Click Chrome's puzzle-piece icon beside the address bar, pin **SmartMapper**, then click its icon.
8. Choose **Connect to M.I.A.** and complete normal sign-in at the demo agency.
9. Return to the side panel, expand **Connection details**, and click **Copy connection details**.
   This copies the extension ID, M.I.A. tenant/user ID and configured M.I.A. URL. Use these IDs in
   the Azure and M.I.A. settings. No developer console is needed and no token is copied.

Connection details and job credentials are held in trusted extension session storage and disappear
when the browser session ends. Reopen the panel after a worker restart and explicitly Resume.

## 3. Finish the Azure Web App settings

Azure Portal → **App Services** → **asp-smartmapper-dev** → **Settings → Environment variables**.
Keep the model/storage/reasoning settings already entered. Add:

| Name                             | Value                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `SMARTMAPPER_EXTENSION_IDS`      | Exact unpacked extension ID; comma-separated if multiple approved developers |
| `SMARTMAPPER_MIA_ORIGINS`        | `https://demo.mia.agency`                                                    |
| `SMARTMAPPER_ALLOWED_PRINCIPALS` | `DEMO_TENANT_ID/DEMO_USER_ID` from M.I.A.                                    |
| `SMARTMAPPER_CARRIER_ORIGINS`    | Same approved origins as the extension and M.I.A. settings                   |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` for the prebuilt ZIP below                                           |

Choose **Apply**. Missing scope settings deliberately prevent startup.

Under **Configuration → General settings**, use **Node 24 LTS**, Linux, **Always On**, HTTPS Only,
TLS 1.2 or higher, and startup command **`node dist/server.js`**. Retain the separate App Service plan.
Use the application's SDK telemetry configuration rather than enabling a second automatic monitoring
agent. The SDK records status counts and cleanup failures; request bodies, prompts, images and
dependency payloads are not collected by this application.

The extension uses its existing M.I.A. sign-in and short-lived job credentials. An additional App Service
Easy Auth login provider is not part of this flow; enabling mandatory Easy Auth would require a separate
token integration. The public HTTPS endpoint still requires application authorization for every job.

## 4. Package the backend

Run in Smart-Mapper after the required checks pass:

```powershell
.\apps\orchestrator-api\package-app-service.ps1
```

This creates a timestamped `artifacts/smartmapper-api-*.zip`, including production dependencies and
compiled shared packages. No source answers, environment files, Azure credentials or browser profiles
are included. The ZIP root must contain `package.json`, `dist/server.js` and `node_modules`.

Publishing is a separate action. With Azure CLI installed and signed in, the reviewed package can be
published without basic deployment authentication:

```powershell
az login --tenant 5ed8dddb-bd93-4e03-ac75-2fb1885da769
az account set --subscription 47b7b9c8-dd15-407c-a380-f033eac1ad92
az webapp deploy --resource-group rg-mia-smartmap-prod --name asp-smartmapper-dev --type zip --src-path 'FULL_PATH_TO_REVIEWED_ZIP'
```

Use `server.js` as the Azure startup entry point. The old `legacy-server.js` is only a local synthetic
regression harness; its unauthenticated v1 routes are not enabled by the v2 server.

The October 1 chat implementation requires rebuilding/reloading the extension and publishing a new
backend ZIP together. A September 30 ZIP does not contain the chat route. No additional Azure resource,
key, environment variable or M.I.A. database change is required specifically for chat.

## 5. Verify the deployed POC

1. Open the backend's `/health`; expect `status: "ok"`, protocol `version: "2.0"`, and `buildVersion`
   matching the deployed backend's package.json version. This verifies process startup,
   not the model/table/identity connections.
2. Run the localhost mock carrier and use the demo M.I.A. quote with synthetic data.
3. On the quote tab, **click the SmartMapper toolbar icon** to grant active-tab capture access.
4. Search and select the quote, then choose **Start mapping**.
5. Verify entries against the original M.I.A. facts. With automatic Next enabled, confirm ordinary
   navigation runs only after a clean review. When SmartMapper needs help, review and choose
   **Resume mapping**. It must never bind, issue, sell, authorize consent or perform final submission.
6. Verify Pause during model processing, cancel, quote edits, expired/revoked sign-in, and tab changes.
7. Confirm the table holds checkpoint metadata/hashes and expiring capabilities, without screenshots
   or raw answer bundles. Screenshots and Q&A exist only in request memory; Responses uses `store:false`.
8. Confirm the Foundry deployment remains US Data Zone Standard. A resource's U.S. location alone
   does not establish processing residency for a Global deployment.

No live Azure inference, deployed identity/storage round trip or carrier acceptance test is implied by
the local test suite. The local browser tests intercept the named service origins and use synthetic data.
The deployment ZIP has been built and startup-tested locally on Windows; its Linux App Service startup
and managed identity connections still need the deployed checks above.

Before each application handoff, increment the affected app's package.json version. The extension
manifest uses this value automatically. After reloading at `chrome://extensions`, the side-panel
header and Chrome's extension card show the installed version; **Copy connection details** includes
it too. The backend's `/health` reports its own `buildVersion`. A source edit alone does not update
an already loaded extension or running backend; rebuild and reload/restart the affected app.
Release numbers are independent of the `2.0` API/schema version.

## Screenshots and conversation during testing

Build 0.2.5 expands recognized sections and plans up to 48 independent native fields across the
current page using the PDF quote sheet. A separate model call checks their source facts against
the original PDF. The extension enters them
sequentially with per-field read-back and progress. Changed labels/options/layout, new controls or
postbacks discard the remaining plan and trigger reinspection. Failed read-back and missing facts
pause for review. Dependent choices and custom controls remain single interactions. After a clean
page review, the backend may authorize a recognized same-origin Next/Continue. No final commitment
is automated. Reload the extension and restart/update the backend together when adopting this build.

Chrome's `captureVisibleTab` captures the top viewport and additional viewports needed for unlabeled
or custom controls. Clearly labeled native controls use the complete DOM inventory without requiring
a screenshot of every section. Up to 12 images carry their document offsets; controls use document
coordinates. The page returns to its top after inspection. The model receives those images,
structured page text and controls, and the selected M.I.A. quote's PDF. Recognized native details and
explicit ARIA button disclosures expand automatically. Custom accordions and nested scroll regions
may need manual expansion. Incomplete capture prevents automatic Next. Playwright drives the local
synthetic tests; the user's browser needs no Azure browser provisioning for this approach.

The independent fact check receives the same current page images and control manifest as the
planner, together with the original PDF and the proposed question/answer/page citations. This lets
it interpret plain text beside legacy inputs that lack associated DOM labels. It receives no planning
conversation as evidence and still rejects ambiguous targets, different people/vehicles, and changed
facts. Review messages distinguish missing question context, answer mismatch, unavailable source,
uncertainty, unsupported controls and human-only actions. No screenshot or target wording is persisted
for these diagnostics. A synthetic browser regression covers unlabeled name boxes and a second applicant;
passing it does not establish acceptance on a particular live carrier. After browser entry, a clean
unchanged page whose editable fields all match verified receipt hashes can complete without another
AI planning call; newly revealed fields and changed content require a fresh plan.

Clicking the toolbar icon opens the panel only on that tab. Activating it on another tab moves it
there. Switching to unrelated tabs hides it; changing the carrier origin disables it. An existing
mapping job remains bound to its original tab and quote, so cancel it before starting on another carrier.

After starting a job, type freely into **Talk to SmartMapper** and click **Send message**. For example:
"That field is for the second driver. Explain which answer you used and recheck it."
Sending pauses mapping, captures the current page, reauthorizes access to the selected PDF,
and asks the model for a conversational reply. A pending mapping proposal is invalidated. Chat itself
cannot execute browser actions. Continue the conversation or press **Resume mapping** when ready;
subsequent mapping requests include your guidance and still apply all source/policy/read-back checks.

For a review item, **Suggest a match** asks chat to explain the best PDF-supported interpretation
without entering it. You can enter the answer yourself on the carrier page, then choose **Skip this
field**. The backend leaves that control alone and continues mapping other fields. A skip applies
only to this page and control layout; start a new job to discard it. Required blanks, validation
errors and final commitments still require human attention.

The latest ten exchanges (up to 4,000 characters per message) are kept with the job in trusted
in-memory Chrome session storage. They survive closing/reopening the panel, but not cancellation,
clearing the guidance, or ending the browser session. Expired jobs lose their chat when detected.
Chat is sent to the configured model with `store:false`, is not written to Azure checkpoints or default
logs, and is not permanent model training or an automatic code/prompt change. Text may contain values
typed by the human or repeated by the assistant; do not treat it as a redacted audit record.
**Clear chat guidance** removes it from later requests. Durable improvements require reviewed changes
to the shared prompt or code and regression tests. Correct missing source facts in M.I.A. and start a
new job; chat cannot replace authoritative quote answers or authorize prohibited actions.

## Retention and limitations

One-use grants expire in two minutes. Jobs and source capabilities expire in one hour. The running Azure
service purges expired rows every five minutes; downtime delays physical deletion. Cancel deletes the
checkpoint and revokes its source capability. M.I.A. removes expired grant metadata on subsequent grant
issuance within that tenant; those rows contain hashes and scope IDs, not answer data. Broader operational
retention and production audit policy remain decisions for the later production integration.

Eight inspection passes per page, 20 automatic transitions per job, five attempts per control,
150 actions per page and 12 unchanged observations bound loops. Custom widgets
without observable selection, embedded frames and closed shadow DOM need human assistance. The semantic
fact checker is another fallible model call; it supplements provenance, policy and read-back and does not
eliminate the required human review. Cloud quota, model availability, RBAC propagation and real carrier
behavior must still be checked during the approved deployment/test session.

Implementation references: [Azure Responses](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses),
[Azure v1 API](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle),
[App Service Node configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs),
[Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
