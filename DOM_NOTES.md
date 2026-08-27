# BLOCKING — repository ownership and privacy

- [ ] Transfer dominickg87/Capstone-SmartMapper to the M.I.A. GitHub organization.
- [ ] Make the repository private and verify only approved collaborators can access it.
- [ ] Keep the generic bootstrap commit local until privacy is confirmed or Dom explicitly approves
      pushing the reviewed generic files while public.

> Never paste passwords, API keys, client data, browser cookies, MFA recovery codes, private
> certificates, or other secrets into this file or any GitHub issue. Record only the approved secret
> name and the secure location where it is stored.

# DOM — Inputs, Decisions, Access, and Notes

Use this worksheet for product-owner decisions. Every unknown remains TBD — Dom. Secret location means
the name of an approved vault/owner, never the secret value.

## 1. Repository and collaborators

| Item                            | Status               | Dom's notes/decision                                                            | Secure location or owner | Needed by             |
| ------------------------------- | -------------------- | ------------------------------------------------------------------------------- | ------------------------ | --------------------- |
| Transfer to M.I.A. organization | Blocking — TBD — Dom | Current owner is dominickg87                                                    | Dom                      | Before bootstrap push |
| Private visibility              | Blocking — TBD — Dom | Current API result is public                                                    | Dom                      | Before bootstrap push |
| Student GitHub usernames        | TBD — Dom            | Do not invite until approved                                                    | Dom                      | Week 1                |
| Permission levels               | TBD — Dom            | Apply least privilege                                                           | Dom                      | Week 1                |
| Main branch protection/ruleset  | TBD — Dom            | Require PR, one approval, CI, resolved conversations; block force push/deletion | Dom                      | After bootstrap       |
| CODEOWNERS entries              | TBD — Dom            | Supply approved usernames/teams                                                 | Dom                      | Week 1                |

## 2. Capstone and legal context

| Item                                | Status    | Dom's notes/decision                  | Secure location or owner | Needed by |
| ----------------------------------- | --------- | ------------------------------------- | ------------------------ | --------- |
| Start and end dates                 | TBD — Dom | Four-month/16-week window expected    | Dom/university           | Week 1    |
| University deliverables and grading | TBD — Dom | Include required reports/demos        | University owner         | Week 1    |
| Intellectual-property ownership     | TBD — Dom | Written confirmation required         | Legal owner              | Week 1    |
| NDA/confidentiality terms           | TBD — Dom | Define student obligations            | Legal owner              | Week 1    |
| Screenshots/code in presentations   | TBD — Dom | State allowed synthetic-only material | Dom/university           | Week 2    |
| Portfolio publication               | TBD — Dom | Written approval required             | Dom/legal owner          | Week 2    |

## 3. Product scope

| Item                                 | Status    | Dom's notes/decision                               | Secure location or owner | Needed by |
| ------------------------------------ | --------- | -------------------------------------------------- | ------------------------ | --------- |
| Initial line of business             | TBD — Dom | Do not infer                                       | Product owner            | Week 1    |
| Target states                        | TBD — Dom | Do not infer                                       | Product owner            | Week 1    |
| Priority carrier 1                   | TBD — Dom | Keep name out while repository is public           | Product owner            | Week 2    |
| Priority carrier 2                   | TBD — Dom | Keep name out while repository is public           | Product owner            | Week 2    |
| Exact quote workflows                | TBD — Dom | Supply approved process maps without secrets       | Product owner            | Week 2    |
| Definition of quote ready for review | TBD — Dom | Identify fields, errors, and required manual steps | Product owner            | Week 2    |

## 4. Carrier authorization and test access

