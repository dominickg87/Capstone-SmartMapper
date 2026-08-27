# Carrier adapter guide

Carrier adapters are versioned plugins used by both executors. Bootstrap adapters represent only mock
sites and must not be renamed to real carriers.

## Required identity and behavior

Declare adapter ID/version, non-sensitive display name, carrier key, supported line(s), and explicit
allowed origins. Define page IDs with recognition signals, validation messages, next-page
expectations, and stop points. Define mappings with source-path patterns, stable target hints, aliases,
transformation, read-back normalization, confidence, risk, requirement, and optional repeated
collection.

Conditional rules state source condition, affected mappings, and missing-data behavior. Review
requirements must identify ambiguity/high risk. Post-fill validation returns page errors; it never
silently dismisses them.

## Locator evidence order

1. Exact adapter rule using label and accessible name.
2. Role plus accessible name.
3. Nearby stable text, form name, or documented stable ID.
4. Controlled semantic fallback with confidence evidence.
5. AI-assisted target proposal with mandatory schema/policy gate.
6. Human review.

Do not lead with long nth-child selectors, absolute XPath, transient framework classes, coordinates,
or random IDs. Iframes and shadow roots need explicit modeled boundaries.

## Repeated records

Use semantic patterns such as drivers[*].dateOfBirth and bind each rendered row to an approved source
index. Confirm list length, ordering, add/remove behavior, validation, and read-back. A mismatch pauses;
never shift data into the next row silently.

## Version and maintenance workflow

1. Detect an unexpected fingerprint and stop as page_changed.
2. Capture only an approved redacted semantic snapshot.
3. Reproduce the layout in the mock lab.
4. Update recognition/mapping aliases or rules.
5. Increment adapter version according to compatibility impact.
6. Add original and changed-layout regression tests.
7. Review policy, authorization, and supported-field metrics.
8. Release through reviewed CI and monitor reason codes.

Production adapter creation is blocked until Dom supplies an approved carrier, line/state, workflow,
authorization, sandbox/test user, business rules, and privacy controls.
