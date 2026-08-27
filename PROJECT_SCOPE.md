# M.I.A. SmartMapper — Project Scope and Working Charter

## 1. Document control

| Field           | Value                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Project         | M.I.A. SmartMapper                                                                                                 |
| Status          | Draft working charter; product-owner approval pending                                                              |
| Product owner   | Dom                                                                                                                |
| Contributors    | Three software-engineering students — names TBD — Dom                                                              |
| Technical owner | TBD — Dom                                                                                                          |
| Last updated    | 2026-08-27                                                                                                         |
| Delivery window | Four months / 16 weeks; exact dates TBD — Dom                                                                      |
| Change process  | Issue and reviewed pull request; update affected requirements, backlog, tests, and ADR for cross-cutting decisions |

Dom approves product scope, carrier priorities, access, and acceptance. The technical owner approves
architecture and operational readiness. Security/compliance reviewers approve data handling and
carrier-use boundaries. This document is versioned with code; a scope change is not complete until its
impact, owner, acceptance criteria, and schedule are recorded.

## 2. Executive summary

SmartMapper reduces repeated manual entry during insurance quote intake. It retrieves an approved,
normalized quote/client record from M.I.A., recognizes the current page in a supported carrier
workflow, maps source fields through a versioned adapter, enters only supported answers, reads them
back, and surfaces uncertainty for human review. It always stops before submission, binding,
purchase, signature, attestation, consumer-report authorization, or other legal action.

The capstone builds one shared core and two execution adapters. Local active-tab mode runs through the
M.I.A. Chrome extension in the user's authenticated carrier tab and is the primary delivery path.
Remote-browser mode runs a queued job in an isolated browser and is a feasibility proof of concept
subject to a Week 4 decision gate. The bootstrap uses synthetic data and local mock carriers only.

## 3. Problem statement

M.I.A. quoting users repeatedly copy the same applicant, driver, vehicle, property, prior-insurance,
and requested-coverage facts into carrier sites. Carrier workflows differ in pages, language,
controls, conditional questions, validation, ordering, and authentication. Manual duplication costs
time and introduces transposition, omission, stale-data, and target-field errors.

A static universal form filler is insufficient. An unrestricted AI browser agent would create
unacceptable uncertainty and authorization risk. SmartMapper needs deterministic carrier knowledge,
semantic resilience, controlled fallback reasoning, field provenance, normalized read-back, a
resumable job, and explicit human review.

## 4. Product principles

1. Accuracy over speed. No entered value is preferable to a plausible but unsupported value.
2. Deterministic rules before semantic matching, AI, or vision.
3. Human review before every final carrier action and whenever confidence or authority is inadequate.
4. No silent guesses, defaults, or material underwriting substitutions.
5. Security and privacy by design: least privilege, short retention, isolation, and redacted logs.
6. One shared core, two executors; adapter knowledge stays independent of execution environment.
7. Every action has source provenance or an explicit approved deterministic rule.
8. Every entered value is read back and normalized when technically possible.
9. Safe degradation: unsupported, changed, missing, or conflicting data becomes a review item.
10. Development and tests work without a live AI provider or real carrier traffic.

## 5. Primary users and stakeholders

- M.I.A. quoting users operate carrier sessions, resolve questions, and perform final submission.
- Dom is product owner and approves scope, priorities, access, and acceptance.
- Three capstone engineers implement and demonstrate the system.
- The M.I.A. technical owner approves integration, deployment, and operational ownership.
- Security, privacy, compliance, and legal reviewers approve data handling and per-carrier use.
- Carrier contacts may clarify authorized automation, sandbox access, and test-account constraints.

## 6. Target user journeys

### Local active-tab mode

