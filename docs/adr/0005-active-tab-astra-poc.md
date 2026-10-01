# ADR 0005: Active-tab Astra POC and quote-scoped authorization

- Status: Accepted by Dom, September 30, 2026
- Supersedes the remote-runtime deliverable and deterministic-first mapping in ADRs 0001/0004.
- Branches: Smart-Mapper `Dom-astra-2.0approach`; MIA web app `smartmapper2.0`.

Smart-Mapper contains the POC extension and Azure backend. The live MIA Chrome
Extension repository is not an implementation target; findings will be folded in later.
Preserve the shared automation core, provider boundary, and legacy synthetic fixtures.
Remote execution is deferred; the existing worker is a regression harness only.

The extension observes the user-authenticated active tab, captures an ephemeral
viewport screenshot and control manifest, and requests one small action batch from
the backend. Every batch is schema validated, bound to the tab/origin/page revision,
checked against source answers, executed through an allowlisted executor, and read
back. Human review and an explicit Resume are required at every page boundary.
Next, Continue, Bind, Issue, Sell, final submission, payment, consent, signature,
authentication, MFA, and CAPTCHA remain human actions.

MIA supplies actual question wording, section/entity context, answer choices,
source paths and IDs, and recorded answers. Missing question metadata is reported,
never fabricated from a field name. Its existing extension login issues a short-lived,
single-use, verifier-bound grant for one quote, origin, and tab. The backend redeems
the grant only against configured trusted MIA origins. Subsequent source retrieval
rechecks quote ownership, the issuing extension token, tenant allowlists and expiry.
The long-lived MIA extension token never reaches the Azure backend or carrier page.

Azure Responses uses the configured Astra deployment, managed identity, high/max
reasoning, and `store: false`. Structured model output cannot authorize itself.
Representation changes retain answer IDs and transformation evidence; ambiguous
equivalence is a review item. Screenshots, Q&A and raw observed values stay out of
ordinary logs and job checkpoints. Checkpoints contain bounded counters, hashes,
job binding, and a short-lived source capability, protected by storage RBAC.
Cancellation deletes the checkpoint; expiry and scheduled cleanup bound retention.

The POC uses Dom's seeded demo account on live MIA endpoints when explicitly
configured. Runtime tenant/user/origin allowlists default closed. Tests use only
synthetic data and localhost carriers. Provisioned Azure resources are in East US;
the model deployment uses US Data Zone Standard. Private networking is not required
for this POC. Resource provisioning does not imply a verified application deployment.

Implementation order: versioned contracts and policy, backend and Azure adapters,
MIA grants/Q&A export, extension side panel and browser loop, integration/E2E tests,
deployment package and handoff instructions. No live carrier tests or production
MIA deployment are part of the local implementation checks.
