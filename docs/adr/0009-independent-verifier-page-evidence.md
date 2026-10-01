# ADR 0009: Page evidence for independent fact verification

- Status: Implementation correction under ADR 0005, October 1, 2026.

The planner received a screenshot and full control manifest, while the independent verifier received
only one control. Legacy forms can put First/M.I./Last text beside inputs without associated DOM labels.
The verifier could therefore lack the evidence used to identify the proposed target. Additionally,
policy rejections and uncertain verification were all displayed as source mismatch.

Pass the same bound observation to the verifier, including its ephemeral viewport screenshot and
neighboring controls. Independently identify the target from its ID, rectangle, visible wording and
section/entity context; a missing DOM label alone is neither approval nor rejection. Do not replace
missing labels with inferred facts. The verifier still receives only the referenced authoritative
source answers, no planning conversation or earlier model responses. Unclear targets, changed facts,
wrong entities and human judgment requirements remain blocking results.

Return a bounded verification result with a review reason. Preserve policy rejection categories and
display plain explanations in the side panel. Checkpoints store reason codes, not model explanations,
source values, screenshots or carrier wording. Model requests remain schema constrained with
`store:false`. Provenance, identity comparison, binding and post-entry read-back remain mandatory.

Regression coverage includes actual Responses request bodies, every failing verification criterion,
missing/stale visual evidence, source/privacy checks, distinct policy reasons and a synthetic legacy
form with repeated applicants. Browser tests assert the final issue control is never clicked.
