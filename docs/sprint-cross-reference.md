# Sprint Cross-Reference

> Audit of every sprint's claimed capabilities against actual code and actual test coverage. More conservative than the sprint logs.

---

## Verdict Definitions

| Verdict | Meaning |
|---------|---------|
| **IMPLEMENTED + TESTED** | Code exists in `src/`, test exists in `src/__tests__/` that exercises the code path |
| **IMPLEMENTED + UNTESTED** | Code exists in `src/`, but no test covers it |
| **PARTIAL** | Some aspects implemented, others missing or incomplete |
| **ASPIRATIONAL** | Claimed in sprint doc, infrastructure partially exists, but not wired into live data flow |

---

## Sprint 14 — Security, Multi-Tenant Auth & Deterministic Scheduling

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| Multi-tenant schema with org isolation | IMPLEMENTED + TESTED | `db.server.ts` ensureSchema, `submit-lead.test.ts` |
| Cookie-based auth with HMAC-SHA256 | IMPLEMENTED + TESTED | `auth.server.ts`, `session.server.ts`, `auth-components.test.ts` |
| Deterministic slot generation | IMPLEMENTED + TESTED | `scheduling.server.ts:generateSlots`, `slot-generation.test.ts` (9 tests) |
| Structured JSON logging | IMPLEMENTED + TESTED | `logger.server.ts`, `structured-logger.test.ts` |
| Default org seeding | IMPLEMENTED + TESTED | `auth.server.ts:seedDefaultOrgAndAdmin`, `seed.test.ts` |
| Server-enforced tenant scoping | IMPLEMENTED + TESTED | All api/*.server.ts handlers call `requireOrg()` |

---

## Sprint 15 — Multi-Tenant Isolation, Edge Telemetry

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| `requireOrg()` middleware | IMPLEMENTED + TESTED | `tenant.server.ts`, used in 51+ call sites |
| PII redaction at log write time | IMPLEMENTED + TESTED | `logger.server.ts:111-123`, `structured-logger.test.ts` |
| Zod-validated env config | IMPLEMENTED + TESTED | `env.server.ts`, startup validation |
| Strict throw-on-missing-tenant | IMPLEMENTED | `tenant.server.ts` throws `TenantError` — no test directly asserts this behavior |

---

## Sprint 16 — Async Notification Queue

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| Postgres-backed notification queue | IMPLEMENTED + TESTED | `queue.server.ts`, `notification-queue.test.ts` |
| SHA-256 idempotency key | IMPLEMENTED + TESTED | `queue.server.ts:61-76`, idempotency test |
| Exponential backoff with capped retries | IMPLEMENTED + TESTED | `queue.server.ts` retry logic, notification-queue tests |
| Fire-and-forget enqueue in submitLead | IMPLEMENTED | `leads.server.ts:103-114` — `.catch()` swallows errors (by design) |

---

## Sprint 22 — Integrated Clinic Billing, Offline PWA

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| Billing ledger with sequential numbers | IMPLEMENTED + TESTED | `billing.server.ts`, `billing.test.ts` (7 tests) |
| Duplicate invoice prevention | IMPLEMENTED + TESTED | `billing.server.ts:240-244`, billing tests |
| Offline-first PWA | IMPLEMENTED + TESTED | `useClinicOSSubmit.ts`, `offline-queue.test.ts`, `offline-store.test.ts` |
| Financial KPIs | IMPLEMENTED + TESTED | `analytics.server.ts`, `analytics.test.ts` |

---

## Sprint 25 — Real-Time SSE, RBAC, Storage

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| DB-backed SSE stream | IMPLEMENTED + TESTED | `event-bus.server.ts`, `event-bus.test.ts` (5 tests) |
| Tenant-isolated SSE | IMPLEMENTED + TESTED | `routes/api/streams/live-updates.ts` requires org; event-bus queries scoped by `tenant_id` |
| Org-isolated media storage | IMPLEMENTED + TESTED | `storage.server.ts`, `storage.test.ts` (8 tests) |
| WhatsApp media ingestion | IMPLEMENTED + TESTED | `routes/api/webhooks/whatsapp.ts`, `webhook-media.test.ts` |
| Granular RBAC server + UI guards | **PARTIAL** | Server: `requireRole()` in billing/diagnostics (6 functions). UI: `canAccessFinance()` etc. in components. **But**: most server functions (leads, scheduling, config) have NO role check — any authenticated staff user can do everything |
| Seed data hydration | IMPLEMENTED + TESTED | `seed.server.ts`, `seed.test.ts` |

---

## Sprint 27 — Concurrency Locks, Logging, Health, Docker

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| DB-level advisory locks | IMPLEMENTED + TESTED | `db.server.ts:61-93`, `billing-locks.test.ts`, `concurrency.test.ts` |
| Double-booking prevention | IMPLEMENTED + TESTED | `scheduling.server.ts:bookSlot`, `concurrency.test.ts` |
| Duplicate invoice/payment prevention | IMPLEMENTED + TESTED | `billing.server.ts:80,135`, `billing-locks.test.ts` |
| Structured JSON logger envelope | IMPLEMENTED + TESTED | `logger.server.ts`, `structured-logger.test.ts` |
| Health endpoint | IMPLEMENTED + TESTED | `routes/api/health.ts`, `health-endpoint.test.ts` |
| Docker multi-stage build | IMPLEMENTED | `Dockerfile` exists — no test verifies the Docker build works |
| S3 encrypted backup/restore | **PARTIAL** | `scripts/backup-db.sh` exists, `db-restore-test.ts` exists, but **no test runs in CI** — manual verification only |

---

## Sprint 28 — Subscription Tiers, Metering, Paywall

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| Three-tier subscription engine | IMPLEMENTED + TESTED | `subscriptions.server.ts`, `subscriptions.test.ts` (37 tests) |
| Feature gating with `ensureFeatureAccess` | IMPLEMENTED + TESTED | `subscriptions.server.ts`, metering tests |
| Usage metering with quota checks | IMPLEMENTED + TESTED | `metering.server.ts`, `metering.test.ts` (15 tests) |
| `SubscriptionGuard` client component | IMPLEMENTED + TESTED | `SubscriptionGuard.tsx`, `subscriptions.test.ts` |
| `QuotaBanner` with thresholds | IMPLEMENTED + TESTED | `QuotaBanner.tsx`, metering tests |
| Self-serve billing dashboard | IMPLEMENTED | `routes/admin/settings/billing.tsx` — no dedicated UI test for this route |

---

## Sprint 29 — Webhooks, Messaging, Financial Exports

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| Outbound webhook dispatcher | IMPLEMENTED + TESTED | `webhooks.server.ts`, `webhooks.test.ts` (16 tests) |
| HMAC-SHA256 payload signing | IMPLEMENTED + TESTED | `webhooks.server.ts:40-53`, webhooks tests |
| Webhook retry with exponential backoff | IMPLEMENTED + TESTED | `webhooks.server.ts:326-383`, webhooks tests |
| Bi-directional message ledger | IMPLEMENTED + TESTED | `messaging.server.ts`, `messaging.test.ts` (12 tests) |
| QuickBooks/Xero financial exports | IMPLEMENTED + TESTED | `financial-exports.server.ts`, `financial-exports.test.ts` (16 tests) |
| iCal calendar sync feed | IMPLEMENTED + TESTED | `routes/api/calendar-sync.ts`, `calendar-sync.test.ts` |
| Developer audit dashboard | IMPLEMENTED | `routes/admin/settings/developer.tsx` — no dedicated UI test |

---

## Sprint 30 — Reconciliation, Encryption, Forecasting, Fallback

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| Autonomous ledger reconciliation | IMPLEMENTED + TESTED | `reconciliation.server.ts`, `reconciliation.test.ts` (12 + 7 adversarial = 19 tests) |
| Atomic reconciliation with advisory lock | IMPLEMENTED + TESTED | `reconciliation.server.ts:71-154`, reconciliation tests |
| **M-Pesa real transaction reconciliation** | **UNVERIFIED** | No test uses real M-Pesa CSV data; all tests use mock data. **No staging environment test with real M-Pesa transaction exists.** |
| AES-256-GCM PII encryption | IMPLEMENTED + TESTED | `encryption.server.ts`, `encryption.test.ts` (8 adversarial tests) |
| Org-scoped key rotation with historical decryption | IMPLEMENTED + TESTED | `encryption.server.ts:103-131,190-222`, encryption adversarial tests |
| **PII encryption wired into live data** | **ASPIRATIONAL** | `encryptPII`/`decryptPII` exist but are NOT called by any lead, invoice, or message handler. PII is stored in plaintext. |
| Conversion velocity analytics | IMPLEMENTED + TESTED | `forecasting.server.ts`, `forecasting.test.ts` |
| Revenue-at-risk forecasting | IMPLEMENTED + TESTED | `forecasting.server.ts`, `forecasting.test.ts` |
| Multi-channel fallback with circuit breaker | IMPLEMENTED + TESTED | `fallback.server.ts`, `fallback.test.ts` (15 tests) |

---

## Sprint 31 — Trials, Onboarding, Checkout, Telemetry

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| 14-day trial lifecycle | IMPLEMENTED + TESTED | `trials.server.ts`, `trials.test.ts` (16 tests) |
| Graceful trial expiry (no data loss) | IMPLEMENTED | `trials.server.ts` — architectural decision, no test explicitly verifies "no data deleted on expiry" |
| Interactive onboarding wizard | IMPLEMENTED + TESTED | `OnboardingWizard.tsx`, `onboarding-wizard.test.ts` (7 tests) |
| Subscription checkout with idempotent webhooks | IMPLEMENTED + TESTED | `checkout.server.ts`, `checkout.test.ts` (14 tests) |
| Product milestone telemetry | IMPLEMENTED + TESTED | `telemetry.server.ts`, `telemetry.test.ts` (19 tests) |

---

## Sprint 32 — Feature Freeze, Verification

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| 466 tests across 48 files | **SUPERSEDED** | Now 634 tests / 54 files (Sprint 34) |
| Zero-error production build | IMPLEMENTED | `npm run build` succeeds (verified Sprint 34) |
| Flaky stress test stabilised | IMPLEMENTED + TESTED | `stress.test.ts` |

---

## Sprint 33 — Acquisition, Retention, Reviews

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| Source-classified lead ingestion | IMPLEMENTED + TESTED | `marketing/leads.server.ts`, `marketing-leads.test.ts` (37 tests) |
| 6-stage pipeline kanban | IMPLEMENTED + TESTED | `marketing/leads.server.ts`, `pipeline-board.test.ts` |
| RFM-inspired retention scoring | IMPLEMENTED + TESTED | `marketing/automation.server.ts`, `marketing-automation.test.ts` (39 tests) |
| Retention action types | IMPLEMENTED + TESTED | `marketing/automation.server.ts`, marketing-automation tests |
| Local reputation/feedback guard | IMPLEMENTED + TESTED | `marketing/reviews.server.ts`, `marketing-reviews.test.ts` (39 tests) |
| **Auto-submit positive reviews to Google** | **PARTIAL** | `review_submissions` table exists, `marketing/reviews.server.ts` creates records with `platform: 'google'`, but **no actual Google API integration exists** — the `review_url` field is set but never submitted to Google |

---

## Sprint 34 — Production Optimization & E2E Hardening

| Capability | Verdict | Evidence |
|-----------|---------|----------|
| 121-query security audit | IMPLEMENTED + TESTED | All 5 P0 fixes verified, 18 adversarial tests in `tenant-isolation-p0.test.ts` |
| SQL injection fix in bookSlot | IMPLEMENTED + TESTED | `scheduling.server.ts:240`, 5 tests in `scheduling-injection.test.ts` |
| Key rotation bug fix | IMPLEMENTED + TESTED | `encryption.server.ts:103-131`, 8 adversarial encryption tests |
| E2E lifecycle simulation | IMPLEMENTED + TESTED | `e2e-simulation.test.ts` (15 tests) |
| 5 new performance indexes | IMPLEMENTED | `db.server.ts` — indexes exist, no performance test measures their impact |

---

## Cross-Cutting: Specific Items Requested

| Capability | Verdict | Detail |
|-----------|---------|--------|
| **Reconciliation idempotency** | IMPLEMENTED + TESTED (mock) | 19 tests prove duplicate webhooks don't double-charge. **No test with real M-Pesa CSV data in staging.** |
| **Encryption key rotation** | IMPLEMENTED + TESTED | 8 adversarial tests prove v1 decrypts after rotation. **But: no live PII is encrypted — infrastructure is ASPIRATIONAL.** |
| **RBAC at UI layer** | **PARTIAL** | Client-side `canAccessFinance()` etc. hide UI elements. Server-side `requireRole()` gates billing + diagnostics only. **Most operations (leads, scheduling, config, automation) have no server-side role check.** |
| **Multi-tenant SSE channel isolation** | IMPLEMENTED + TESTED | `live-updates.ts` requires org in session; `event-bus.server.ts` scoped by `tenant_id`; P0 audit confirmed all queries scoped. |
| **Subscription tier enforcement** | IMPLEMENTED + TESTED | `checkFeatureAccess` + `checkQuota` server-side; `SubscriptionGuard` + `QuotaBanner` client-side. **But: no server-side check prevents a starter org from calling billing functions directly.** |

---

*Cross-referenced: Sprint 34*
