# ADR 0015: Bounded field recovery

- Status: Accepted after the first instrumented 0.2.6 live-carrier run on October 2, 2026.
- Delivered in extension and backend build 0.2.7. Extends ADRs 0011, 0013 and 0014.

## Evidence

The run inspected 27 controls with one targeted screenshot. Initial source access took 0.6 seconds,
the first PDF fetch 4.3 seconds, low-reasoning planning 26.5 seconds and independent verification
5.1 seconds for five actions. The first entry verified. The second returned a read-back mismatch,
which discarded the remaining approved entries and left the failed receipt in recovery context.

That receipt escalated the next whole-page plan to maximum reasoning. It took 92.2 seconds and
generated 3,624 reasoning tokens. A later page-change receipt caused another maximum-reasoning
whole-page request, which reached the 150-second deadline. Approximately 97 percent of the run was
waiting for model planning. Page discovery, screenshot capture, source access and browser receipts
were not the dominant cost.

## Decision

Routine whole-page planning always uses the configured default reasoning effort. Browser
read-back or page-change receipts do not make the semantic mapping problem harder and therefore do
not trigger maximum reasoning. Any future escalation must be a bounded targeted repair rather than
a full-page retry.

After entry, the browser observes the current controls again. A framework may replace native DOM
nodes on change or blur. If labels, control order, options, route and the rest of the page remain
equivalent after excluding the intended target value, SmartMapper rebinds to the replacement node,
reads its value and keeps the approved page state. Node identity alone is not a page change.

If one native entry still fails read-back or carrier validation on a stable page, that target is
added to human review and the remaining independently planned and independently verified entries
continue in order. The failed value is never accepted as verified. After the queue finishes, the
job stops for human input. A structural change, missing target, blocked action, navigation,
authentication event or policy failure still invalidates the stale queue and requires fresh
inspection.

Checkpoints retain only the target's synthetic element ID, semantic key hash, expected/observed
hashes, source IDs and reason code. Raw answers, PDF bytes, screenshots and carrier values remain
outside durable checkpoints and diagnostic events.

## Verification

Unit coverage proves that one mismatched entry remains failed, becomes a review item, does not
authorize its value, and does not cancel the next independently approved entry. Browser coverage
replaces controlled input nodes after a change event and verifies that the original page batch
finishes with one model plan. Existing dynamic-field coverage still requires a fresh plan when a
new field is actually revealed. Final-action prohibitions and read-back requirements are unchanged.
