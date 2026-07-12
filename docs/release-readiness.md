# Release Readiness — July 31 Pilot

> Literal go/no-go checklist. Every row requires a cited test or a cited manual verification step. No row gets PASS on narrative alone.

---

## How to Use This Document

1. Run `npm test` and record the result
2. For each manual verification step, execute it and record PASS/FAIL
3. Any FAIL or UNVERIFIED row is a blocker — do not proceed to pilot
4. Update this document as blockers are resolved

---

## Go / No-Go Table

### Build & Test Infrastructure

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 1 | Test suite passes | **PASS** | `npm test` — 634 tests / 54 files, all passing (Sprint 34) |
| 2 | Production build succeeds | **PASS** | `npm run build` — zero errors (Sprint 34) |
| 3 | No TypeScript errors | **PASS** | `npx tsc --noEmit` — verified Sprint 34 |

### Multi-Tenant Isolation

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 4 | All server queries scoped by org | **PASS** | `tenant-isolation-p0.test.ts` — 18 adversarial tests prove P0 fixes |
| 5 | Cross-tenant timing leak fixed | **PASS** | `interactions.server.ts:91` — correlated subquery scoped; test in `tenant-isolation-p0.test.ts` |
| 6 | Background queue scoped per-tenant | **PASS** | `queue.server.ts:processQueue(tenantId)` — test in `tenant-isolation-p0.test.ts` |
| 7 | Diagnostics gated to SUPER_ADMIN | **PASS** | `diagnostics.server.ts:38,59,85` — `requireRole(ROLES.SUPER_ADMIN)`; test in `queue-diagnostics.test.ts` |
| 8 | Milestone stats gated to SUPER_ADMIN | **PASS** | `telemetry.server.ts` — `requireRole(ROLES.SUPER_ADMIN)`; test in `telemetry.test.ts` |
| 9 | SQL injection in booking fixed | **PASS** | `scheduling.server.ts:240` — bound params; 5 tests in `scheduling-injection.test.ts` |

### Authentication & Session

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 10 | Login creates valid session cookie | **PASS** | `auth-components.test.ts` — login flow tested |
| 11 | Session JWT is HMAC-signed | **PASS** | `session.server.ts:14-22` — HMAC-SHA256 with timingSafeEqual |
| 12 | Session expires after 24 hours | **PASS** | `session.server.ts:38` — `Date.now() > payload.exp` check |
| 13 | **SESSION_SECRET is set in production** | **UNVERIFIED** | **Manual**: Check Vercel env vars — is `SESSION_SECRET` set to a value other than `"dev-secret-change-in-prod"`? If not, any attacker can forge sessions. |
| 14 | **No brute-force protection on login** | **UNVERIFIED** | **Manual**: Attempt 100 rapid login attempts — does the server rate-limit or lock out? (Known gap: `auth.server.ts` has no rate limiting) |
| 15 | **Logout endpoint exists** | **FAIL** | No `clearCookie()` call exists anywhere. Users cannot log out. Known gap. |
| 16 | PasscodeGate is cosmetic only | **PASS** | `PasscodeGate.tsx:8` — hardcoded `"0726"` in client JS; no server validation |

### RBAC

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 17 | Billing operations gated to owner/admin | **PASS** | `billing.server.ts:227,253,279` — `requireRole(SUPER_ADMIN, CLINIC_OWNER)`; `billing.test.ts` |
| 18 | Queue diagnostics gated to SUPER_ADMIN | **PASS** | `diagnostics.server.ts:38,59,85` — `requireRole(SUPER_ADMIN)`; `queue-diagnostics.test.ts` |
| 19 | **Lead CRUD not gated by role** | **UNVERIFIED** | **Manual**: Login as `staff` role user — can they update/delete leads? (Code shows no `requireRole` in `updateLead`/`submitLead`) |
| 20 | **Scheduling not gated by role** | **UNVERIFIED** | **Manual**: Login as `staff` — can they book slots? (Code shows no `requireRole` in `bookSlot`) |
| 21 | **Clinic config not gated by role** | **UNVERIFIED** | **Manual**: Login as `staff` — can they change business hours? (Code shows no `requireRole` in `saveClinicConfig`) |

### Billing & Payments

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 22 | Invoice generation with sequential numbers | **PASS** | `billing.test.ts` — INV-YYYY-NNNNN format verified |
| 23 | Payment recording with receipt numbers | **PASS** | `billing.test.ts` — KWC-YYYY-NNNNN format verified |
| 24 | Double-payment prevention via advisory lock | **PASS** | `billing-locks.test.ts` — concurrent payment test |
| 25 | Invoice status workflow (draft→issued→paid→void) | **PASS** | `billing.test.ts` — status transitions tested |

### Scheduling

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 26 | Slot generation from availability | **PASS** | `slot-generation.test.ts` — 9 tests |
| 27 | Double-booking prevention | **PASS** | `concurrency.test.ts` — advisory lock + FOR UPDATE |
| 28 | Slot reservation with TTL | **PASS** | `scheduling.server.ts:reserveSlot` — tested in concurrency tests |

### Notification Queue

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 29 | Idempotent enqueue | **PASS** | `notification-queue.test.ts` — SHA-256 key, UNIQUE constraint |
| 30 | Retry with exponential backoff | **PASS** | `notification-queue.test.ts` — retry lifecycle tested |
| 31 | **WhatsApp delivery in production** | **UNVERIFIED** | **Manual**: Send a test lead with WhatsApp configured — does the message arrive? (Requires `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` env vars) |

