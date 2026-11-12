# M.I.A. SmartMapper POC

Extension **0.3.15** implements the fixed Louisiana Homeowners demo in
[ADR 0025](docs/adr/0025-home-demo-crosswalk.md), with M.I.A. quote selection and 52 source-backed
field recipes. Supported options and exact coverage conversions are entered and verified on the
page. Missing facts, ambiguous choices and unapproved defaults remain for review. Final actions
are manual. The earlier worksheet remains available under **Page reference**.

## Load and use

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `apps/extension-prototype/dist`. If already installed from
   this folder, click **Reload**, close the old side panel, and reopen it. Confirm **0.3.15**.
3. Open the supported LA/HO3LA quote page and click the **M.I.A. SmartMapper POC** toolbar icon.
4. Under **Smart Mapper**, click **Sign in to M.I.A.** and sign into `demo.mia.agency`. The verified
   handoff tab closes automatically; return to the quote tab.
5. Search for the demo client or quote number, select its Homeowners quote, and click **Map quote**.
6. Keep the tab active while mapping. Review the verified count and unresolved items. **Stop mapping**
   stops further work. Running again checks already-entered values. Same-URL native postbacks are
   re-observed; navigating elsewhere stops the run.

No M.I.A. main changes, SmartMapper catalog refresh or backend deployment is needed. The existing
extension quote API supplies the selected quote. Live custom masks and validation may require a
follow-up correction after supervised testing.

## Page reference

1. Choose **Page reference**, then **Read page data**. Cards and matching page numbers appear.
2. Select a **M.I.A. Homeowners field** at the bottom of each card. All 144 fields are available
   offline, including separate Applicant 1 and Applicant 2 fields. Leave unresolved fields unmapped
   or choose **No matching M.I.A. field**.
3. Click **Download mapping notes (.txt)** at the bottom of the panel. The file goes through Chrome's
   normal download flow into your configured Downloads folder (or its save-location prompt).
4. Reveal another section or question and read again. Unchanged controls keep their selections;
   replaced controls start unmapped. Download before navigating or closing the panel.

The panel lists labels, control types, required/optional status, hidden/disabled/read-only state,
structural names or IDs, and available dropdown/radio choices. It recognizes native fields, common
ARIA widgets, open shadow roots and accessible same-origin frames. It reads fields throughout the
loaded document, including fields below the viewport.

The reference reader does not enter values, check answers, click buttons, open dropdowns or submit forms. It
does not collect current input values or upload data. Results stay in panel memory until you choose
to download. The text file includes displayed page descriptions, name/ID hints, available choices,
selected M.I.A. source paths and unmapped entries; it contains no entered answers. Page-provided
descriptions may contain personal text. The file covers the current capture only. Numbers follow
visible controls on scroll; hidden controls have cards but no visible markers. Markers are replaced
on reread and removed on page reload.
The installed extension requests `activeTab`, `scripting`, `sidePanel` and `storage`. Its only
permanent host permission is the M.I.A. origin; carrier access uses the toolbar's temporary grant.
M.I.A. tokens stay in trusted session storage and source quotes stay in panel memory. Page reference
still works without signing in. Chrome-protected pages cannot be read.

Conditional fields that are not in the document, closed components, and protected embedded frames
may be unavailable. Custom dropdown choices must already exist in accessible page content. Reveal
them yourself and read again. Present but hidden controls are marked **Hidden**. Large-page limits
and inaccessible frames produce an explicit notice; the result is not a guarantee of complete site
coverage. See [ADR 0023](docs/adr/0023-local-page-reader.md) and
[ADR 0024](docs/adr/0024-local-mapping-notes.md). The bundled M.I.A. catalog is a snapshot of the local
Home form; later form changes need a refreshed snapshot and extension build.

## Development and checks

Use Node 24 and pnpm 11. Build with `pnpm build`; the ready-to-load extension is written to
`apps/extension-prototype/dist`. Defaults use the approved M.I.A. demo and fixed carrier origins.
Tests build isolated extensions for exact localhost origins. No SmartMapper backend is needed.

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Browser tests use localhost synthetic pages and an authenticated mock M.I.A. API. The demo test
covers sign-in, Home quote selection, mapping through a postback, changed/disabled options, read-back
and no consent/final actions. The page-reader tests exercise the installed build,
field and choice recognition, repeat reads, empty pages, frames, shadow roots, size limits, numbered
markers, source selection, selection retention and actual text downloads. They check absence of
entered values and assert that no carrier input or final-submit action occurs. The earlier
registry/executor remains in this repository for synthetic regression coverage; its UI tests build
with `vite.registry-test.config.ts` into ignored `.tools` directories. Those bundles are not part of
the installed reader. On Windows, the existing generated `artifacts` directory can trip typed lint;
`pnpm lint --ignore-pattern 'artifacts/**'` checks the project code without those local artifacts.

MIA_web_app/main and the live MIA-Chrome-Extension repository are unchanged. The former cloud
workflow is documented in the [historical registry setup](docs/SMARTMAPPER_V2_SETUP.md).
