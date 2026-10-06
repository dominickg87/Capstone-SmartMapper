# Data contract

## Active protocol

The active SmartMapper wire protocol remains **2.0**. Build numbers such as 0.3.0 identify deployed
application code and do not change the protocol version. `packages/contracts` is the source of truth;
objects reject unknown keys at external boundaries.

ADR 0018 replaces model-planning and PDF/chat contracts in the active runtime with four related
contract groups:

1. M.I.A. semantic source manifests and value-free field catalogs;
2. training sessions and explicit field dispositions;
3. immutable versioned mapping profiles; and
4. deterministic actions, receipts, provenance, and review items.

## M.I.A. semantic source manifest

A quote source manifest identifies the tenant, user, quote, Home/Auto form type, and source revision.
Each answer includes:

- stable answer ID, question ID, and source path;
- the original question, section, entity, and bounded surrounding context;
- data type and allowed choices;
- answered, missing, conflicting, or human-only status; and
- its typed scalar value, or a bounded scalar array for a reviewed multiselect, when answered.

The question and context travel with the value so a trainer and reviewer can understand what the
database answer means. A database column name alone is not a mapping label. Unavailable paths are
listed explicitly, and absence never implies `No`, zero, an empty string, or permission to use a
default.

A quote-scoped one-use grant binds source access to tenant, user, quote, carrier origin, tab, and
expiry. The backend redeems the verifier-bound grant and receives a short-lived source capability.
The extension does not receive unrestricted M.I.A. database access.

## M.I.A. field catalog

`MiaFieldCatalog` describes all fields available for training a line of business without including
any customer's answers. It contains:

- `version`, `schemaRevision`, and `formType`;
- `entityLimits` for repeated entities;
- wildcard `templates`; and
- concrete `fields` with IDs, source paths and patterns, questions, sections, context, choices,
  conditions, data type, and optional entity metadata.

Home exposes both supported applicant positions. Auto exposes every supported field for up to five
additional drivers and eight vehicles. For example, concrete paths such as
`additionalDrivers.4.firstName` and `vehicles.7.vin` retain patterns such as
`additionalDrivers.*.firstName` and `vehicles.*.vin`. This lets training choose either a fixed
instance or a same-position rule.

Catalog `schemaRevision` changes when reviewed M.I.A. question definitions change. Catalog values,
quote IDs, and customer data are prohibited.

## Training authorization and drafts

A training grant is quote-less, one-use, verifier-bound, and scoped to:

- tenant and trainer user;
- carrier origin and active tab;
- Home or Auto; and
- expiry.

The trainer must have the `smart-map:training` M.I.A. extension-token ability and match the separate
training-principal allowlist. The ordinary mapping-principal allowlist does not grant training or
publishing authority. Mapping and training grants are separate capabilities.
A redeemed quote capability lasts up to one hour; a redeemed training session lasts up to eight
hours so a multi-page Home/Auto workflow can be completed in one workday.

For the active registry, the durable scope combines the tenant with a canonical
`CarrierWorkflowIdentity` containing the carrier origin and line of business. `carrierBaseUrl` equals
the origin, and `workflowName` is generated as `Home workflow` or `Auto workflow`.
Trainer-supplied names and state/product/program variants are not accepted as durable identity;
registry persistence rejects them.

A `TrainingSessionView` has a UUID, monotonic revision, binding, workflow, catalog revision, pages,
and lifecycle state. Concurrent saves use the revision and Azure Table ETag; stale writes fail rather
than overwrite a newer draft.

A captured `TrainingPage` contains a stable route/fingerprint/signature, scenario label, ordered
logical fields, and separately classified workflow controls. Each `TrainingField` has a workflow-wide
display sequence, occurrence/repeat metadata, a filtered control snapshot, and one nullable
disposition while the session is a draft. Radio choices that represent one question are grouped into
one logical field.

Training snapshots include canonical control kind, requirement and human-only flags, temporary
geometry for the visible overlay, and SHA-256 digests for every carrier-derived label, section,
bounded context item, choice-group string, and option value/label. Raw carrier semantics remain
ephemeral in the active tab. Snapshots exclude current values, checked state, validation text, quote
data, HTML, and screenshots. The server independently rejects noncanonical control kinds, unhashed
semantic fields or options, and unsafe structural identifiers before saving a draft.

## Field dispositions

Every captured eligible carrier field must receive exactly one disposition before publishing:

| Kind              | Meaning                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `source`          | Resolve one or more approved M.I.A. source references and apply an allowlisted transform. |
| `carrier_default` | Preserve a server-approved agency/carrier operational default after local checks.         |
| `fixed_value`     | Use an approved agency/carrier operational value with a closed classification/reason.     |
| `human_required`  | Leave the control for the user and report it as intentional human work.                   |
| `ignore`          | Treat a non-data or not-applicable control as outside the workflow.                       |
| `leave_blank`     | Deliberately leave an optional field empty, such as an unused salutation.                 |

