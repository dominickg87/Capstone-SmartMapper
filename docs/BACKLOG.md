# Prioritized backlog

## Current baseline

[ADR 0018](adr/0018-human-trained-deterministic-mapping-registry.md) is the active POC decision.
SmartMapper uses a human-trained registry and deterministic browser execution. Model planning, PDF
interpretation, mapping chat, prompt work, suggestions, and model verification are retired from the
active backlog.

Implemented or in the 0.3.0 delivery:

- value-free Home and Auto M.I.A. catalogs with original questions and stable source paths;
- concrete and wildcard coverage for both Home applicants, five additional Auto drivers, and eight
  vehicles;
- separately authorized, verifier-bound mapping and training grants;
- strict workflow, training, disposition, transformation, mapping-profile, and lifecycle contracts;
- Azure Table stores for resumable jobs/drafts and immutable mapping versions;
- the provisioned `SmartMapperMappings` table in `stsmartmapperdevdg`;
- Map/Train panel modes, logical field capture, workflow-wide numbering, and linked page overlays;
- all explicit dispositions, typed transforms, repeated-entity bindings, publish/test/verify/activate
  lifecycle, and active-version resolution; and
- deterministic action compilation, provenance, local read-back, independent failure isolation,
  guarded ordinary Next/Continue, and human-only final actions.

## P0: complete and prove the 0.3.0 delivery

- Finish all repository format, lint, strict type, unit, build, and browser checks.
- Finish M.I.A. Pint and SmartMapper/extension API feature tests on `smartmapper2.0`.
- Cover logical radio grouping, stable signatures, overlay focus/accessibility, draft recovery, and
  stale revision handling.
- Cover every disposition and transformation with positive and prohibited-path tests.
- Add synthetic end-to-end Home and Auto workflows, including maximum supported repeated entities.
- Prove one failed field preserves successful independent receipts and continues safe sibling work.
- Prove testable mappings cannot verify without a completed bound proof job and cannot activate
  before verification.
- Prove final Submit, Bind, Issue, Sell, payment, consent, attestation, signature, CAPTCHA, MFA, and
  authentication controls are never activated.
- Record known limitations for frames, shadow roots, custom controls, conditional scenarios, and
  carrier layout changes.

Exit: all required checks pass, versions are incremented, behavior/failure paths are documented, and
the synthetic final-action assertions remain green.

## P0: deploy the deterministic POC

- Review and publish the M.I.A. `smartmapper2.0` branch through its normal release process.
- Run the quote-grant and training-grant tenant migrations for the approved demo tenant.
- Confirm the provisioned `SmartMapperMappings` table remains reachable through the App Service
  managed identity.
- Add `AZURE_STORAGE_MAPPINGS_TABLE=SmartMapperMappings` to `asp-smartmapper-dev`.
- Deploy the reviewed 0.3.0 backend ZIP and verify its `/health` build version.
- Rebuild/reload the 0.3.0 unpacked extension with exact M.I.A., backend, and approved carrier origins.
- Train a complete Home workflow and a complete Auto workflow, including conditional scenarios.
- Test each immutable version with representative demo quotes, verify the proof jobs, and activate.
- Confirm registry and checkpoint rows contain no quote answers, screenshots, HTML, tokens, or
  browser state.
- Run the separately authorized supervised carrier acceptance session and record coverage, precision,
  review recall, timing, and exceptions.

Exit: ordinary jobs resolve a verified active mapping and complete known independent fields without
any model configuration.

## P0: retire superseded cloud/runtime dependencies

- Remove the App Service's Azure OpenAI endpoint, deployment, and reasoning settings after cutover.
- Remove **Cognitive Services OpenAI User** from the SmartMapper App Service identity.
- Delete `smartmapper-astra-dev` after confirming the deterministic deployment has no caller.
- Disable or remove the separate legacy M.I.A. Smart Map endpoint/configuration before deleting
  `mia-smartmap-chat`; verify no unrelated caller first.
- Inventory every deployment before considering removal of the shared Foundry account/project.
- Keep the App Service, plan, storage account, both SmartMapper tables, system identity, Application
  Insights, and its linked workspace.

## P1: training and registry usability

- Add search/filter/grouping for the M.I.A. catalog without hiding question/entity context.
- Add clearer same-position previews for applicants, drivers, and vehicles.
- Add conditional-scenario coverage summaries and warn about trained pages that have not been proven.
- Add mapping-version comparison, activation history, rollback, and reviewed archive UX.
- Add accessible keyboard navigation between a panel row and its carrier-page badge.
- Add exportable redacted diagnostics containing signatures, version, statuses, and reason codes.
- Add trainer-facing detection for changed M.I.A. catalog revision and carrier page signature.

## P1: quality and operations

- Maintain a frozen synthetic acceptance suite and supported-field matrix per carrier workflow.
- Dashboard redacted mapping coverage, receipt success, review reasons, and page timing.
- Define alerting for registry lookup failures, storage errors, authorization failures, and unusual
  changed-page rates.
- Approve mapping-version retention, archive, rollback, deletion verification, and audit-access
  policy.
- Measure the deterministic App Service workload and resize the existing plan if justified.
- Complete disaster-recovery and mapping-table backup/restore exercises with synthetic records.

## P2: production integration

- Fold validated POC behavior into the live M.I.A. Chrome Extension only after review and UAT.
- Define production trainer roles separately from ordinary mapping users.
- Establish per-carrier written authorization, supported workflows, test accounts, and change owners.
- Add approved carrier workflows through Train rather than hardcoded browser adapters.
- Add another M.I.A. line of business only after it has a reviewed complete catalog, entity limits,
  fixtures, and acceptance criteria.
- Complete production privacy classification, retention, incident response, support access, and audit
  review.

## Deferred and out of scope

The remote worker remains a synthetic regression harness, not a current cloud-runtime deliverable.
Automatic final transactions, credential storage, CAPTCHA/MFA bypass, arbitrary scripts, and browser
profiles remain out of scope.

AI mapping fallback, document interpretation, and conversational mapping are not planned work under
ADR 0018. Reintroducing any of them requires a new reviewed ADR, privacy and cost review, explicit
product approval, independent fact checks, and complete regression evidence. Historical ADRs and Git
history preserve the experiments that led to the deterministic decision.
