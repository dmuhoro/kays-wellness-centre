# Database Contracts

> Generated from `ensureSchema()` in `db.server.ts`. Every table, its columns, tenant-scoping verdict, and which server files own writes.

---

## Conventions

- **Tenant-scoping column**: Most tables use `organization_id UUID`. Three tables use `tenant_id UUID` instead (`notification_queue`, `audit_logs`, `live_events`). Both reference `organizations(id)`.
- **Writes**: Only files that INSERT/UPDATE/DELETE are listed. SELECT-only callers are excluded.
- **COUPLING RISK**: Flagged when a table is written from more than one server file.

---

## Tables

### organizations

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| name | VARCHAR(255) | |
| slug | VARCHAR(100) UNIQUE | |
| timezone | VARCHAR(50) DEFAULT 'UTC' | |
| settings | JSONB DEFAULT '{}' | |
| subscription_tier | VARCHAR(20) DEFAULT 'starter' | ALTERed in by Sprint 28 |
| subscription_status | VARCHAR(20) DEFAULT 'active' | |
| subscription_expires_at | TIMESTAMP | |
| leads_used | INTEGER DEFAULT 0 | |
| storage_used_bytes | BIGINT DEFAULT 0 | |
| usage_refreshed_at | TIMESTAMP | |
| trial_started_at | TIMESTAMP | ALTERed in by Sprint 31 |
| trial_ends_at | TIMESTAMP | |
| trial_converted_at | TIMESTAMP | |
| onboarding_completed_at | TIMESTAMP | |
| onboarding_config | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: This IS the tenant root. Not scoped to itself.
**Writers**: `auth.server.ts` (seed), `registration.server.ts`, `subscriptions.server.ts`, `trials.server.ts`, `metering.server.ts`, `checkout.server.ts`

---

### users

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| email | VARCHAR(255) | UNIQUE(organization_id, email) |
| password_hash | VARCHAR(255) | PBKDF2 SHA-512 |
| name | VARCHAR(255) DEFAULT '' | |
| role | VARCHAR(50) DEFAULT 'staff' | 'super_admin', 'admin', 'staff' |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `auth.server.ts` (seed), `registration.server.ts`

---

### clinic_leads

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| name | VARCHAR(255) | |
| phone | VARCHAR(50) DEFAULT '' | |
| email | VARCHAR(255) DEFAULT '' | |
| service | VARCHAR(100) DEFAULT '' | |
| channel | VARCHAR(50) DEFAULT '' | |
| priority | VARCHAR(20) DEFAULT 'medium' | |
| status | VARCHAR(50) DEFAULT 'pending' | |
| raw_payload | JSONB | |
| organization_id | UUID FK → organizations | Added by ALTER |
| appointment_timestamp | TIMESTAMP | Added by ALTER |
| provider_id | INTEGER FK → resources | Added by ALTER |
| room_id | INTEGER FK → resources | Added by ALTER |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `api/leads.server.ts` (INSERT, UPDATE, DELETE), `api/scheduling.server.ts` (UPDATE — bookSlot), `api/resources.server.ts` (UPDATE — scheduleAppointment), `api/automation.server.ts` (SELECT only, no direct writes)

> **⚠ COUPLING RISK**: Written from 3 files: `api/leads.server.ts`, `api/scheduling.server.ts`, `api/resources.server.ts`. Schema changes to this table require coordinating across all three.

---

### clinic_availability

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| day_of_week | SMALLINT | CHECK 0–6 |
| start_time | TIME | |
| end_time | TIME | |
| slot_duration_minutes | INT DEFAULT 60 | |
| UNIQUE | (organization_id, day_of_week, start_time) | |

**Tenant scope**: `organization_id`
**Writers**: `auth.server.ts` (seed), `api/scheduling.server.ts` (SELECT only)

---

### automation_state

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| lead_id | INTEGER FK → clinic_leads | ON DELETE CASCADE, UNIQUE |
| organization_id | UUID FK → organizations | |
| current_stage | VARCHAR(20) DEFAULT 'UNTOUCHED' | |
| last_interaction_at | TIMESTAMP | |
| next_action_scheduled_at | TIMESTAMP | |
| retry_count | SMALLINT DEFAULT 0 | |
| context_snapshot | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `api/automation.server.ts`

---

### clinic_configuration

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE, UNIQUE |
| business_hours | JSONB DEFAULT '{}' | |
| slot_duration_minutes | INTEGER DEFAULT 30 | |
| triage_timeout_minutes | INTEGER DEFAULT 45 | |
| custom_keywords | JSONB DEFAULT '[]' | |
| timezone | VARCHAR(50) DEFAULT 'UTC' | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `api/clinic-config.server.ts`

---

### resources

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| name | VARCHAR(255) | |
| type | VARCHAR(20) | CHECK 'PROVIDER' or 'ROOM' |
| status | VARCHAR(20) DEFAULT 'active' | CHECK 'active' or 'inactive' |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `api/resources.server.ts`

---