1. The user signs into a supported carrier normally, including manual MFA or CAPTCHA.
2. The user starts a new quote in a carrier tab.
3. The M.I.A. extension identifies the active tab and shows carrier/page detection.
4. The user selects an authorized M.I.A. quote/client record.
5. The extension requests a short-lived normalized payload through the approved backend boundary.
6. ExtensionExecutor snapshots semantic DOM/accessibility information and locks work to that tab/job.
7. The versioned carrier adapter recognizes the page and proposes deterministic actions.
8. Policy validates each action; source resolution occurs only immediately before entry.
9. The extension enters supported fields, reads them back, records redacted audit results, and moves
   page by page.
10. Navigation/reload persists a resumable checkpoint outside transient service-worker memory.
11. Missing, conflicting, unsupported, ambiguous, high-risk, or low-confidence fields pause or create
    visible review items.
12. Authentication, disclosures, legal acknowledgements, and unexpected pages pause for the user.
13. At the final review boundary, automation stops and notifies the user.
14. The user reviews carrier data and manually performs any allowed final action.

### Queued remote-browser mode

1. The user selects an M.I.A. quote and an approved supported carrier.
2. M.I.A. creates a versioned job and places its reference on an approved queue.
3. A worker host claims the job and provisions an isolated tenant/user/carrier/job session.
4. The worker retrieves short-lived data and launches the supported interactive or browser runtime.
5. RemoteBrowserExecutor uses the same adapter, policy, source paths, and read-back logic.
6. Login, MFA, CAPTCHA, ambiguity, disclosure, or changed-page detection pauses the job.
7. A short-lived authenticated handoff lets the user resume the exact isolated session.
8. The worker persists progress independently of process lifetime and applies expiration rules.
9. When safe preparation is complete, M.I.A. sends a PII-minimized ready-for-review notification.
10. The user reviews the same session and manually performs final submission.
11. The session closes and approved short-lived artifacts are deleted and deletion is verified.

## 7. Recommended delivery strategy

Local mode is the capstone's primary path because it reuses the user's authenticated session, keeps
actions visible, simplifies human intervention, and can integrate with the existing extension.
Remote mode is an early spike and secondary proof of concept, not a parallel product.

By the end of Week 4 the team will recommend proceed, constrain, redesign, or defer for remote mode.
Evidence must cover login/MFA, persistent sessions, secure review handoff, carrier compatibility,
observed bot detection without bypass attempts, credential exposure, cost, concurrency, isolation,
operational complexity, and failure recovery. If remote feasibility is poor, its abstraction and
findings remain deliverables while effort returns to local accuracy and resilience.

## 8. In-scope capstone deliverables

- One Dom-approved initial line of business.
- Two approved carrier workflows, or two materially different mock carriers until access is approved.
- A strict normalized quote contract with versioning and field provenance.
- A versioned carrier adapter framework and maintenance workflow.
- A Manifest V3 local extension prototype.
- A remote browser worker proof of concept behind the shared Executor interface.
- Resumable jobs with start, pause, resume, cancel, expiration, failure, and review states.
- Deterministic mapping, semantic fallback, controlled AI mapping interface, and mock provider.
- Post-entry read-back, validation, unresolved items, and redacted audit trail.
- Local mock carrier lab, regression fixtures, layout mutation, and browser tests.
- Architecture, adapter, data, security, test, backlog, ADR, deployment/handoff, and known-risk docs.

No production carrier integration enters scope until repository privacy, authorization, test accounts,
and applicable agreements are approved.

## 9. Explicit non-goals

- Supporting every carrier, state, line of business, page, or field.
- Quote submission, purchase, binding, signature, attestation, consent, or legal acceptance.
- CAPTCHA solving, MFA bypass, anti-bot bypass, access-control bypass, or terms circumvention.
- Unattended use of shared or production carrier credentials.
- Production credential migration or secret storage in this repository.
- Self-modifying adapters, arbitrary model-generated JavaScript, or arbitrary navigation.
- Inferring missing material underwriting facts.
- Perfect zero-maintenance carrier support.
- Building production Azure infrastructure during bootstrap.

