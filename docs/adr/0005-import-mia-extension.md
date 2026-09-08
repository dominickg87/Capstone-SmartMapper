# ADR 0005: Build SmartMapper on the MIA Chrome extension

- Status: Accepted by explicit user direction; shared-core integration remains pending
- Date: 2026-09-07

## Context

The user requested copying `MIA-Chrome-Extension` branch `ChromeExtSave2AMS` into this repository
and enabling SmartMap. That branch already implements MIA sign-in, quote search, page capture,
backend mapping requests, staged form filling, feedback, and reusable mapping templates.
The user then directed the team to remove the earlier standalone extension and use the MIA clone as
the basis for all further extension development.

## Decision

Import its runtime at commit `afe0c897c5412c0f16e8d69c35931811b73fde4f` into
`apps/mia-chrome-extension`. Enable the SmartMap toolbar button, identify the Chrome package as the
capstone copy, and build it with a dependency-free static copy script through pnpm. This is the only
Chrome extension app. Remove the superseded standalone extension, its artifacts, and its unused
React tooling. Route `pnpm build:extension` and `pnpm dev:extension` to the MIA app. Keep the shared
packages, mock sites, API, and worker as supporting components. Record current behavior and limitations
in the application README; test the MIA flow with synthetic API responses and a local form.

The explicit request authorizes this local source/permission baseline import. It does not establish
repository privacy, approval to publish the imported source, backend availability, permission to use
production data, or authorization to access live carriers. No such access is part of this change.

## Consequences

The MIA extension is the ongoing product base. Its inherited filler does not yet satisfy ADRs
0001–0004. The one-shared-core target remains: integrate this extension's UI and MIA connection with
the existing provider/executor boundaries. Do not create a replacement extension or a second core.
Required work includes schema/policy gating, semantic source resolution, provenance, normalized
read-back, explicit legal/high-risk stops, durable tab/job state, and data minimization.

The imported JavaScript receives ESLint and syntax checks. Existing strict TypeScript checks stay
in place for the capstone packages; the import is not represented as a TypeScript migration. The
third-party minified PDF distribution retains its license header and is excluded from formatting
and source linting. Upstream webpack output is unused by the manifest and is not imported.

Demo credentials alone cannot establish readiness. The MIA backend must implement the connection,
quote, mapping, feedback, and training routes, authorize the demo account, and configure its own AI
provider if needed. The demo tenant and deployed backend functionality remain unverified.