| Item                                 | Status    | Dom's notes/decision                       | Secure location or owner | Needed by             |
| ------------------------------------ | --------- | ------------------------------------------ | ------------------------ | --------------------- |
| Leadership and carrier authorization | TBD — Dom | Required before production automation      | Dom/legal owner          | Before real-site work |
| Carrier contacts                     | TBD — Dom | Private contact location only              | Secure contact system    | Week 2                |
| Automation restrictions/agreements   | TBD — Dom | Per-carrier written review                 | Legal owner              | Week 3                |
| Sandbox or test environment          | TBD — Dom | Prefer carrier-supported sandbox           | Credential owner         | Week 3                |
| Dedicated test users and roles       | TBD — Dom | Least privilege, no shared student secrets | Credential owner         | Week 3                |
| MFA process and owner                | TBD — Dom | No bypass; define human handoff            | Credential owner         | Week 3                |
| CAPTCHA expectations                 | TBD — Dom | Stop and request human action              | Carrier contact          | Week 3                |
| IP/network restrictions              | TBD — Dom | Record approved network boundary           | Technical owner          | Week 3                |

## 5. Existing M.I.A. Chrome extension

| Item                                  | Status    | Dom's notes/decision                            | Secure location or owner | Needed by |
| ------------------------------------- | --------- | ----------------------------------------------- | ------------------------ | --------- |
| Repository owner/contact              | TBD — Dom | No cross-repository inspection without approval | Technical owner          | Week 2    |
| Framework and build process           | TBD — Dom | Document supported integration point            | Technical owner          | Week 2    |
| Extension ID/environment              | TBD — Dom | Reference only; no private package material     | Technical owner          | Week 3    |
| Authentication flow                   | TBD — Dom | Diagram tokens and trust boundary, not values   | Security owner           | Week 3    |
| Current permissions                   | TBD — Dom | Review least privilege                          | Security owner           | Week 3    |
| Safe SmartMapper integration boundary | TBD — Dom | Define message/API contract                     | Technical owner          | Week 4    |

## 6. M.I.A. development API

| Item                           | Status    | Dom's notes/decision                    | Secure location or owner | Needed by |
| ------------------------------ | --------- | --------------------------------------- | ------------------------ | --------- |
| Non-production base URL        | TBD — Dom | Keep private while repository is public | API owner                | Week 12   |
| Endpoint documentation/OpenAPI | TBD — Dom | Approved development specification      | API owner                | Week 4    |
| Authentication approach        | TBD — Dom | Secret-name reference only              | Security owner           | Week 4    |
| Token lifetime                 | TBD — Dom | Include refresh/revocation behavior     | Security owner           | Week 4    |
| CORS/extension rules           | TBD — Dom | Include extension origin policy         | API owner                | Week 4    |
| Rate limits                    | TBD — Dom | Define retry/backoff expectations       | API owner                | Week 4    |
| Normalized quote schema        | TBD — Dom | Map to packages/contracts               | API owner                | Week 3    |
| Synthetic sample payload       | TBD — Dom | No production-derived PII               | API owner                | Week 3    |
| Error responses                | TBD — Dom | Include missing/conflicting cases       | API owner                | Week 4    |
| Development tenant             | TBD — Dom | Student access boundaries               | Tenant owner             | Week 12   |

## 7. Source of truth and business rules

| Item                                | Status    | Dom's notes/decision                        | Secure location or owner | Needed by      |
| ----------------------------------- | --------- | ------------------------------------------- | ------------------------ | -------------- |
| Field definitions and provenance    | TBD — Dom | Identify system of record per field         | Product/API owner        | Week 3         |
| Approved coverage defaults          | TBD — Dom | No defaults until documented                | Product owner            | Week 5         |
| Transformations                     | TBD — Dom | Define normalization and carrier formatting | Product owner            | Week 5         |
| Missing/conflicting data policy     | TBD — Dom | Default is blocking review                  | Product owner            | Week 3         |
| Always-human underwriting questions | TBD — Dom | Maintain explicit list                      | Product/legal owner      | Week 5         |
| Carrier-specific decisions          | TBD — Dom | Version and approve each rule               | Product owner            | Before adapter |

## 8. Synthetic acceptance cases