`ignore` and `leave_blank` are distinct. Leave-blank records an intentional empty optional field;
ignore says the control is not part of quote data. Neither may bypass a required carrier field.
Fixed values cannot supply missing customer or underwriting facts.
They are limited to recognized `agency_operational` or `carrier_operational` targets and use only
`approved_agency_identifier` or `approved_carrier_identifier` as the corresponding reason. There is
no free-form rationale field.

Source references use either `fixed` binding to one concrete source path or `same_position` binding
to a wildcard repeated-entity pattern. Approved transforms are a strict union:

- identity;
- date formatting or month/day/year extraction;
- phone formatting;
- enum and boolean option crosswalks;
- multiselect membership for one carrier checkbox and bounded multiselect joining;
- bounded composition of approved sources; and
- bounded splitting by an approved delimiter and position.

Registry data cannot contain JavaScript, selectors that execute code, arbitrary formulas, arbitrary
URLs, or free-form navigation.

## Published mapping profiles

Publishing converts a complete draft into an immutable `MappingProfile`. A profile contains:

- mapping UUID, monotonically increasing mapping version, tenant, and creator;
- workflow identity and catalog revision;
- stable pages, fields, workflow controls, and dispositions; and
- lifecycle state and timestamps.

Persistent target locators retain digested carrier semantics, stable signatures, occurrence, repeat
position, and logical group. They deliberately omit training-time element IDs, hashed DOM keys,
rectangles, current values, and disabled state. Display numbers help the trainer and are not runtime
identity.

Lifecycle transitions are:

```text
draft training session -> testable mapping -> verified mapping -> active mapping
                                                      active -> superseded
                                            any inactive version -> archived
```

Publishing creates `testable`. Verification requires one or more completed mapping jobs for the same
tenant, carrier origin, line of business, mapping ID/version, and complete
page/mapped-field/enabled-workflow-control coverage, with zero failed receipts and no unresolved
reviews. Activation accepts only `verified`.
Activating a replacement atomically marks
the prior active version `superseded`; it remains available for rollback through a reviewed lifecycle
operation. Editing produces a new version rather than mutating the active profile.

## Page observations and deterministic actions

The active page observer reports tab/origin binding, privacy-safe route and structural fingerprints,
logical controls, carrier validation errors, authentication state, unsupported-frame count, and
capture completeness. Mapping uses the filtered visible-control manifest and does not capture or
transport carrier screenshots.

The registry resolves the unique active profile for the tenant, current carrier origin, and line of
business, then selects the page by privacy-safe route identity and stable signature. It resolves a
disposition into the existing allowlisted `AutomationActionV2`
union. Entries carry source answer IDs, the observed page state, a target element reference, typed
value/check state, transformation provenance, and confidence fixed by deterministic policy. Only
approved fill/select/check and reviewed workflow interactions may execute. Arbitrary script and
arbitrary navigation do not exist in the contract.

Ordinary Next/Continue and add-entity controls are stored separately from data fields. After entry
receipts, the extension must take and send a fresh post-entry observation; backend policy can issue a
trained Next only from that refreshed state after a clean whole-page review. Submit, Bind, Issue,
Sell, purchase, payment, consent, attestation, signature, CAPTCHA, MFA, and authentication controls
have no approved action.

## Receipts, jobs, and provenance

Each browser action returns a receipt with status, reason, and normalized observed-value hash. The
server validates the batch/job revision, source provenance, expected hash, and read-back result before
advancing the field. Raw entered and observed values are not written to Azure Table or default logs.

A mapping job records the immutable mapping ID/version used, scope binding, revision, field counters,
page coverage, reason-coded reviews, and redacted provenance. A failed or changed field creates a
focused review item while successful independent receipts remain durable. A retry reobserves and
relocates the target; it does not replay already verified siblings.

Review reasons distinguish at least missing source, missing mapping, changed target/options, required
human entry, validation error, unsupported control, read-back mismatch, and page change. Intentional
carrier defaults, ignored controls, and optional blanks remain explicit successful dispositions and
are not reported as accidental missing mappings.

Job and training tokens are bearer capabilities whose hashes are persisted. Requests are bound to
allowed extension origin, tenant/user scope, carrier origin, tab, expiry, and monotonic revision.
Cancellation and expiry make terminal state non-resumable.

## Retained v1 regression contract

The version 1.0 `MiaQuotePayload`, `CarrierPageSnapshot`, carrier-adapter, and remote-worker contracts
remain for synthetic regression coverage. They are not the active Azure runtime and cannot broaden
the v2 action or safety policy.