### invoices

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| lead_id | INTEGER FK → clinic_leads | ON DELETE CASCADE |
| organization_id | UUID FK → organizations | |
| invoice_number | VARCHAR(30) | UNIQUE(organization_id, invoice_number) |
| total_amount | NUMERIC(12,2) DEFAULT 0 | |
| status | VARCHAR(20) DEFAULT 'draft' | 'draft', 'issued', 'paid', 'void' |
| issued_at | TIMESTAMP | |
| paid_at | TIMESTAMP | |
| due_at | TIMESTAMP | |
| notes | TEXT | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `api/billing.server.ts`

---

### payments

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| invoice_id | INTEGER FK → invoices | ON DELETE CASCADE |
| organization_id | UUID FK → organizations | |
| amount | NUMERIC(12,2) | CHECK amount > 0 |
| method | VARCHAR(20) | CHECK 'cash', 'mobile_money', 'card' |
| receipt_number | VARCHAR(30) | UNIQUE(organization_id, receipt_number) |
| notes | TEXT | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `api/billing.server.ts`

---

### lead_interactions

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| lead_id | INTEGER FK → clinic_leads | ON DELETE CASCADE |
| organization_id | UUID FK → organizations | |
| event_type | VARCHAR(50) | |
| metadata | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `api/interactions.server.ts`

---

### notification_queue

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| tenant_id | UUID | NOT a FK to organizations |
| lead_id | INTEGER | |
| event_type | VARCHAR(50) | |
| idempotency_key | VARCHAR(64) UNIQUE | |
| payload_json | JSONB | |
| status | VARCHAR(20) DEFAULT 'pending' | |
| retry_count | SMALLINT DEFAULT 0 | |
| max_retries | SMALLINT DEFAULT 3 | |
| next_retry_at | TIMESTAMP | |
| last_error | TEXT | |
| created_at | TIMESTAMP | |
| processed_at | TIMESTAMP | |

**Tenant scope**: `tenant_id` (NOT `organization_id` — inconsistent with other tables)
**Writers**: `queue.server.ts`, `api/diagnostics.server.ts` (forceRetryQueueItems UPDATE)

> **⚠ SCHEMA NOTE**: Uses `tenant_id` instead of `organization_id`. No FK constraint to organizations table. This is the only data table with this pattern (besides audit_logs and live_events).

---

### audit_logs

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| tenant_id | UUID FK → organizations | ON DELETE CASCADE |
| user_id | INTEGER FK → users | |
| action_type | VARCHAR(30) | |
| target_type | VARCHAR(50) DEFAULT '' | |
| target_id | VARCHAR(50) DEFAULT '' | |
| client_ip | VARCHAR(45) | |
| metadata | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `tenant_id`
**Writers**: `audit.server.ts`

---

### slot_reservations

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| appointment_timestamp | TIMESTAMP | UNIQUE(organization_id, appointment_timestamp) |
| provider_id | INTEGER FK → resources | |
| room_id | INTEGER FK → resources | |
| expires_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `api/scheduling.server.ts` (reserveSlot)

---

### live_events

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| tenant_id | UUID FK → organizations | ON DELETE CASCADE |
| event_type | VARCHAR(50) | |
| payload | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `tenant_id`
**Writers**: `event-bus.server.ts`

---

### webhook_configs

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| url | VARCHAR(500) | |
| secret | VARCHAR(128) | HMAC signing secret |
| events | JSONB DEFAULT '[]' | |
| active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `webhooks.server.ts`

---

### webhook_deliveries

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| webhook_config_id | INTEGER FK → webhook_configs | ON DELETE CASCADE |
| event_type | VARCHAR(50) | |
| payload | JSONB DEFAULT '{}' | |
| status | VARCHAR(20) DEFAULT 'pending' | |
| response_code | INTEGER | |
| response_time_ms | INTEGER | |
| error_message | TEXT | |
| retry_count | SMALLINT DEFAULT 0 | |
| max_retries | SMALLINT DEFAULT 3 | |
| next_retry_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `webhooks.server.ts`

---

### message_ledger

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| lead_id | INTEGER FK → clinic_leads | |
| channel | VARCHAR(20) | CHECK 'whatsapp' or 'sms' |
| direction | VARCHAR(10) | CHECK 'inbound' or 'outbound' |
| from_address | VARCHAR(100) | |
| to_address | VARCHAR(100) | |
| body | TEXT DEFAULT '' | |
| status | VARCHAR(20) DEFAULT 'sent' | |
| external_id | VARCHAR(100) | |
| metadata | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `messaging.server.ts`

---

### reconciliation_log

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| inbound_reference | VARCHAR(100) | |
| inbound_amount | NUMERIC(12,2) | |
| inbound_phone | VARCHAR(30) | |
| matched_invoice_id | INTEGER FK → invoices | |
| matched_payment_id | INTEGER FK → payments | |
| status | VARCHAR(20) DEFAULT 'pending' | CHECK 'pending', 'matched', 'auto_paid', 'unmatched' |
| metadata | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `reconciliation.server.ts`

---

### org_encryption_keys

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| key_version | INTEGER DEFAULT 1 | UNIQUE(organization_id, key_version) |
| key_hash | VARCHAR(128) | SHA-256 of random passphrase |
| active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `encryption.server.ts`