| Item                      | Status                                   | Dom's notes/decision            | Secure location or owner | Needed by |
| ------------------------- | ---------------------------------------- | ------------------------------- | ------------------------ | --------- |
| Simple driver/vehicle     | Draft fixture exists; approval TBD — Dom | Define expected results         | Product owner            | Week 2    |
| Multiple drivers/vehicles | Draft fixture exists; approval TBD — Dom | Include ordering rules          | Product owner            | Week 5    |
| Prior-insurance gap       | TBD — Dom                                | Define review behavior only     | Product owner            | Week 5    |
| Missing fields            | Draft path exists; approval TBD — Dom    | Define blocking fields          | Product owner            | Week 3    |
| Conditional questions     | Draft mock exists; approval TBD — Dom    | Supply approved rules           | Product owner            | Week 6    |
| Invalid data              | TBD — Dom                                | Expected validation messages    | Product owner            | Week 6    |
| State-specific scenario   | TBD — Dom                                | Choose approved synthetic state | Product owner            | Week 7    |

## 9. AI provider

| Item                            | Status    | Dom's notes/decision                       | Secure location or owner | Needed by |
| ------------------------------- | --------- | ------------------------------------------ | ------------------------ | --------- |
| Provider/project                | TBD — Dom | Offline mock remains default               | AI/security owner        | Week 10   |
| Approved model capabilities     | TBD — Dom | Structured mapping only                    | AI/security owner        | Week 10   |
| Data-processing requirements    | TBD — Dom | Prefer semantic IDs; no raw PII by default | Privacy owner            | Week 10   |
| Retention and training settings | TBD — Dom | Require written confirmation               | Privacy owner            | Week 10   |
| Region                          | TBD — Dom | Confirm regulatory requirements            | Security owner           | Week 10   |
| Budget and rate limits          | TBD — Dom | Set hard development cap                   | Budget owner             | Week 10   |
| Secret-name reference           | TBD — Dom | Store value only in approved vault         | Secret owner             | Week 10   |

## 10. Azure decision

| Item                                     | Status    | Dom's notes/decision                                | Secure location or owner | Needed by   |
| ---------------------------------------- | --------- | --------------------------------------------------- | ------------------------ | ----------- |
| Subscription and tenant owner            | TBD — Dom | No resources provisioned by bootstrap               | Cloud owner              | Week 3      |
| Approved region/resource naming/tags     | TBD — Dom | Include environment and owner tags                  | Cloud owner              | Week 4      |
| Budget cap and alerts                    | TBD — Dom | Include automatic teardown                          | Budget owner             | Week 4      |
| Environments                             | TBD — Dom | Development first                                   | Cloud owner              | Week 4      |
| Managed identity/service principal owner | TBD — Dom | Prefer managed identity                             | Identity owner           | Week 4      |
| Key Vault                                | TBD — Dom | Secret-name references only                         | Security owner           | Week 4      |
| Service Bus or Storage Queue             | TBD — Dom | Spike and compare                                   | Architecture owner       | Week 4      |
| Container Registry                       | TBD — Dom | Only if worker image is selected                    | Cloud owner              | Week 4      |
| Container Apps Jobs vs VM/VMSS/AVD       | TBD — Dom | Decide from remote spike                            | Architecture owner       | Week 4 gate |
| Storage and Application Insights         | TBD — Dom | Encrypted short-lived artifacts; PII-safe telemetry | Security owner           | Week 4      |
| Networking and teardown                  | TBD — Dom | Approved egress and automatic cleanup               | Cloud owner              | Week 4      |

## 11. Remote authentication and sessions

| Item                                      | Status    | Dom's notes/decision                 | Secure location or owner | Needed by |
| ----------------------------------------- | --------- | ------------------------------------ | ------------------------ | --------- |
| Whether carrier credentials may be stored | TBD — Dom | Default is no                        | Security/legal owner     | Week 3    |
| User session handoff required             | TBD — Dom | Evaluate interactive requirement     | Product owner            | Week 3    |
| Remote review method                      | TBD — Dom | Must preserve exact isolated session | Architecture owner       | Week 4    |
| Session timeout                           | TBD — Dom | Define warning and expiration        | Security owner           | Week 4    |
| Encrypted profile retention               | TBD — Dom | Default ephemeral                    | Security owner           | Week 4    |
| User revocation                           | TBD — Dom | Immediate session termination path   | Security owner           | Week 4    |

