# ADR 0006: Deterministic semantic matcher as the default mapping provider

- Status: Proposed
- Date: 2026-09-13

## Context

ADR 0003 records that AI providers may only return schema-validated mapping proposals, and keeps
"no AI ever" as a supported operating mode. ADR 0005 records that the imported MIA filler does not
yet satisfy ADRs 0001–0004, and lists semantic source resolution, provenance, and normalized
read-back as required work. Until now the only implementation behind `AiMapperProvider` was
`DeterministicMockAiMapper`, whose token-overlap heuristic emits every inferred candidate at a flat
0.7 confidence with `requiresReview: true`.

Real carrier forms rarely expose predictable attribute names. `firstName` is the lucky case;
`ctl00$ContentPlaceHolder1$txtFName` and `q_87234` are ordinary. A single-signal heuristic cannot
separate an applicant's last name from a co-applicant's, and a heuristic that guesses when two
controls look identical will eventually write a value into the wrong field.

## Decision

Add `packages/semantic-matcher`, a provider that resolves fields from weighted independent page
signals and no model. It implements the existing `AiMapperProvider` interface, so the executor,
policy gate, and review path are unchanged.

Six signals are scored per control, and the strongest one wins:

| Weight | Signal                   | Why it ranks there                          |
| ------ | ------------------------ | ------------------------------------------- |
| 0.98   | `autocomplete` token     | a web standard; unambiguous when present    |
| 0.95   | associated label         | what a human reads                          |
| 0.93   | accessible name          | what a screen reader reads                  |
| 0.90   | `name` / stable id token | developer intent, but inconsistent          |
| 0.88   | adjacent text            | visually a label in table and float layouts |
| 0.85   | placeholder              | often decorative, sometimes all there is    |

Three rules make the result safe rather than merely accurate:

- A per-field `avoid` list disqualifies a control outright, which is what stops "Co-applicant last
  name" resolving to `applicant.lastName`.
- Two candidates within 0.03 of each other are reported as unresolved, never guessed.
- A control claimed by one field is withdrawn from every later field, so two fields cannot resolve
  to the same control.

`FILL_THRESHOLD` is deliberately 0.85, equal to the low-risk allow threshold in
`evaluateMappingGate`. A candidate this matcher considers fillable is exactly a candidate policy
allows; everything weaker becomes a review item.

The field dictionary is data, not logic. Adding support for new carrier wording means editing one
table; the algorithm does not change.

### Contract extensions

`AccessibleControlSchema` gains optional `placeholder`, `autocomplete`, `readOnly`, `visible`,
`containerKey`, and `containerLabel`. Without the first two, the strongest and weakest signals above
cannot be computed at all. `visible` and `readOnly` prevent writing into a collapsed accordion or an
inert control. The container fields let matching run per form section, so repeated blocks
(Driver 1 / Driver 2) each get their own resolution instead of competing for one slot.

The control's current **value is deliberately not added**. It would carry page-entered data across
the sanitized mapper boundary, which the boundary exists to prevent.

`PropertySchema` gains optional `squareFeet`, `style`, `stories`, and `numberOfFamilies`, the
homeowners attributes the dictionary resolves. `MappingEvidenceSchema` gains `autocomplete` and
`placeholder` kinds so provenance can name the signal it actually used.

Every addition is optional, so existing producers and fixtures stay valid.

## Rationale

Determinism is worth more than coverage here. The same page produces the same proposal every time,
offline, with no API key and no network call, which makes the mapping reviewable, testable, and
auditable in a way a model's output is not. Reusing `AiMapperProvider` keeps a single policy path,
so choosing this provider is an operating decision rather than an architectural fork.

Scoring several independent signals and keeping the whole evidence trail is what makes a proposal
explainable. A match that cannot be explained is a match that cannot be trusted.

## Alternatives

- Extend `DeterministicMockAiMapper` in place: rejected. Its flat 0.7 confidence and
  always-review output are a deliberately inert stand-in for a provider, and folding real matching
  policy into the mock would blur what the mock is for.
- Put the matcher in `carrier-adapters`: rejected. Adapters encode reviewed, carrier-specific rules;
  this resolves fields on pages no adapter has seen.
- Send the value of each control as a signal: rejected as a data-minimization regression.
- Keep matching inside the extension: rejected. It would be a second core, which ADR 0005 forbids.

## Consequences

The repository has a usable no-AI mapping mode. `pnpm test` covers signal precedence, avoid-list
disqualification, tie refusal, control claiming, changed layouts, repeated records, and the
provider's behavior against `evaluateMappingGate`.

Known limitations, to be recorded as backlog rather than hidden:

- The `lowConfidence` outcome is currently unreachable: the weakest signal is 0.85 and the threshold
  is 0.85. The branch is retained because it becomes reachable the moment any weight is lowered, but
  today a field is matched, ambiguous, or not found.
- `DeterministicSemanticMatcher` matches page-wide. `matchAllByContainer` implements per-section
  matching for repeated records but is not yet wired into the provider, because a
  `SanitizedMappingRequest` carries one already-indexed source path per field. Repeated-record
  expansion still belongs to the adapter's `dynamicCollection`.
- The dictionary covers applicant identity and address, the first two drivers, the first two
  vehicles, and five property attributes — enough for every page of the synthetic carrier lab in
  both its default and changed-layout wording. Prior-insurance and coverage fields, and any third
  or later repeated record, are not yet described.
- Nothing here executes anything. Filling, read-back, and the submit guard remain the executor's job.