### Reconciliation

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 32 | M-Pesa CSV parsing | **PASS** | `reconciliation.test.ts` — 19 tests including adversarial |
| 33 | Duplicate webhook idempotency | **PASS** | `reconciliation.test.ts` — duplicate webhook test |
| 34 | Auto-match to pending invoices | **PASS** | `reconciliation.test.ts` — amount + phone matching |
| 35 | **Real M-Pesa transaction reconciled in staging** | **UNVERIFIED** | **Manual**: Upload a real M-Pesa CSV export from a test M-Pesa account — does it match a test invoice? This is a separate verification from unit tests. |

### Encryption

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 36 | AES-256-GCM encrypt/decrypt | **PASS** | `encryption.test.ts` — 8 adversarial tests |
| 37 | Key rotation with historical decryption | **PASS** | `encryption.test.ts` — v1 decrypts after rotation to v2 |
| 38 | **PII encryption wired into live data** | **FAIL** | `encryptPII`/`decryptPII` exist but are NOT called by any lead, invoice, or message handler. PII is stored in plaintext. Infrastructure only. |

### Webhooks

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 39 | Outbound webhook dispatch | **PASS** | `webhooks.test.ts` — 16 tests |
| 40 | HMAC-SHA256 signature verification | **PASS** | `webhooks.test.ts` — sign + verify |
| 41 | Retry with exponential backoff | **PASS** | `webhooks.test.ts` — retry lifecycle |

### Real-Time (SSE)

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 42 | Event bus publishes to DB | **PASS** | `event-bus.test.ts` — 5 tests |
| 43 | SSE endpoint requires org in session | **PASS** | `routes/api/streams/live-updates.ts` — `getCurrentOrgId()` check |
| 44 | **SSE delivers to browser in real-time** | **UNVERIFIED** | **Manual**: Open admin dashboard, update a lead in another tab — does the UI update without refresh? |

### Subscription & Metering

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 45 | Tier definitions (starter/growth/enterprise) | **PASS** | `subscriptions.test.ts` — 37 tests |
| 46 | Usage metering (leads, storage, users) | **PASS** | `metering.test.ts` — 15 tests |
| 47 | Quota enforcement | **PASS** | `metering.test.ts` — checkQuota tested |
| 48 | **Paywall blocks feature access in UI** | **UNVERIFIED** | **Manual**: As starter tier, try to access enterprise feature — does PaywallModal appear? |

### Marketing Pipeline

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 49 | Lead ingestion with source classification | **PASS** | `marketing-leads.test.ts` — 37 tests |
| 50 | 6-stage pipeline board | **PASS** | `pipeline-board.test.ts` |
| 51 | Retention scoring (RFM) | **PASS** | `marketing-automation.test.ts` — 39 tests |
| 52 | Satisfaction prompts / NPS | **PASS** | `marketing-reviews.test.ts` — 39 tests |
| 53 | **Auto-submit reviews to Google** | **FAIL** | `review_submissions` table exists but no Google API integration. Reviews are logged, not submitted. |

### Data Export

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 54 | CSV lead export | **PASS** | `exports.test.ts` |
| 55 | QuickBooks/Xero financial export | **PASS** | `financial-exports.test.ts` — 16 tests |
| 56 | iCal calendar sync | **PASS** | `calendar-sync.test.ts` |

### Infrastructure

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 57 | Health endpoint | **PASS** | `health-endpoint.test.ts` |
| 58 | Docker build | **UNVERIFIED** | **Manual**: `docker build -t kwc .` — does it succeed? |
| 59 | **CI pipeline exists** | **FAIL** | No `.github/workflows/` directory. No automated test gate before deploy. |
| 60 | **`SESSION_SECRET` rotation procedure documented** | **UNVERIFIED** | **Manual**: Is there a runbook for rotating `SESSION_SECRET` without downtime? (Currently rotates all sessions) |

---

## Blocker Summary

| # | Blocker | Severity | Owner |
|---|---------|----------|-------|
| 15 | No logout endpoint | **HIGH** — users cannot terminate sessions | — |
| 38 | PII encryption not wired into live data | **MEDIUM** — PII stored in plaintext despite infrastructure existing | — |
| 53 | No Google review auto-submission | **LOW** — reviews are logged but not submitted | — |
| 59 | No CI pipeline | **MEDIUM** — broken code deploys if tests not run locally | — |
| 13 | SESSION_SECRET may be default in production | **CRITICAL** — must verify before pilot | — |
| 14 | No brute-force protection on login | **MEDIUM** — password guessing possible | — |
| 19-21 | Most server functions unguarded by role | **MEDIUM** — staff users can do almost everything | — |

---

## Pre-Pilot Checklist (Run Before July 31)

| # | Action | Owner | Done? |
|---|--------|-------|-------|
| 1 | Verify `SESSION_SECRET` is set in Vercel env (not default) | — | ☐ |
| 2 | Change `DEFAULT_ADMIN_PASSWORD` from `"admin0726"` after first login | — | ☐ |
| 3 | Run `docker build -t kwc .` and verify it succeeds | — | ☐ |
| 4 | Test real M-Pesa CSV upload in staging environment | — | ☐ |
| 5 | Test WhatsApp message delivery with real phone number in staging | — | ☐ |
| 6 | Open admin dashboard, update a lead in another tab, verify SSE updates UI | — | ☐ |
| 7 | Login as `staff` role, verify which operations are actually restricted | — | ☐ |
| 8 | Attempt 100 rapid login attempts, verify behavior | — | ☐ |
| 9 | Verify subscription paywall appears for starter tier users | — | ☐ |

---

*Last updated: Sprint 34*
