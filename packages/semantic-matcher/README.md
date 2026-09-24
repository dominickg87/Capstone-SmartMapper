# @smartmapper/semantic-matcher

Deterministic field matching from semantic source paths to accessible page controls. No model, no
network call, no API key. See [ADR 0006](../../docs/adr/0006-deterministic-semantic-matcher.md) for
the decision and its limitations.

## What it does

Given a `CarrierPageSnapshot` and a list of source paths, it proposes which control each path should
be entered into — and, just as importantly, refuses to propose one when the page is ambiguous.

```ts
import { DeterministicSemanticMatcher, toFieldMetadata } from '@smartmapper/semantic-matcher';

const proposal = await new DeterministicSemanticMatcher().proposeMappings({
  version: '1.0',
  page: snapshot,
  fields: toFieldMetadata(),
  adapterHints: [],
  priorApprovedMappings: [],
});
```

`proposal.candidates` are actionable mappings carrying full evidence. `proposal.unresolvedSourcePaths`
are the fields that need a human, with `proposal.notes` explaining why.

## How a control is scored

Six independent signals, strongest wins:

| Weight | Signal                   |
| ------ | ------------------------ |
| 0.98   | `autocomplete` token     |
| 0.95   | associated label         |
| 0.93   | accessible name          |
| 0.90   | `name` / stable id token |
| 0.88   | adjacent text            |
| 0.85   | placeholder              |

Then three safety rules:

- **Avoid lists disqualify.** A control whose identifying text contains `co-applicant` is never the
  applicant, whatever else it scores.
- **Ties are reported, not guessed.** Two candidates within `AMBIGUITY_MARGIN` (0.03) mean the
  signals genuinely cannot separate them, so the field goes to a human. No value entered beats a
  wrong value entered.
- **Controls are claimed.** Once a field resolves to a control, later fields cannot reuse it, so
  "First name" and "Last name" can never land on the same input.

`FILL_THRESHOLD` is 0.85, matching the low-risk allow threshold in `evaluateMappingGate`, so a
fillable match is exactly a match policy will allow.

## Adding support for new wording

Edit [`src/field-dictionary.ts`](src/field-dictionary.ts). It is pure data: source path, display
metadata, and the signal vocabulary for one field. The algorithm in
[`src/matching.ts`](src/matching.ts) does not change.

The dictionary contains no quote values — only vocabulary — which is what lets the whole table cross
the sanitized mapper boundary.

## Repeated records

`matchAllByContainer` matches per form section rather than per page, so Driver 1 and Driver 2 each
resolve their own controls instead of tying. It is exported for executor-side use; the provider
itself matches page-wide, because a `SanitizedMappingRequest` carries one already-indexed source
path per field.
