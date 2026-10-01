# ADR 0008: Supervised testing across carrier websites

- Status: Accepted from Dom's explicit request on October 1, 2026.
- Extends ADRs 0005 and 0007 for the local POC.

Dom will operate his own authenticated carrier tabs and requested testing on whichever carrier
website he opens, without separate origin configuration. This supersedes the earlier single-site
approval for his supervised sessions. It does not authorize unattended live-carrier access by agents.

Enable `VITE_SMARTMAPPER_ALLOW_ANY_CARRIER=true` in the local extension build and
`SMARTMAPPER_ALLOW_ANY_CARRIER=true` in the local backend and M.I.A. environments. All flags default
false. The backend rejects this mode outside `NODE_ENV=development`; M.I.A. only honors it when
`APP_ENV=local`. Production configurations continue using exact carrier-origin allowlists.

In this mode, a canonical HTTPS origin can start a mapping job without a listed carrier entry.
HTTP is limited to explicitly listed localhost fixtures. Credentials, paths, queries, fragments,
browser-internal URLs and wildcard origin strings are rejected. The backend never fetches the
carrier origin. The extension retains permanent host permissions for its backend and M.I.A. only;
Chrome grants temporary carrier access when the human clicks its toolbar icon via `activeTab`.

The selected quote, tenant/user authorization, one-use verifier grant, job tab/origin binding,
page revision, source provenance, equivalence check, browser read-back and action policy still apply.
Changing carriers requires a new job and a toolbar click in the new tab. Next/Continue, submission,
Bind, Issue, Sell, payment, consent, signatures and authentication remain human actions.

Tests cover default-closed and development-only configuration, malformed and insecure origins,
exact grant binding, revocation of broad access, a new synthetic HTTPS site absent from host
permissions, refusal to resume in a different carrier tab, and a final submit control never clicked.
Browser tests build an isolated any-carrier extension and intercept synthetic site traffic locally.

This removes the configuration gate; it does not guarantee that every carrier's layout, embedded
frames or custom controls are supported. Unsupported controls remain review items.
