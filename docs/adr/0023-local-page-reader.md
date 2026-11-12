# ADR 0023: Reduce the installed POC to a local page reader

- Status: Approved by Dom's November 12, 2026 request; extension 0.3.13.
- Supersedes ADR 0018's Map/Train interface and service requirements for the installed POC.

## Decision

The extension opens a tab-specific side panel with one button, **Read page data**. Clicking it
inspects the active bound tab and displays a numbered list of fields, labels, types, available
choices, required/disabled/read-only/visibility state, and structural names or IDs. Native radio
buttons are grouped by form, root and name; ARIA radio groups remain distinct. Native selects,
multiselects, datalists, common ARIA controls, text areas and editable regions are included.

The reader uses Chrome's temporary active-tab grant. The installed manifest has only `activeTab`,
`scripting` and `sidePanel`; it has no host permissions, auth content scripts or storage permission.
No M.I.A. sign-in, catalog, grant, backend, Azure service, registry, training or mapping job is involved.
M.I.A. `main` and the live M.I.A. extension remain untouched.

Read-only DOM inspection lives in the shared automation-core package. The function executes in
Chrome's isolated world and has no entry, click, navigation, expansion, submission or network path.
It reads labels and available choices rather than current field values or checked/selected state.
Hidden security inputs are excluded. Captured structure is held only in panel memory; it is not
logged, uploaded, downloaded or persisted. Readable labels and choices can contain page-provided
personal text, so the reader must not be reused as a persistence/export format without a separate
privacy review. React displays strings as text, never as markup.

Same-origin frames and open shadow roots are inspected. Other frames are counted as inaccessible.
Closed shadow roots, canvas-only controls, absent conditional branches and choices loaded only after
interaction cannot be enumerated. Present but hidden form controls are listed as hidden. The reader
does not claim exhaustive site coverage; the user reveals additional content and reads again.
Scanning is bounded to 30,000 elements, 1,500 fields, 500 choices per field and 10,000 choices overall.
Limit hits and inaccessible content produce explicit notices. Navigation clears prior results;
active-tab/origin changes during a read reject its output. Missing permission produces an actionable
message without raw browser-error details.

## Retained regression code

The registry and executors remain as synthetic regression code. Existing registry UI tests use the
explicit `vite.registry-test.config.ts` build in ignored `.tools` folders. Its old auth and execution
bundles are not emitted by `pnpm build` or shipped in `apps/extension-prototype/dist`. The production
build contains only the reader panel and its toolbar background. Test-only code preserves previous
safety assertions without exposing retired flows in the installed extension.

## Validation

Local browser coverage exercises the actual permission-reduced installed extension, one-button UI,
no-service startup, field/choice recognition, repeated radio groups, dynamic recapture, empty pages,
hidden/disabled controls, open shadow roots, accessible/protected frames and size limits. It asserts
that entered values are absent from the panel, carrier input/click counts stay zero, and final submit
is never clicked. Client tests cover incorrect tabs, restricted pages, injection errors, navigation
races and strict result schemas. The legacy registry regression suite remains independent.