## 10. Functional requirements

FR-1: Search/select an authorized quote through MiaQuoteProvider and retrieve a validated payload.
FR-2: Detect allowed carrier, line, adapter version, and current page from stable semantic signals.
FR-3: Track multi-page progress with resumable checkpoints and page fingerprints.
FR-4: Support indexed drivers, vehicles, properties, and other repeated records.
FR-5: Apply documented deterministic transforms and carrier option mappings.
FR-6: Evaluate conditional questions without assuming absent answers.
FR-7: Validate action schema/policy before execution and target only allowed origins.
FR-8: Read back each entered value and compare using field-appropriate normalization.
FR-9: Surface page validation errors and unresolved source/target conditions.
FR-10: Start, pause, resume, cancel, expire, and recover interrupted jobs.
FR-11: Pause for login, MFA, CAPTCHA, disclosures, ambiguity, and changed pages.
FR-12: Notify users of waiting, failure, and ready-for-review states without PII.
FR-13: Accept a human response tied to a specific review item and resume safely.
FR-14: Produce a redacted review summary and complete action audit trail.
FR-15: Stop before prohibited controls and prove the final mock submit was never clicked.
FR-16: Fail closed on unsupported domains, adapters, actions, versions, or stale state.

## 11. Nonfunctional requirements

- Accuracy: accepted metrics in Section 21; no silent material substitution.
- Reliability: idempotent checkpoints, explicit retries, lease/expiration, and deterministic replay
  boundaries.
- Security: least privilege, allowlisted origins/actions, validation, secret indirection, and review.
- Privacy: semantic identifiers where possible, no production data for students, redacted telemetry,
  encrypted approved transport/storage, and short retention.
- Maintainability: small typed packages, stable adapter contracts, ADRs, fixtures, and regression tests.
- Observability: reason-coded state/action events with hashes, not raw values.
- Performance: measure local and remote separately; never trade correctness for speed.
- Portability: core has no Chrome/Playwright types; hosting remains replaceable.
- Accessibility: extension status and review UI must support labels, keyboard, focus, and live status.
- Cost awareness: remote spike records per-job and idle cost with budget/teardown controls.

## 12. Architecture overview

MiaQuoteProvider supplies a versioned normalized payload. An orchestrator creates QuoteJob state and
selects an approved CarrierAdapter. The executor captures CarrierPageSnapshot. The adapter recognizes
PageFingerprint and provides mappings, transformations, conditional rules, validation expectations,
and stop points. AutomationCore validates confidence/risk and AutomationAction policy. The executor
resolves the semantic source path to a value, performs the allowlisted action, reads it back, hashes
the normalized observation, and writes AuditEvent and ReviewItem records.

ExtensionExecutor operates through content-script/background/UI boundaries in an active tab.
RemoteBrowserExecutor operates in an isolated worker/session behind queue, job-store, notification,
and handoff interfaces. AiMapperProvider receives sanitized page semantics and field metadata only
when adapter/semantic rules are insufficient; its output re-enters schema and policy validation.

Trust boundaries:

- M.I.A. API to backend: authenticated, authorized, tenant-scoped normalized data.
- Backend to extension/worker: short-lived job/quote access with least data.
- Web page to executor: hostile/untrusted DOM and text, including prompt injection.
- AI provider boundary: sanitized input and untrusted structured output.
- Session/artifact boundary: isolated by tenant/user/carrier/job, encrypted and expiring.
- Notification/review boundary: authenticated references, no sensitive payload in links/messages.

## 13. Local-mode design

The content script inspects only approved hosts, snapshots semantics, performs controlled actions, and
reads values back. The service worker owns job coordination/messages but is not assumed to remain
alive. A side panel or popup shows detection, selected quote, progress, review items, and controls.
Production quote retrieval enters through a backend contract, not direct long-lived secrets in Chrome.

