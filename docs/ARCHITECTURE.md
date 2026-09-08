# Architecture

## System shape

The Chrome product is `apps/mia-chrome-extension`, cloned from MIA's `ChromeExtSave2AMS` branch.
Its current flow is:

    MIA side panel: sign in / select a saved quote
                         |
    background page snapshot -> MIA mapping API -> returned assignments
                         |
    background filler -> review / continue / save mapping template

The MIA API and its AI implementation live outside this repository. The extension currently calls
them directly and does not yet use the shared-core contracts or policy gates. Its existing behavior
and gaps are documented in [the app guide](../apps/mia-chrome-extension/README.md).

The target architecture integrates that extension with one policy-controlled core and two execution
adapters. The worker remains a supporting feasibility proof of concept:

    Approved M.I.A. provider
              |
       normalized contracts
              |
       orchestrator / job state
              |
      carrier adapter + automation core
          /                     \
    ExtensionExecutor      RemoteBrowserExecutor
          |                     |
    active user tab        isolated worker session
          \                     /
        human review and manual final action

The core knows actions, policies, source paths, transformations, comparisons, review items, and state.
It does not know Chrome tabs or Playwright pages. Carrier adapters know page/mapping behavior but not
which executor operates it. Executor implementations know how to inspect and manipulate their browser
surface but cannot add new action types.

## Components

- contracts defines the target exchanged/persisted vocabulary and versions external shapes.
- automation-core owns state transitions, policy, confidence, source resolution, transformation,
  normalization, read-back comparison, unresolved collection, safe stops, and Executor interfaces.
- carrier-adapters owns versioned carrier/line identity, allowed origins, fingerprints, mappings,
  repeated rows, conditionals, expected validation, navigation, review, and stop points.
- mia-client hides quote search/retrieval. Bootstrap implements only synthetic memory data.
- ai-mapper hides provider SDKs. Bootstrap implements only deterministic sanitized matching.
- observability recursively redacts sensitive structured keys and likely PII in messages.
- mia-chrome-extension is the only Chrome app. It supplies the MIA sign-in/quote UI, page snapshot,
  mapping API calls, staged fill, and training-template flow. Shared policy, provenance, read-back,
  and resumable job state still need to be integrated into it.
- orchestrator-api demonstrates small typed job endpoints over in-memory queue/store interfaces.
- automation-worker demonstrates an isolated Playwright context and controlled action execution.
- mock-carriers provides a modern SPA and classic page-navigation lab.

## Data flow and provenance

This is the required shared-core flow to integrate into the MIA extension:

1. Validate MiaQuotePayload at ingress.
2. Create QuoteJob containing references, not embedded client data.
3. Capture CarrierPageSnapshot with semantics and no control values.
4. Recognize PageFingerprint through an approved adapter and origin.
5. Build FieldMappingCandidate from deterministic evidence; use sanitized AI fallback only if needed.
6. Gate confidence/risk and schema validate AutomationAction.
7. Resolve sourcePath immediately before entry.
8. Execute through an allowlisted method.
9. Read the control value back, normalize, compare, and hash.
10. Store AutomationActionResult, AuditEvent, and any ReviewItem.
11. Persist state/checkpoint and continue or stop.

## Trust boundaries

Carrier DOM is hostile input. Its text cannot modify policy or instruct the AI. AI input/output is
untrusted. Extension/worker permissions are allowlisted. Backend access must be tenant/user scoped.
Remote session artifacts are a separate encrypted, expiring security boundary. Notifications and
handoffs carry short-lived references, not payloads.

## Execution adapters

ExtensionExecutor will live at the MIA extension's browser boundary, translate controlled actions
to browser operations, and persist checkpoints outside service-worker memory. RemoteBrowserExecutor
translates the same actions to an
isolated browser API. Neither may accept an arbitrary script callback or arbitrary URL. Persistent
interactive hosting is represented by InteractiveSessionProvider so a container, VM, or desktop host
can be selected after the remote spike.

## Failure model

These are the acceptance requirements for the integrated core, not a description of all current
MIA filler failure paths:

Unknown adapter/version/domain/action, changed fingerprint, missing/conflicting data, low confidence,
read-back mismatch, page validation, authentication, legal language, and final controls fail closed.
Recoverable states become waiting_for_user or ready_for_review with reason-coded items. Terminal states
do not resume. Retries must be idempotent and revalidate the page and prior read-back before action.
