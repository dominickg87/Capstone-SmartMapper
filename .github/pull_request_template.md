## Summary

Describe the user-visible or architectural outcome and link the issue.

## Safety and data review

- [ ] Uses synthetic data only.
- [ ] Adds no secrets, credentials, browser state, or unredacted PII.
- [ ] Does not submit, bind, attest, sign, accept terms, or bypass MFA/CAPTCHA.
- [ ] Preserves source-field provenance and read-back validation.
- [ ] Updates an ADR for any cross-cutting architectural decision.

## Validation

- [ ] pnpm format:check
- [ ] pnpm lint
- [ ] pnpm typecheck
- [ ] pnpm test
- [ ] pnpm build
- [ ] pnpm test:e2e when browser behavior changed