State persistence stores only the minimum checkpoint and references; payloads expire and are removed.
A run is bound to one tab, adapter, job, and page fingerprint. User navigation, tab changes, reloads,
service-worker suspension, and browser restart trigger state validation before resume. The UI tells the
user when automation has control, what it entered, why it paused, and that final submission is manual.

## 14. Remote-mode design

Jobs move created, queued, provisioning, waiting_for_login, running, waiting_for_user,
ready_for_review, completed, failed, cancelled, or expired. Queue messages carry references, not PII.
Workers use leases/idempotency and create one isolated browser context/profile per scoped session.

The implementation must support an ephemeral context and an abstract persistent/interactive session.
Some approved carriers may work in finite Azure Container Apps Jobs; others may require an isolated
VM, VM Scale Set, Azure Virtual Desktop, or another full desktop/session host. Authentication and MFA
pause without capture or bypass. Review handoff is short-lived, authenticated, tenant-scoped, and
returns the user to the exact session. Expiration revokes access, closes the browser, and deletes
approved artifacts.

Candidate future Azure components, not provisioned here, are Service Bus or Storage Queue; Container
Apps Jobs where compatible; VM/VMSS/AVD for interactive sessions; Key Vault and managed identity;
Container Registry; Application Insights with PII-safe telemetry; encrypted short-lived Blob Storage;
and budgets, tags, alerts, and automatic development teardown.

## 15. Carrier adapter model

Each adapter declares identity, semantic version, line of business, allowed domains, page definitions,
field mappings, transformations, repeatable-record rules, conditionals, validation, navigation
expectations, review requirements, and stop points. Page fingerprints combine stable URL path,
headings, labels, accessible names, roles, nearby text, names, stable IDs, and known validation.

Locators prioritize label, accessible name, role, nearby text, name, and stable ID. Long nth-child,
brittle XPath, and random generated IDs are not primary strategies. Repeated drivers/vehicles use
indexed semantic source patterns and row identity/order rules. An unexpected fingerprint fails closed
as page_changed. Maintenance begins with a redacted snapshot/fixture, reproduces the change in the
mock lab, versions the adapter, adds regression tests, reviews risk, and then deploys.

## 16. AI mapping policy

The order is deterministic adapter rules, DOM/accessibility semantic matching, AI-assisted
interpretation, screenshot/vision only when semantics are inadequate, then human review/stop.
AiMapperProvider receives headings, labels, roles, options, field-schema metadata, adapter hints, and
prior approved mappings. Actual client values are excluded where semantic identifiers suffice.
Screenshots are optional, redacted or ephemeral, and governed by approved retention.

AI returns only a versioned schema-validated mapping proposal with source path, target hints, evidence,
confidence, and risk. It cannot return executable script, arbitrary navigation, submission, legal
acceptance, or a new underwriting fact. High-risk or low-confidence output requires review. Provider
SDKs stay behind the interface.

Carrier page text is untrusted and may contain prompt injection. Page text cannot override system
policy, widen action schemas, request secrets, or approve itself. Inputs are delimited/structured,
minimum necessary, and stripped of hidden instructions where practical. Output is validated,
policy-gated, origin-gated, and executed only by deterministic code. The system remains usable with
the offline deterministic mock.

## 17. Data contract and field provenance

MiaQuotePayload version 1.0 covers applicant, address, drivers, vehicles, properties, prior insurance,
requested coverage, and metadata. Exchanged/persisted page, mapping, action, result, review, job, and
audit contracts also contain a version.

Every target value references a semantic source path such as drivers[0].dateOfBirth or an approved
documented deterministic rule. Transformations are named/versioned and never silently default.
Action results record action ID, source path, status, reason, normalized observed hash, and read-back
match. Conflicts remain review items. Contract migration must be explicit and backward compatibility
tested.

## 18. Security, privacy, and compliance

