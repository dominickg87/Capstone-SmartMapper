# ADR 0006: Human conversation during a mapping job

- Status: Accepted from Dom's free-text feedback request, October 1, 2026.
- Extends ADR 0005 without changing its source, action or navigation policies.

The human can explain mapping mistakes or ask questions in the extension side panel. Sending a
message pauses the job and invalidates an outstanding mapping proposal. The backend rechecks the
authorized source, inspects a fresh bound viewport screenshot and DOM observation, and requests a
strict conversational reply through `AiMapperProvider.discussMapping`. It returns no executable
actions. The human chooses when to Resume.

Subsequent mapping requests receive the bounded conversation as fallible guidance about the target
question, entity, representation or workflow. Source values remain authoritative in M.I.A. The
independent fact verifier receives the proposed action and authoritative source evidence, not chat
as an alternative source. Existing schema, policy, forbidden-action and read-back checks still apply.
The model cannot modify source records, shared prompts or code, authorize forbidden actions, or
claim permanent learning. Lasting improvements require reviewed implementation changes and tests.

Keep at most ten exchanges, 4,000 characters per message, in trusted `chrome.storage.session` with
the job. This memory is distinct from default redacted logs and may contain the human's typed values
or the assistant's discussion of source answers. It survives panel/service-worker restarts. Explicit
clearing, cancellation and browser-session end remove it; expired jobs clear it when detected.
Neither chat nor screenshots/Q&A are stored in Azure checkpoints. Model calls use `store:false`.
No new Azure resource or separate provider conversation object is required.

Job authentication, fresh tab/origin/page binding, source scope/revision and ETag checks apply to
chat as to mapping. Revalidate the job after inference and reject a reply superseded by cancellation,
pause or resume. The endpoint leaves mapping paused on failure. The UI keeps the unsent draft so
the human can retry after restoring the current job revision.

Local tests cover interrupted mapping, conversation restoration/clearing, source revocation,
cross-user sources, invalid roles/replies, no stored chat in checkpoints, and attempted forbidden
actions or invented facts after feedback. Live model quality still requires deployed testing.
