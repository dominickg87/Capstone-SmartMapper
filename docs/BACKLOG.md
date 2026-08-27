# Prioritized backlog

Dependencies marked Dom block real integration but not generic mock/core work.

## Milestone 0 — repository safety and team start

Critical path:

- Dom: transfer repository to M.I.A. organization and make it private.
- Dom: provide approved student usernames, permissions, CODEOWNERS, and branch-protection owner.
- Team: validate bootstrap on all three development machines and fix reproducibility issues.
- Team: review PROJECT_SCOPE.md, DOM_NOTES.md, SECURITY.md, and ADRs.
- Dom/university: confirm dates, IP/NDA, presentation, and portfolio rules.
- Team: run a threat-model workshop and assign risk owners.

Exit: private protected repository, approved team access, green CI, assigned Week 1 work.

## Milestone 1 — requirements, contracts, and access

Critical path:

- Dom: choose initial line/state and two priority approved carriers or confirm mock-only milestone.
- Workstream B: refine normalized field dictionary and supported-field matrix from approved inputs.
- Workstream A: map existing extension integration boundary without copying unrelated code.
- Workstream C: document API/auth/tenant boundary and submit Azure/access requests.
- Team: approve synthetic acceptance fixture set and baseline measurement method.

Early risk spikes:

- Carrier agreements/sandbox availability.
- Iframe/shadow DOM and changed-layout recognition.
- Extension service-worker suspension and tab recovery.

## Milestone 2 — Week 3–4 technical spikes and decision gate

- Workstream A: active-tab end-to-end spike with persisted pause/resume.
- Workstream B: first adapter and dynamic-row spike in mock lab.
- Workstream C: remote login/MFA/session/handoff/cost/isolation spike.
- Team: score every remote decision-matrix criterion with evidence.
- Dom/technical/security owners: decide proceed, constrain, redesign, or defer remote mode.

Dependencies on Dom: test authorization, accounts, network, credential owner, remote session policy,
Azure subscription/region/budget, and exact decision owner.

## Milestone 3 — primary local workflow

- Complete workflow state persistence and stale-page recovery.
- Implement first approved/mock adapter end to end.
- Add repeated drivers/vehicles, transformations, conditionals, and validation.
- Implement review UI with provenance and read-back status.
- Add audit completeness and redaction regression.

## Milestone 4 — second flow and resilience

- Add second adapter with materially different structure.
- Add layout mutation corpus, iframes/shadow cases if approved, and error recovery.
- Measure coverage, precision, review recall, and elapsed time.
- Complete notification choice and user-intervention UX.

## Milestone 5 — controlled AI fallback and integration

- Approve AI provider/data processing or retain deterministic mock.
- Add provider SDK only behind AiMapperProvider with schema and injection tests.
- Integrate approved development M.I.A. API with short-lived auth.
- Implement chosen remote proof of concept after the decision gate.
- Run resilience, cost, privacy, and artifact-retention validation.

## Milestone 6 — acceptance and handoff

- Security/compliance review and remediation.
- UAT with approved pilot users and synthetic/test data.
- Freeze accepted fixtures and metrics.
- Complete deployment/teardown/runbook, demo, known limitations, risk report, and backlog handoff.

## Stretch goals

- Additional mock mutation generator.
- Adapter authoring/diagnostic UI.
- Additional approved line/state after acceptance.
- Vision fallback with approved redaction/retention.
- Production-grade remote orchestration only if Week 4 evidence and core acceptance are strong.

## First-week assignments

| Owner                    | Tasks                                                                                                                       | Evidence by end of week        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Student A / Workstream A | Build/load extension, test state across popup close/reload, draft existing-extension questions, add accessibility test plan | Demo and issue list            |
| Student B / Workstream B | Review contracts/adapters, expand synthetic field matrix, test changed layouts/repeated rows, calculate baseline metrics    | Contract PR and metric sheet   |
| Student C / Workstream C | Run API/worker, diagram isolation and handoff, compare queue/host candidates, draft remote spike protocol and cost inputs   | Spike plan and architecture PR |
| Shared                   | Threat model, Dom worksheet review, CI on each machine, weekly demo, risk owner assignment                                  | Signed notes with no secrets   |