The repository must be private before sensitive project information. Students receive no production
data by default. Store secrets in an approved vault through managed identity or short-lived access;
repository configuration contains names/references only. Encrypt approved data in transit and at rest.
Apply tenant, user, carrier, and job authorization at every boundary.

Default logs minimize PII. Screenshots/traces/browser profiles are disabled or short-lived, encrypted,
access controlled, and deleted according to TBD policy. Artifact access is audited. Browser/network
permissions are least privilege. Dependencies are locked and CI is credential-free.

Carrier automation requires M.I.A. leadership approval and per-carrier agreement/rules evaluation
before production use. No CAPTCHA, MFA, anti-bot, terms, or access restriction is bypassed. Incident
response covers stop, private escalation, credential revocation, scope, containment, Git/CI cache
removal, deletion verification, and regression. Owners and time targets remain TBD — Dom.

## 19. Notification and review design

Status events include queued, waiting for login, waiting for user, failed, expired, and ready for
review. Notifications contain job reference and reason category, not client/carrier details. The
extension provides immediate status for local mode. Remote mode uses an approved in-app, extension,
email, webhook, or polling mechanism selected by Dom.

The review view lists page, semantic field key, source/rule provenance, entered/observed match state,
confidence/risk, validation errors, and required human decision. It does not display more PII than the
user is authorized to see. A remote action link is short-lived and resumes the exact isolated session;
it never embeds credentials or payload. The user owns every final carrier action.

## 20. Testing strategy

- Unit: transforms, normalization, source resolution, redaction, policy, confidence, state transitions.
- Contract: valid/invalid versions, strict shapes, allowlisted action union, migration compatibility.
- Adapter: recognition, mapping, conditionals, repeatable rows, validation, stop points, layout change.
- Integration: provider-to-core-to-executor with synthetic jobs and redacted audit.
- Mock E2E: modern SPA and classic navigation, async/modal/validation, missing data, ambiguity, changed
  layout, interruptions, recovery, and proof that mock submit was never clicked.
- Approved real-carrier testing: only after authorization, private repository, sandbox/test account,
  network approval, data policy, and task-level approval; never use production PII for students.
- Regression: versioned acceptance fixtures and expected outcomes.
- Accuracy measurement: supported population coverage, automatic mapping precision, review recall,
  read-back match, false-entry severity, and page completion time.
- Security: secret scanning, dependency review, permissions/origin review, PII log tests, artifact
  ignore/retention checks, prompt-injection tests, and authorization tests.
- UAT: quoting users validate review clarity, intervention, recovery, and manual final handoff.

## 21. Success metrics and acceptance criteria

All targets are proposed and subject to Dom's written approval:

- Demonstrate at least one line of business and two materially different approved or mock flows.
- At least 95% automatic population coverage for fields declared supported in acceptance fixtures.
- At least 99% target-field mapping precision for automatically entered supported fields.
- Zero silent material underwriting substitutions in acceptance testing.
- Surface 100% of unsupported, missing, conflicting, high-risk, or low-confidence required items.
- Represent 100% of executed actions in the audit trail with provenance and status.
- Zero automatic final submissions, bindings, attestations, signatures, CAPTCHA bypasses, or MFA
  bypasses.
- No raw secrets or unredacted production PII in source, CI, or default logs.
- Document and demonstrate recovery for page changes and interrupted jobs.
- Measure timing separately for local and remote modes, excluding human login/MFA time. Numeric timing
  goals are TBD — Dom after baseline measurement.

Acceptance uses a frozen, approved synthetic fixture set and declared supported-field list. Precision
is correct target mappings divided by automatically entered mappings. Coverage denominator excludes
explicitly unsupported fields but not silently skipped required fields.

## 22. Four-month / 16-week plan

