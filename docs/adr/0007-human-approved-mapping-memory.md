# ADR 0007: Human-approved mapping memory

- Status: Proposed by Evan, October 1, 2026. Needs Dom's decision before deployment.
- Extends ADR 0005. Clarifies ADR 0006: chat still never persists; this is a separate,
  human-approved store, not model learning.

Every job currently asks the model to place every field, even on carrier pages it has filled before,
and the same field can be mapped differently between runs. Mapping memory lets a human approve, at
the end of a job, the pairings that were right. Later jobs on that carrier fill those fields
deterministically and the model plans only what remains.

Only model-filled entries that passed policy, the independent fact check and read-back become
candidates. A candidate exists only when an allowlisted deterministic recipe reproduces exactly what
was entered: identity, a fixed date format, an option map, a checked choice, or a fixed name join.
Ambiguous or extracted representations stay with the model. Candidates whose value changed while
the page was still observed, or that the human edited by hand, are not offered. Nothing is saved
without an explicit tick in the side panel's end-of-job review; unapproved candidates end with the job.

Entries store the control signature (a hash of tag, type, role, section, label, name and id; not
position or value), M.I.A. question IDs, the recipe and value digests. They store no answer values,
labels or option text. They are partitioned by the job partition (tenant, user and carrier origin).
Memory is used only when the question has exactly one answered source, so it never chooses between
people or vehicles. It fills only untouched controls and never human-only ones. Every remembered action
still passes the same schema, policy, provenance, fact check and read-back as a model action.
A failed read-back, failed fact check, or human correction sends that field back to the model for the
job; two consecutive failures disable the entry.

Memory is off unless `AZURE_STORAGE_MAPPINGS_TABLE` names a separate table. Without it, the service
behaves exactly as before. Storage errors fall back to the model.

Open decisions for Dom:

1. Accept a human-approved store as consistent with ADR 0006, or require approved mappings to be
   exported and merged by pull request instead.
2. Per-user scope (implemented) or tenant-wide sharing, and who may approve.
3. Whether remembered entries may later skip the model fact check. They do not today.
4. Whether a page filled entirely from memory may skip the final model pass. It does not today; the
   model still checks each page once.
5. Provisioning the table, retention, and an admin view to list and delete entries.

Tests cover recipe derivation and refusal, replay, merging, failure limits, approval conflicts,
isolation between users, storage failure, human edits, and a two-run browser flow in which the
second run fills approved fields without asking the model.
