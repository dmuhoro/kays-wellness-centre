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
| 1 | Test suite passes | **PASS** | `npm test` — 643 tests / 56 files, all passing (Sprint 34) |
| 2 | Production build succeeds | **PASS** | `npm run build` — zero errors (Sprint 34) |
| 3 | No TypeScript errors | **PASS** | `npx tsc --noEmit` — verified Sprint 34 |

### Multi-Tenant Isolation

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 4 | All server queries scoped by org | **PASS** | `tenant-isolation-p0.test.ts` — 22 adversarial tests prove P0 fixes |
| 5 | Cross-tenant timing leak fixed | **PASS** | `interactions.server.ts:91` — correlated subquery scoped; test in `tenant-isolation-p0.test.ts` |
| 6 | Background queue scoped per-tenant | **PASS** | `queue.server.ts:processNotifications` — per-tenant dispatch; test in `tenant-isolation-p0.test.ts` |
| 7 | Diagnostics gated to SUPER_ADMIN | **PASS** | `diagnostics.server.ts:38,59,85` — `requireRole(ROLES.SUPER_ADMIN)`; test in `queue-diagnostics.test.ts` |
| 8 | Milestone stats gated to SUPER_ADMIN | **PASS** | `telemetry.server.ts` — `requireRole(ROLES.SUPER_ADMIN)`; test in `telemetry.test.ts` |
| 9 | SQL injection in booking fixed | **PASS** | `scheduling.server.ts:240` — bound params; 6 tests in `scheduling-injection.test.ts` |
| 10 | Scheduling orgId from requireOrg() | **PASS** | `bookSlot`/`reserveSlot` — `organizationId` removed from input validators; 4 tests in `tenant-isolation-p0.test.ts` |

### Authentication & Session

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 11 | Login creates valid session cookie | **PASS** | `auth-components.test.ts` — login flow tested |
| 12 | Session JWT is HMAC-signed | **PASS** | `session.server.ts:14-22` — HMAC-SHA256 with timingSafeEqual |
| 13 | Session expires after 24 hours | **PASS** | `session.server.ts:38` — `Date.now() > payload.exp` check |
| 14 | **SESSION_SECRET throws in production if default** | **PASS** | `env.server.ts:39-43` — throws FATAL at boot; 3 tests in `env-production-guard.test.ts` |
| 15 | **Logout endpoint exists** | **PASS** | `auth.server.ts:logout` — `deleteCookie` clears session; test in `auth-logout.test.ts` |
| 16 | PasscodeGate is cosmetic only | **PASS** | `PasscodeGate.tsx:8` — hardcoded `"0726"` in client JS; no server validation |

### RBAC

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 17 | Billing operations gated to owner/admin | **PASS** | `billing.server.ts:227,253,279` — `requireRole(SUPER_ADMIN, CLINIC_OWNER)`; `billing.test.ts` |
| 18 | Queue diagnostics gated to SUPER_ADMIN | **PASS** | `diagnostics.server.ts:38,59,85` — `requireRole(SUPER_ADMIN)`; `queue-diagnostics.test.ts` |
| 19 | Lead delete gated to owner/admin | **PASS** | `leads.server.ts:253` — `requireRole(SUPER_ADMIN, CLINIC_OWNER)` |
| 20 | **Lead update not gated by role** | **KNOWN GAP** | `updateLead` has no `requireRole` — staff can update leads. Acceptable for pilot. |
| 21 | **Scheduling not gated by role** | **KNOWN GAP** | `bookSlot`/`reserveSlot` have no `requireRole` — staff can book slots. Acceptable for pilot. |
| 22 | **Clinic config not gated by role** | **KNOWN GAP** | `saveClinicConfig` has no `requireRole` — staff can change business hours. Acceptable for pilot. |

### Billing & Payments

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 23 | Invoice generation with sequential numbers | **PASS** | `billing.test.ts` — INV-YYYY-NNNNN format verified |
| 24 | Payment recording with receipt numbers | **PASS** | `billing.test.ts` — KWC-YYYY-NNNNN format verified |
| 25 | Double-payment prevention via advisory lock | **PASS** | `billing-locks.test.ts` — concurrent payment test |
| 26 | Invoice status workflow (draft→issued→paid→void) | **PASS** | `billing.test.ts` — status transitions tested |

### Scheduling

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 27 | Slot generation from availability | **PASS** | `slot-generation.test.ts` — 9 tests |
| 28 | Double-booking prevention | **PASS** | `concurrency.test.ts` — advisory lock + FOR UPDATE |
| 29 | Slot reservation with TTL | **PASS** | `scheduling.server.ts:reserveSlot` — tested in concurrency tests |

### Notification Queue

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 30 | Idempotent enqueue | **PASS** | `notification-queue.test.ts` — SHA-256 key, UNIQUE constraint |
| 31 | Retry with exponential backoff | **PASS** | `notification-queue.test.ts` — retry lifecycle tested |
| 32 | **WhatsApp delivery in production** | **UNVERIFIED** | **Manual**: Send a test lead with WhatsApp configured — does the message arrive? (Requires `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` env vars) |

### Reconciliation

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 33 | M-Pesa CSV parsing | **PASS** | `reconciliation.test.ts` — 19 tests including adversarial |
| 34 | Duplicate webhook idempotency | **PASS** | `reconciliation.test.ts` — duplicate webhook test |
| 35 | Auto-match to pending invoices | **PASS** | `reconciliation.test.ts` — amount + phone matching |
| 36 | **Real M-Pesa transaction reconciled in staging** | **UNVERIFIED** | **Manual**: Upload a real M-Pesa CSV export from a test M-Pesa account — does it match a test invoice? This is a separate verification from unit tests. |

