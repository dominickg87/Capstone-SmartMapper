# Test strategy

## Active deterministic-registry checks

[ADR 0018](adr/0018-human-trained-deterministic-mapping-registry.md) is the active test baseline.
Build before testing so injected workspace packages, the backend, and the unpacked extension use the
same contracts and application versions. Model, PDF, prompt, chat, and citation-verification tests are
historical evidence; they do not establish correctness for build 0.3.0.

### Contracts and registry

Unit and contract tests cover:

- strict catalog, training, workflow, disposition, transformation, mapping, action, receipt, and job
  schemas, including rejection of unknown keys;
- complete Home applicant and Auto additional-driver/vehicle limits and wildcard expansion;
- fixed and same-position source binding, including out-of-range and mismatched repeated entities;
- all six field dispositions and the rule that every captured eligible field needs one before
  publish;
- typed date/date-part, phone, boolean, enum, split, and compose transforms;
- stable page/target signatures that exclude display numbers, values, coordinates, quote IDs,
  generated element IDs, and DOM node identity;
- immutable mapping versions and valid `testable -> verified -> active -> superseded` transitions;
- ETag/revision conflicts, canonical tenant/carrier-origin/line-of-business scope, archive behavior,
  and active-version lookup;
- fixed operational values with only the matching closed classification/reason and no free rationale;
  and
- digest-only carrier labels, context, groups, and option values/labels, with no raw carrier
  semantics, quote values, HTML, screenshots, cookies, tokens, or browser state in drafts or registry
  serialization.

Verification tests must prove that a testable version cannot be marked verified by sending only its
ID. The proof job must be durable, bound to the same tenant, carrier origin, line of business, and
mapping version, cover the required trained pages, reach successful completion, and contain zero
failed receipts and no unresolved review items. An unverified version cannot become active.

### Training UI and browser observation

Extension tests cover:

- Map/Train mode separation and trainer authorization failures;
- logical grouping of native radio choices and other grouped controls;
- filtered page capture that persists every carrier semantic string and option only as a SHA-256
  digest, without current carrier values in the saved training snapshot;
- workflow-wide numbering across pages and conditional scenarios;
- large linked carrier-page badges and panel rows, including keyboard focus and cleanup;
- draft autosave, stale-revision handling, extension worker/panel restart recovery, and cancellation;
- catalog selectors that show question, section, entity, and stable source path;
- both fixed-index and same-position bindings for repeated people/vehicles;
- editing and validation for every disposition and allowlisted transformation;
- generated `Home workflow`/`Auto workflow` labels, origin-only base URLs, and rejection of
  trainer-supplied identity names or variants; and
- a side panel visible only on the tab where the extension toolbar icon was activated.

`tab-panel.test.ts` checks that panel opening occurs directly inside the toolbar click before any
storage read settles, durable owner cleanup after worker restart, rapid activation races, site/tab
cleanup, and redacted opening errors. `tests/e2e/tab-panel.e2e.spec.ts` triggers the actual Chrome
toolbar action on a synthetic carrier, reads the real side-panel DOM, verifies the loaded package
version and Map/Train modes without backend access, transfers ownership between tabs, and disables
the panel after a site change. It never opens a substitute panel in a regular browser tab.

Training browser fixtures include both Home applicants and the supported Auto maxima of five
additional drivers and eight vehicles. The field sequence must remain stable when a framework
rerenders, while persistent matching must not depend on that display sequence.

### Production mapping

Core, API, and extension tests exercise this path:

```text
M.I.A. semantic source manifest
-> active registry lookup
-> page-signature match
-> deterministic action compilation
-> browser execution
-> normalized read-back
-> receipt/provenance checkpoint
-> focused review or guarded Next
```

Required behavior cases include:

- correct active profile selection by tenant, carrier origin, and line of business;
- explicit testable-version selection during verification without exposing it to ordinary jobs;
- correct source path and same-position resolution for repeated applicants, drivers, and vehicles;
- carrier default, approved fixed value, human-required, ignore, and leave-blank behavior;
- dropdown/boolean crosswalks and deterministic formatting;
- changed routes, page signatures, labels, required state, control kind, or options;
- missing source answers and missing registry mappings as distinct review reasons;
- read-back mismatch and carrier validation error as focused failures;
- preservation of every successful independent field when one target fails or rerenders;
- idempotent retry that does not reenter already verified siblings;
- unknown domain, mapping version, page, target, or action failing closed;
- source revocation/change, token expiry, tab/origin change, and ETag conflict;
- ordinary Next/Continue only after all field receipts, a fresh post-entry observation, and a clean
  whole-page review; and
- blocking of final Submit, Bind, Issue, Sell, purchase, payment, consent, attestation, signature,
  CAPTCHA, MFA, and authentication controls.

Every browser flow asserts that the synthetic final control's `data-clicked` marker remains false.
It also confirms that a failed field does not erase successful receipt/provenance records.

### M.I.A. integration

In `MIA_web_app`, run:

```powershell
php artisan test --compact tests/Feature/SmartMapperV2Test.php tests/Feature/ExtensionApiTest.php
```

Those tests cover value-free catalogs, reviewed question/context, false and zero values, unavailable
paths, both Home applicants, five additional Auto drivers, eight vehicles, quote ownership, the
separate mapping and training principal allowlists, distinct map/training token abilities, verifier
binding, grant replay/expiry, revocation, and source revision. A catalog source-digest change must
block use until the generated catalog is reviewed and updated.

## Test pyramid

Unit tests own schemas, signatures, mapping compilation, transformations, policy, lifecycle,
normalization/read-back, and redaction. Integration tests connect the M.I.A. client, API stores,
registry, automation core, and executor boundaries with synthetic data.
`tests/e2e/registry-lifecycle.e2e.spec.ts` crosses the actual training service, registry,
active-tab job service, built extension content executor, and classic synthetic carrier. It captures
and saves pages, publishes a testable version, records a clean proof, verifies, activates, resolves
the active version for reuse, continues safe siblings after one failed field, blocks stale Next, and
asserts that final submit remains untouched.

Azure Table unit tests cover entity partitioning, chunking, ETags, version transitions, and
serialization. Managed identity, availability of the provisioned `SmartMapperMappings` table, real
Azure Table persistence, App Service startup, and telemetry are deployment checks; local passing
tests do not claim those cloud integrations were exercised.

## Acceptance measurement

Maintain frozen synthetic quote fixtures, trained registry versions, page/scenario fixtures, and a
versioned supported-field matrix. Record:

- declared and captured carrier fields;
- fields with an explicit disposition;
- available and populated M.I.A. source fields;
- correctly targeted and read-back-verified entries;
- focused review conditions surfaced;
- prohibited actions blocked;
- page transitions and human stops; and
- automation time and human wait time separately.

Population coverage = verified populated supported fields / populated supported fields available in
M.I.A. Mapping precision = correctly targeted verified entries / all automatic entries. Review
recall = surfaced required review conditions / known review conditions. Training coverage = fields
with explicit dispositions / eligible fields observed across required pages and scenarios.

A wrong material underwriting entry, cross-person/vehicle mapping, unresolved required field before
navigation, or prohibited action fails acceptance regardless of aggregate scores.

## Real-site gate

Real carrier tests require a separately approved task, written carrier/leadership authorization, a
designated least-privilege test account, approved network scope, mock/test data, and an artifact
policy. Do not point a browser test at a live domain by changing a fixture URL. The user performs live
tests; automated test infrastructure stays on synthetic carriers.

## Commands and CI

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

CI uses a locked install and no live credentials or traffic. Failure artifacts have three-day
retention and must remain synthetic. Do not weaken schemas, policy, strict TypeScript, assertions, or
the final-control check to make a test pass.
