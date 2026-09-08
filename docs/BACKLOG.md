# Prioritized backlog

Dependencies marked Dom block real integration but not generic mock/core work.

## Starting point and next work

The MIA Chrome extension in `apps/mia-chrome-extension` is the only extension and the development
base. It already provides sign-in/token handoff, quote selection, page reading, backend mapping,
staged filling, and reusable mapping templates. Its synthetic browser regression is the baseline.

1. Every teammate builds/loads this extension and follows its setup guide. Dom/API owner confirms
   the approved demo URL, account permissions, synthetic saved quotes, and deployed mapping routes.
2. Workstream A documents the existing side-panel/background/API messages and pins read/fill to the
   intended tab and job; reuse the current sign-in and quote flow.
3. Workstreams A/B route mappings through shared schema/policy validation and semantic source paths,
   then add provenance, normalized read-back, high-risk/legal stops, and resumable review state.
4. Workstream C verifies the demo API contract and tenant/token behavior; backend provider and
   data-handling details remain external dependencies. Keep the remote feasibility work secondary.

All extension features belong in the MIA app. The milestones below describe how to harden and extend
that existing workflow; they do not call for another extension scaffold.

## Milestone 0 — repository safety and team start

Critical path:

- Dom: transfer repository to M.I.A. organization and make it private.
- Dom: provide approved student usernames, permissions, CODEOWNERS, and branch-protection owner.
- Team: build/load the MIA extension on all three development machines and run the synthetic checks.
- Team: review PROJECT_SCOPE.md, DOM_NOTES.md, SECURITY.md, and ADRs.
- Dom/university: confirm dates, IP/NDA, presentation, and portfolio rules.
- Team: run a threat-model workshop and assign risk owners.

Exit: private protected repository, approved team access, green CI, assigned Week 1 work.

## Milestone 1 — requirements, contracts, and access

Critical path:

- Dom: choose initial line/state and two priority approved carriers or confirm mock-only milestone.
- Workstream B: refine normalized field dictionary and supported-field matrix from approved inputs.
- Workstream A: document the cloned MIA extension's integration boundary and shared-core wiring plan.
- Workstream C: document API/auth/tenant boundary and submit Azure/access requests.
- Team: approve synthetic acceptance fixture set and baseline measurement method.

Early risk spikes:

- Carrier agreements/sandbox availability.
- Iframe/shadow DOM and changed-layout recognition.
- Extension service-worker suspension and tab recovery.

## Milestone 2 — Week 3–4 technical spikes and decision gate

- Workstream A: add durable tab/job state and pause/resume to the MIA active-tab workflow.
- Workstream B: first adapter and dynamic-row spike in mock lab.
- Workstream C: remote login/MFA/session/handoff/cost/isolation spike.
- Team: score every remote decision-matrix criterion with evidence.
- Dom/technical/security owners: decide proceed, constrain, redesign, or defer remote mode.

Dependencies on Dom: test authorization, accounts, network, credential owner, remote session policy,
Azure subscription/region/budget, and exact decision owner.

## Milestone 3 — primary local workflow

- Connect the MIA extension to shared policy, workflow state persistence, and stale-page recovery.
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
- Harden the established demo M.I.A. API integration and shared provider boundary with short-lived auth.
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

| Owner                    | Tasks                                                                                                                     | Evidence by end of week        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Student A / Workstream A | Build/load MIA extension, run sign-in/quote/fill regression, document side-panel reload/state gaps and core integration   | Demo and issue list            |
| Student B / Workstream B | Review contracts/adapters, expand synthetic field matrix, test changed layouts/repeated rows, calculate baseline metrics  | Contract PR and metric sheet   |
| Student C / Workstream C | Run API/worker, diagram isolation and handoff, compare queue/host candidates, draft remote spike protocol and cost inputs | Spike plan and architecture PR |
| Shared                   | Threat model, Dom worksheet review, CI on each machine, weekly demo, risk owner assignment                                | Signed notes with no secrets   |