## 12. Notifications

| Item                          | Status    | Dom's notes/decision               | Secure location or owner | Needed by |
| ----------------------------- | --------- | ---------------------------------- | ------------------------ | --------- |
| In-app status                 | TBD — Dom | Preferred source of truth          | Product owner            | Week 12   |
| Extension notification        | TBD — Dom | Permission and UX review           | Product owner            | Week 8    |
| Email/webhook/polling         | TBD — Dom | Choose approved channels           | Product owner            | Week 12   |
| Recipients and failure alerts | TBD — Dom | Avoid sensitive detail             | Product/security owner   | Week 12   |
| Ready-for-review action link  | TBD — Dom | Short-lived, authenticated handoff | Security owner           | Week 12   |

## 13. Security and privacy

| Item                                 | Status    | Dom's notes/decision                | Secure location or owner | Needed by |
| ------------------------------------ | --------- | ----------------------------------- | ------------------------ | --------- |
| Data classification                  | TBD — Dom | Classify quote fields and artifacts | Privacy owner            | Week 2    |
| Allowed student access               | TBD — Dom | No production data by default       | Privacy owner            | Week 1    |
| PII masking                          | TBD — Dom | Define display and support policy   | Privacy owner            | Week 6    |
| Screenshot/trace policy              | TBD — Dom | Default disabled/ignored            | Security owner           | Week 3    |
| Retention and deletion verification  | TBD — Dom | Per artifact and log class          | Privacy owner            | Week 3    |
| Audit requirements                   | TBD — Dom | Define event retention/access       | Compliance owner         | Week 4    |
| Incident contact and breach response | TBD — Dom | Private channel only                | Incident owner           | Week 1    |

## 14. Product acceptance

| Item                         | Status                                | Dom's notes/decision                          | Secure location or owner | Needed by |
| ---------------------------- | ------------------------------------- | --------------------------------------------- | ------------------------ | --------- |
| Accuracy thresholds          | Proposed in scope; approval TBD — Dom | Confirm fixture set                           | Product owner            | Week 2    |
| Completion-time targets      | TBD — Dom                             | Measure local/remote separately               | Product owner            | Week 4    |
| Supported-field list         | TBD — Dom                             | Version per carrier/LOB/state                 | Product owner            | Week 5    |
| Acceptable manual steps      | TBD — Dom                             | Authentication and final review remain manual | Product owner            | Week 4    |
| Pilot users                  | TBD — Dom                             | Approved users only                           | Product owner            | Week 13   |
| Test schedule/sign-off owner | TBD — Dom                             | Include security and UAT                      | Product owner            | Week 13   |

## 15. Team cadence

| Item                      | Status    | Dom's notes/decision                     | Secure location or owner | Needed by |
| ------------------------- | --------- | ---------------------------------------- | ------------------------ | --------- |
| Recurring meeting cadence | TBD — Dom | Weekly demo recommended                  | Dom                      | Week 1    |
| Demo time                 | TBD — Dom | Record time zone                         | Dom                      | Week 1    |
| Escalation path           | TBD — Dom | Product/security/technical paths         | Dom                      | Week 1    |
| Technical mentor          | TBD — Dom | Assign architecture reviewer             | Dom                      | Week 1    |
| Decision turnaround       | TBD — Dom | Recommend two business days for blockers | Dom                      | Week 1    |

## 16. Open notes and decisions

| Date       | Decision or note                                                     | Status        | Owner               |
| ---------- | -------------------------------------------------------------------- | ------------- | ------------------- |
| 2026-08-27 | Repository API reported public; generic bootstrap must not be pushed | Blocking      | Dom                 |
| TBD — Dom  | Week 4 local-versus-remote decision                                  | Pending spike | Dom/technical owner |
| TBD — Dom  | Add approved decisions here without secret values                    | Open          | Dom                 |
