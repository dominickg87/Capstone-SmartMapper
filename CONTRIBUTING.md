# Contributing

SmartMapper is a security-sensitive student project. Begin with PROJECT_SCOPE.md, DOM_NOTES.md,
SECURITY.md, AGENTS.md, and relevant ADRs.

## Workflow

1. Create an issue with no secrets or real client data.
2. Branch from current main using feat/short-name, fix/short-name, docs/short-name, or
   spike/short-name.
3. Keep commits small. Use imperative conventional subjects such as feat:, fix:, test:, docs:, chore:,
   or spike:.
4. Add tests and documentation with the behavior.
5. Run all required checks.
6. Open a pull request linked to the issue.
7. Obtain at least one approval and resolve all conversations before merge.

Required main checks should be formatting, lint, strict type checking, unit tests, build, and
mock-carrier browser tests. Force pushes and branch deletion should be blocked. Direct pushes should
be disallowed after bootstrap; do not configure collaborators until Dom supplies approved usernames.

## Pull request evidence

Describe supported source fields, adapter/page versions, review conditions, safe stop behavior,
read-back behavior, and tests. If the change affects multiple packages, trust boundaries, persisted
contracts, execution policy, AI boundaries, or hosting, add or update an ADR.
