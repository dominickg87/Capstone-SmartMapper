# SmartMapper 2.0 setup and deployment

This guide uses the resources Dom already provisioned. It does not create replacement resources
or modify the live M.I.A. Chrome Extension. Complete the local checks before publishing either backend.

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
3. Keep `resources/smartmapper/questions.json` and the form source files together in the release.
4. If Auto/Home form wording changes, regenerate using
   `node resources/smartmapper/generate-catalog.mjs`, inspect the diff, and run
   `php artisan test --compact tests/Feature/SmartMapperV2Test.php` before publishing.

Catalog drift blocks source access. No fallback fabricates a question label from a database key.
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

1. Open the backend's `/health`; expect `{"status":"ok","version":"2.0"}`. This verifies process startup,
   not the model/table/identity connections.
2. Run the localhost mock carrier and use the demo M.I.A. quote with synthetic data.
3. On the quote tab, **click the SmartMapper toolbar icon** to grant active-tab capture access.
4. Search and select the quote, then choose **Start mapping**.
5. Verify entries against the original M.I.A. facts. When SmartMapper stops, review, navigate yourself,
   and choose **Resume mapping**. It must not navigate or issue/submit the form itself.
6. Verify Pause during model processing, cancel, quote edits, expired/revoked sign-in, and tab changes.
7. Confirm the table holds checkpoint metadata/hashes and expiring capabilities, without screenshots
   or raw answer bundles. Screenshots and Q&A exist only in request memory; Responses uses `store:false`.
8. Confirm the Foundry deployment remains US Data Zone Standard. A resource's U.S. location alone
   does not establish processing residency for a Global deployment.

No live Azure inference, deployed identity/storage round trip or carrier acceptance test is implied by
the local test suite. The local browser tests intercept the named service origins and use synthetic data.
The deployment ZIP has been built and startup-tested locally on Windows; its Linux App Service startup
and managed identity connections still need the deployed checks above.

## Screenshots and conversation during testing

Chrome's `captureVisibleTab` captures the visible viewport of the active quote tab, as a JPEG. It does
not stitch the full page or crop each field. The model also receives structured control metadata and
the selected M.I.A. quote's questions and answers. Scrolling permits another observation of the newly
visible area. Playwright drives the local synthetic tests; it is not the runtime capturing the user's
browser and requires no Azure browser provisioning for this approach.

After starting a job, type freely into **Talk to SmartMapper** and click **Send message**. For example:
"That field is for the second driver. Explain which answer you used and recheck it."
Sending pauses mapping, captures the current page, fetches the current authorized source answers,
and asks the model for a conversational reply. A pending mapping proposal is invalidated. Chat itself
cannot execute browser actions. Continue the conversation or press **Resume mapping** when ready;
subsequent mapping requests include your guidance and still apply all source/policy/read-back checks.

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

Five attempts per control, 150 actions per page and 12 unchanged observations bound loops. Custom widgets
without observable selection, embedded frames and closed shadow DOM need human assistance. The semantic
fact checker is another fallible model call; it supplements provenance, policy and read-back and does not
eliminate the required human review. Cloud quota, model availability, RBAC propagation and real carrier
behavior must still be checked during the approved deployment/test session.

Implementation references: [Azure Responses](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses),
[Azure v1 API](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle),
[App Service Node configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs),
[Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
