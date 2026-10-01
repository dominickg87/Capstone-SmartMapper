# ADR 0011: Reduce model message overhead

- Status: Accepted under Dom's October 1, 2026 speed request. Dom chose to keep Astra and test
  this build before considering a different model.
- Extends ADRs 0005, 0009 and 0010; delivered in application build 0.2.3.

Planning serialized repeated page versions/IDs, unused null parameters and 64-character source
hashes into every generated action. Use a provider-local, strict, versioned discriminated union
with only each action type's parameters. Generate action IDs on the server; expand omitted nulls
and the shared page revision into the existing AutomationActionV2 schema before policy evaluation.
No new action type or executable model content is permitted. Custom option clicks still require
their proposed value. Unknown fields, source references and unsupported actions fail closed.

Replace opaque source answer IDs with request-local aliases in planner input/output. Preserve every
original question, answer, source path, section, entity, context, option and status. The immutable
per-request lookup restores authoritative IDs before verification, checkpointing or execution.
Source question hashes and envelope ownership metadata need not be generated or interpreted by
the planner; they remain available in the authoritative source records and authorization checks.
Replace control-key hashes in planner retry/verified metadata with matching element IDs. Browser
and backend fingerprints, source binding and original question IDs are unchanged. No cross-job
cache or reuse of previous model responses is introduced.

Independent verification retains all five checks and the full screenshot, manifest and original
source Q&A. Shorten its result property names and index results by their supplied entry position.
Missing, extra, duplicate or out-of-range indices fail closed. This remains a separate model call.
Batch limits, confidence thresholds, source equivalence, policy and browser read-back are unchanged.
Compute independent browser control hashes concurrently, retaining every fingerprint check and
the existing settling interval.

Allow explicit low/medium reasoning in configuration; keep the existing high default and high/max
escalation choices. The local trial selects low and max. No model, endpoint, deployment type,
US data boundary or Azure environment setting changes. Priority processing was tested only on
synthetic requests; the Azure response reported default, so no priority setting is enabled.

Record only fixed stage labels, elapsed time, token counts and validated tier labels for performance
diagnostics. Do not record prompts, model outputs, IDs, values or screenshots. Metrics failure must
not change mapping behavior. Development logs go to the local launcher stdout file; configured
Application Insights receives stage duration.

The first matched synthetic eight-field comparison on the existing Azure deployment measured
26.5s (19.5s planning + 7.0s verification) before and 12.9s (8.5s + 4.4s) after. Model output fell
from 1,909 to 600 tokens across the two calls. These cold-client timings include credential setup
and exclude browser entry; the corresponding HTTP model times were 24.6s and 11.0s. This is an
approximately 2x improvement in that example, not evidence of a 10x improvement or live-carrier
quality. A separate synthetic legacy visual check approved the correct first name and rejected
wrong-applicant and altered-answer entries at low reasoning. Real-carrier testing remains Dom's.

Tests cover all compact action variants, malformed/prohibited output, source alias restoration and
request isolation, original semantic context, retry state, all independent verification rejection
checks, section execution, changed DOM, pause/cancel, read-back failure and final submit untouched.

Rationale follows [OpenAI latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization):
reduce generated output while preserving the information and checks needed for the task.