---

### channel_health

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| channel | VARCHAR(20) | CHECK 'webhook', 'sms', 'whatsapp' |
| success_count | INTEGER DEFAULT 0 | |
| fail_count | INTEGER DEFAULT 0 | |
| last_success_at | TIMESTAMP | |
| last_failure_at | TIMESTAMP | |
| circuit_open | BOOLEAN DEFAULT false | |
| circuit_open_until | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| UNIQUE | (organization_id, channel) | |

**Tenant scope**: `organization_id`
**Writers**: `fallback.server.ts`

---

### product_milestones

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| user_id | INTEGER FK → users | |
| milestone_key | VARCHAR(60) | UNIQUE(organization_id, milestone_key) |
| milestone_label | VARCHAR(120) DEFAULT '' | |
| metadata | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `telemetry.server.ts`

---

### checkout_sessions

| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR(80) PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| target_tier | VARCHAR(20) | |
| payment_provider | VARCHAR(20) | CHECK 'mpesa', 'card', 'bank_transfer' |
| amount_kes | INTEGER | |
| status | VARCHAR(20) DEFAULT 'pending' | CHECK 'pending', 'processing', 'completed', 'failed', 'expired' |
| external_ref | VARCHAR(100) | |
| metadata | JSONB DEFAULT '{}' | |
| expires_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `checkout.server.ts`

---

### retention_tasks

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| lead_id | INTEGER FK → clinic_leads | ON DELETE CASCADE |
| action_type | VARCHAR(40) | |
| channel | VARCHAR(20) DEFAULT 'whatsapp' | |
| message | TEXT DEFAULT '' | |
| scheduled_for | TIMESTAMP | |
| status | VARCHAR(20) DEFAULT 'pending' | CHECK 'pending', 'sent', 'failed', 'cancelled' |
| metadata | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `marketing/automation.server.ts`

---

### satisfaction_prompts

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| invoice_id | INTEGER FK → invoices | |
| lead_id | INTEGER FK → clinic_leads | ON DELETE CASCADE |
| message | TEXT DEFAULT '' | |
| status | VARCHAR(20) DEFAULT 'pending' | CHECK 'pending', 'sent', 'responded', 'expired' |
| sentiment | VARCHAR(10) | CHECK 'positive', 'neutral', 'negative' |
| nps_score | SMALLINT | CHECK 0–10 |
| review_submitted | BOOLEAN DEFAULT false | |
| responded_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `marketing/reviews.server.ts`

---

### feedback_responses

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| prompt_id | INTEGER FK → satisfaction_prompts | ON DELETE CASCADE |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| lead_id | INTEGER FK → clinic_leads | ON DELETE CASCADE |
| nps_score | SMALLINT | CHECK 0–10 |
| sentiment | VARCHAR(10) | CHECK 'positive', 'neutral', 'negative' |
| comment | TEXT | |
| review_submitted | BOOLEAN DEFAULT false | |
| platform | VARCHAR(20) DEFAULT 'internal' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `marketing/reviews.server.ts`

---

### review_submissions

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE |
| feedback_id | INTEGER FK → feedback_responses | ON DELETE CASCADE |
| lead_id | INTEGER FK → clinic_leads | ON DELETE CASCADE |
| platform | VARCHAR(20) DEFAULT 'google' | |
| review_url | VARCHAR(500) | |
| status | VARCHAR(20) DEFAULT 'pending' | CHECK 'pending', 'submitted', 'failed', 'approved' |
| submitted_at | TIMESTAMP | |
| metadata | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `marketing/reviews.server.ts`

---

### review_guard_config

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| organization_id | UUID FK → organizations | ON DELETE CASCADE, UNIQUE |
| review_guard_enabled | BOOLEAN DEFAULT true | |
| auto_send_satisfaction | BOOLEAN DEFAULT true | |
| nps_review_threshold | SMALLINT DEFAULT 9 | CHECK 0–10 |
| review_platform | VARCHAR(20) DEFAULT 'google' | |
| custom_satisfaction_message | TEXT | |
| satisfaction_cooldown_days | SMALLINT DEFAULT 30 | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Tenant scope**: `organization_id`
**Writers**: `marketing/reviews.server.ts`

---

## Coupling Risks

| Table | Writers | Risk |
|-------|---------|------|
| `clinic_leads` | `api/leads.server.ts`, `api/scheduling.server.ts`, `api/resources.server.ts` | **HIGH** — 3 files write to the same table with different business logic. Schema changes require coordinating all three. |
| `notification_queue` | `queue.server.ts`, `api/diagnostics.server.ts` | LOW — diagnostics only does force-retry UPDATE |
| All other tables | Single writer each | No coupling risk |

---

## Tenant-Scoping Inconsistency

Three tables use `tenant_id` instead of `organization_id`:

- `notification_queue` — no FK constraint to organizations
- `audit_logs` — FK to organizations
- `live_events` — FK to organizations

All other tables use `organization_id`. This inconsistency is noted but functionally equivalent since both store the org UUID.

---

*Generated from `db.server.ts:ensureSchema()` — Sprint 34*