| Weeks | Deliverables and exit evidence                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–2   | Private repository/access decisions, charter, security baseline, normalized contract, two mock flows, access requests, baseline metrics, student assignments |
| 3–4   | Local and remote technical spikes, authentication/session/handoff feasibility, executor interface, cost/compatibility evidence, Week 4 decision gate         |
| 5–7   | Shared core, extension workflow, first approved/mock adapter end to end, provenance/read-back/audit                                                          |
| 8–10  | Second adapter, dynamic lists, conditionals, validation, review UX, pause/resume recovery                                                                    |
| 11–12 | AI-assisted fallback behind interface, changed-page detection, regression suite, audit/redaction hardening                                                   |
| 13–14 | Approved M.I.A. development integration, notifications, chosen remote proof of concept, resilience testing                                                   |
| 15    | Security review, UAT, accuracy/performance/cost measurements, prioritized fixes                                                                              |
| 16    | Demonstration, documentation, deployment/handoff plan, known limitations and unresolved-risk report                                                          |

Each week ends with a working demo, metric/risk update, decisions needed from Dom, and reviewed backlog.

## 23. Three-engineer workstream proposal

- Workstream A: extension/local executor, tab/page recovery, progress and user review experience.
- Workstream B: automation core, carrier adapters, mock sites, transformations, accuracy/regression.
- Workstream C: orchestrator, remote worker, queue/session/handoff abstractions, observability/cost spike.

All three share security reviews, code review, documentation, integration, weekly demo, and incident
awareness. No workstream owns a second core. Cross-cutting contract changes require representatives
from affected workstreams.

## 24. Engineering workflow

Use feat/..., fix/..., docs/..., and spike/... branches. Every change has an issue, a small reviewable
pull request, at least one approval, resolved conversations, CI, tests, documentation, and an ADR when
cross-cutting. Direct main pushes are disabled after bootstrap; force push and branch deletion are
blocked. Commits use imperative conventional prefixes.

Definition of done for an issue: acceptance and failure paths pass; security/privacy reviewed;
provenance/read-back/review behavior demonstrated; format, lint, typecheck, unit, build, and relevant
E2E pass; docs/fixtures/metrics updated; no unrelated files; known limitations recorded. Weekly demos
use only approved synthetic or test data.

## 25. Risk register

| Risk                                   | Probability | Impact   | Mitigation                                                                | Trigger                                   | Owner                 |
| -------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------- | ----------------------------------------- | --------------------- |
| Carrier terms prohibit automation      | Medium      | Critical | Written per-carrier review; mock-only until approved                      | Agreement uncertainty or objection        | TBD — Dom/legal       |
| No sandbox/test access                 | High        | High     | Mock fidelity, early access request, defer real integration               | No access by Week 3                       | TBD — Dom             |
| MFA/CAPTCHA blocks unattended flow     | High        | High     | Human pause/handoff; never bypass                                         | Challenge encountered                     | Workstream C/security |
| Bot detection or network restrictions  | Medium      | High     | Observe in approved test only; compare host options; no evasion           | Session blocked or challenged             | Technical owner       |
| DOM changes                            | High        | High     | Semantic locators, fingerprints, changed-layout tests, adapter versions   | Fingerprint/validation drift              | Workstream B          |
| Iframes or shadow DOM                  | Medium      | Medium   | Early spike, explicit frame metadata, safe unsupported state              | Required controls inaccessible            | Workstream B          |
| Ambiguous underwriting question        | High        | Critical | No inference; high-risk human review                                      | Multiple plausible mappings/answer absent | Product owner         |
| PII leakage in logs/artifacts          | Medium      | Critical | Redaction, no production student data, ignored artifacts, retention tests | Secret scan/log test alert                | Security owner        |
| Model hallucination/prompt injection   | Medium      | Critical | Sanitized structured inputs, schema/policy gates, no facts/scripts        | Invalid action or hostile page text       | AI/security owner     |
| Remote session handoff fails           | Medium      | High     | Week 3–4 spike, exact-session proof, expiration/revocation                | Cannot securely resume session            | Workstream C          |
| Azure cost exceeds cap                 | Medium      | Medium   | Budget alerts, per-job/idle metrics, tags, teardown                       | Threshold exceeded                        | TBD — Dom/cloud       |
| Four-month time limit                  | High        | High     | Local-first scope, Week 4 gate, mock fallback, stretch separation         | Milestone misses two weeks                | Dom/team              |
| Existing M.I.A. integration dependency | Medium      | High     | Contract-first mocks, named owner, late integration gate                  | Docs/access unavailable                   | Dom/API owner         |
| Repository remains public              | High now    | Critical | Generic files only; no bootstrap push; transfer/private blocker           | Visibility check reports public           | Dom                   |