### Encryption

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 37 | AES-256-GCM encrypt/decrypt | **PASS** | `encryption.test.ts` — 8 adversarial tests |
| 38 | Key rotation with historical decryption | **PASS** | `encryption.test.ts` — v1 decrypts after rotation to v2 |
| 39 | **PII encryption descoped from v1 pilot** | **DESCOPED** | Infrastructure exists and is tested (`encryptFields`/`decryptFields`), but not wired into lead/invoice/message write paths. **Decision documented in `docs/decisions.md`**. PII stored in plaintext for v1 pilot. Will be wired in v2. |

### Webhooks

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 40 | Outbound webhook dispatch | **PASS** | `webhooks.test.ts` — 16 tests |
| 41 | HMAC-SHA256 signature verification | **PASS** | `webhooks.test.ts` — sign + verify |
| 42 | Retry with exponential backoff | **PASS** | `webhooks.test.ts` — retry lifecycle |

### Real-Time (SSE)

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 43 | Event bus publishes to DB | **PASS** | `event-bus.test.ts` — 5 tests |
| 44 | SSE endpoint requires org in session | **PASS** | `routes/api/streams/live-updates.ts` — `getCurrentOrgId()` check |
| 45 | **SSE delivers to browser in real-time** | **UNVERIFIED** | **Manual**: Open admin dashboard, update a lead in another tab — does the UI update without refresh? |

### Subscription & Metering

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 46 | Tier definitions (starter/growth/enterprise) | **PASS** | `subscriptions.test.ts` — 37 tests |
| 47 | Usage metering (leads, storage, users) | **PASS** | `metering.test.ts` — 15 tests |
| 48 | Quota enforcement | **PASS** | `metering.test.ts` — checkQuota tested |
| 49 | **Paywall blocks feature access in UI** | **UNVERIFIED** | **Manual**: As starter tier, try to access enterprise feature — does PaywallModal appear? |

### Marketing Pipeline

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 50 | Lead ingestion with source classification | **PASS** | `marketing-leads.test.ts` — 37 tests |
| 51 | 6-stage pipeline board | **PASS** | `pipeline-board.test.ts` |
| 52 | Retention scoring (RFM) | **PASS** | `marketing-automation.test.ts` — 39 tests |
| 53 | Satisfaction prompts / NPS | **PASS** | `marketing-reviews.test.ts` — 39 tests |
| 54 | **Auto-submit reviews to Google** | **FAIL** | `review_submissions` table exists but no Google API integration. Reviews are logged, not submitted. |

### Data Export

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 55 | CSV lead export | **PASS** | `exports.test.ts` |
| 56 | QuickBooks/Xero financial export | **PASS** | `financial-exports.test.ts` — 16 tests |
| 57 | iCal calendar sync | **PASS** | `calendar-sync.test.ts` |

### Infrastructure

| # | Capability | Verdict | Test / Verification Step |
|---|-----------|---------|------------------------|
| 58 | Health endpoint | **PASS** | `health-endpoint.test.ts` |
| 59 | CI pipeline exists | **PASS** | `.github/workflows/ci.yml` — GitHub Actions runs `vitest run` on push to main |
| 60 | Docker build | **UNVERIFIED** | **Manual**: `docker build -t kwc .` — does it succeed? |

---

## Blocker Summary

| # | Blocker | Severity | Owner |
|---|---------|----------|-------|
| 32 | WhatsApp delivery unverified in production | **MEDIUM** — requires live WhatsApp credentials | — |
| 36 | Real M-Pesa reconciliation unverified | **MEDIUM** — requires staging M-Pesa account | — |
| 45 | SSE real-time delivery unverified | **LOW** — UI may not update without refresh | — |
| 49 | Paywall UI unverified | **LOW** — subscription enforcement may not work in UI | — |
| 54 | No Google review auto-submission | **LOW** — reviews are logged but not submitted | — |
| 60 | Docker build unverified | **LOW** — may need Dockerfile fixes | — |

---

## Known Gaps (Accepted for Pilot)

| # | Gap | Rationale |
|---|-----|-----------|
| 20 | Lead update not gated by role | All authenticated users can update leads — acceptable for small pilot team |
| 21 | Scheduling not gated by role | All authenticated users can book slots — acceptable for small pilot team |
| 22 | Clinic config not gated by role | All authenticated users can change hours — acceptable for small pilot team |
| 39 | PII encryption descoped from v1 | Infrastructure tested but not wired into write paths. Will be wired in v2. |

---

## Pre-Pilot Checklist (Run Before July 31)

| # | Action | Owner | Done? |
|---|--------|-------|-------|
| 1 | Verify `SESSION_SECRET` is set in Vercel env (app now throws at boot if default) | — | ☐ |
| 2 | Change `DEFAULT_ADMIN_PASSWORD` from `"admin0726"` after first login | — | ☐ |
| 3 | Run `docker build -t kwc .` and verify it succeeds | — | ☐ |
| 4 | Test real M-Pesa CSV upload in staging environment | — | ☐ |
| 5 | Test WhatsApp message delivery with real phone number in staging | — | ☐ |
| 6 | Open admin dashboard, update a lead in another tab, verify SSE updates UI | — | ☐ |
| 7 | Verify subscription paywall appears for starter tier users | — | ☐ |

---

*Last updated: Sprint 34*