Probability/impact are initial qualitative estimates and must be reviewed in Week 1.

## 26. Decision log and open questions

Accepted bootstrap decisions:

- One shared core with extension and remote executor interfaces.
- Local mode is primary; remote is a Week 4 gated feasibility proof.
- Human review precedes submission and high-risk/uncertain decisions.
- AI output is structured, schema validated, and never directly executable.
- Semantic field identifiers and PII minimization are default.
- Development uses two synthetic localhost mock flows.

### Week 4 remote decision matrix

Score each criterion from 1 (unacceptable) to 5 (strong) after approved spikes. Scores remain pending.

| Criterion                    | Weight | Evidence required                               | Score   |
| ---------------------------- | -----: | ----------------------------------------------- | ------- |
| Login/MFA experience         |      5 | Human pause/resume demonstration                | Pending |
| Persistent session handling  |      5 | Expiration, restart, and exact-session resume   | Pending |
| Secure user review/handoff   |      5 | Authenticated isolated handoff                  | Pending |
| Carrier compatibility        |      5 | Approved test evidence per priority flow        | Pending |
| Bot-detection behavior       |      4 | Observation without bypass attempt              | Pending |
| Security/credential exposure |      5 | Threat review and least-privilege design        | Pending |
| Cost per job and idle cost   |      3 | Measured estimate with teardown                 | Pending |
| Concurrency and isolation    |      4 | Tenant/user/job isolation proof                 | Pending |
| Operational complexity       |      3 | Support, patching, monitoring model             | Pending |
| Failure recovery             |      5 | Retry, resume, cancel, expiration demonstration | Pending |

Open questions include every TBD in DOM_NOTES.md, especially initial line, carriers, authorization,
extension/API contracts, always-human questions, repository privacy, AI/Azure choices, notification,
retention, and acceptance timing.

## 27. DOM TO PROVIDE / PRODUCT OWNER INPUTS

Complete DOM_NOTES.md without secret values. Critical inputs are repository transfer/privacy and
collaborators; legal/IP/university constraints; line/state/carrier priorities; carrier authorization
and sandbox users; existing extension and development API contracts; approved normalized schema and
business rules; synthetic acceptance cases; AI/Azure/security decisions; remote handoff; notification;
accuracy/time approval; and team cadence.

No password, key, token, cookie, MFA code, private certificate, client record, or production screenshot
belongs in that worksheet. Record the approved secret name and secure owner/location only.

## 28. Definition of done and handoff package

The capstone is complete when the chosen prototypes run from documented commands; accepted tests and
metrics pass; two flows demonstrate safe population and recovery; prohibited actions remain impossible
through contracts and policy; the user can review and resume; security findings and carrier
authorization status are explicit; and maintainers can add/version an adapter without changing an
executor.

The handoff package contains source and locked dependencies; synthetic fixtures; CI and test evidence;
coverage/precision/review/timing/cost measurements; architecture and trust boundaries; data contract;
adapter guide; security/privacy and incident findings; ADRs; deployment and teardown plan; demo script;
approved integration instructions; risk/open-decision report; prioritized backlog; owner/runbook;
supported-field/flow matrix; and known limitations. No handoff claims a carrier, credential, endpoint,
Azure resource, AI provider, or legal approval that Dom has not actually supplied.
