# Architectural Decisions

> Decisions already made and visible in the codebase. Future decisions get appended here, not re-litigated in chat.

---

## D1: TanStack Start over Next.js

**Context:** The project needed a React meta-framework for SSR, routing, and server functions. Next.js was the default option but its App Router, server actions, and edge runtime model added complexity. TanStack Start provides file-based routing via TanStack Router with `createServerFn` that integrates directly with the TanStack Query cache.

**Decision:** Use TanStack Start + TanStack Router (`@tanstack/react-start` v1.131.0) as the framework.

**Consequence:**
- `createServerFn` replaces API routes — no Express/Fastify layer
- File-based routing in `src/routes/` generates `src/routeTree.gen.ts` (must never be edited manually — AGENTS.md rule 1)
- `@lovable.dev/vite-tanstack-config` provides Vite config (nitro preset: `vercel`)
- No edge runtime — runs on Vercel serverless functions (Node.js)
- Trade-off: smaller ecosystem than Next.js; fewer community packages and examples

**Status:** Accepted

---

## D2: Raw SQL via `postgres` library over ORM

**Context:** The project needed database access. ORMs like Prisma or Drizzle were considered but add a schema abstraction layer that constrains query patterns.

**Decision:** Use `postgres` v3.4.5 (the `postgresjs/postgres` library) with raw `db.unsafe(sql, params)` for all queries. No ORM. All table DDL lives in `db.server.ts:ensureSchema()`.

**Consequence:**
- Full SQL control — no query builder limitations
- No migration system — schema changes are applied via `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` in `ensureSchema()`
- Every developer must know SQL; no type-safe query builder
- Tenant scoping is manual — every query must include `organization_id = $N`
- All 121 queries in the codebase are hand-written parameterized SQL

**Status:** Accepted

---

## D3: PasscodeGate as Interim Auth for Diagnostics

**Context:** The diagnostics page (`/admin/diagnostics`) needed some access control before the full session-based auth system was built. A full auth check was considered too heavy for an engineering-only page.

**Decision:** Use a client-side hardcoded passcode (`"0726"`) in `PasscodeGate.tsx` as a temporary speed-bump. The real auth system (`auth.server.ts` + `session.server.ts`) was built in parallel and now protects all other admin routes.

**Consequence:**
- Passcode is visible in the JS bundle — provides zero security against anyone with DevTools
- Server-side auth (`requireRole(ROLES.SUPER_ADMIN)`) now protects the server functions the diagnostics page calls (e.g., `getQueueTelemetry`, `forceRetryQueueItems`)
- The PasscodeGate should be removed once the diagnostics page is gated behind real auth
- This was always intended as interim — it is not the auth model

**Status:** Superseded by server-side RBAC. PasscodeGate remains as UI speed-bump only.

---

## D4: localStorage-Based Offline Queue over IndexedDB

**Context:** The front-door lead submission form needed to work offline. When the network is unavailable, form submissions must be cached and retried automatically.

**Decision:** Use `localStorage` with a JSON array under key `kwc_pending_submissions` (`useClinicOSSubmit.ts`). On reconnect, iterate and re-submit each packet.

**Consequence:**
- Simple implementation — `JSON.parse`/`JSON.stringify` on a single key
- 5MB storage limit (localStorage) — sufficient for lead submissions (small JSON objects), insufficient for large file data
- No structured querying — cannot filter/search pending items, only iterate all
- No transactional guarantees — if the browser crashes mid-flush, some items may be lost
- IndexedDB would provide more storage and structured access but adds significant complexity
- Trade-off accepted: lead submissions are small and infrequent; localStorage is adequate

**Status:** Accepted

---

## D5: HMAC-Signed JWT over Encrypted Session

**Context:** The session system needed to store user identity (`userId`, `orgId`, `role`) across requests without server-side session storage.

**Decision:** Use HMAC-SHA256 signed base64url tokens in an `httpOnly` cookie (`kwc_session`). The payload is plaintext JSON; the signature prevents tampering.

**Consequence:**
- Stateless — no server-side session store needed
- Token is readable by anyone who intercepts it (but `httpOnly` + `secure` flags prevent XSS and network interception)
- No token revocation — valid until `exp` (24 hours)
- `SESSION_SECRET` is the signing key — if leaked, all sessions are forgeable
- Alternative: encrypted JWT (JWE) would hide the payload but adds complexity with no security benefit (the payload contains no secrets)

**Status:** Accepted

---

## D6: Structured JSON Logging with Key-Name-Based PII Redaction

**Context:** Production logging needed to be machine-parseable (for Vercel/log aggregation) while avoiding PII leakage.

**Decision:** Use a custom `logger.server.ts` that outputs structured JSON to stdout in production and human-readable format in development. PII redaction is key-name-based: keys matching `email`, `password`, `phone`, `name`, `raw_payload` are replaced with `[REDACTED]`.

**Consequence:**
- No external logging service dependency (no Datadog, Sentry, etc.)
- Redaction is effective only when callers use expected key names — freeform metadata with PII is NOT redacted
- `userId` and `orgId` are always logged (not considered PII — they're internal IDs)
- 50+ named event constants enforce consistent event naming
- Trade-off: key-name-based redaction is simpler but less robust than value-pattern-based redaction

**Status:** Accepted

---

## D7: `requireOrg()` as Manual Tenant Scope (No Middleware)

**Context:** Every database query must be scoped to the current organization. The question was whether to enforce this via framework middleware (automatic) or via explicit calls in each handler.

**Decision:** Use `requireOrg()` in each `createServerFn` handler. The function extracts `orgId` from the session JWT and returns it. The handler must then use it in every query.

**Consequence:**
- Every handler independently calls `requireOrg()` — no automatic scoping
- If a developer forgets to call `requireOrg()` or doesn't use `orgId` in a query, cross-tenant data leakage can occur (this was the root cause of all 5 P0 bugs in Sprint 34)
- AGENTS.md rule 2 enforces that tenant-scoping changes require doc updates
- Trade-off: middleware would be safer but TanStack Start's `createServerFn` doesn't support middleware in the same way as Express/Fastify

**Status:** Accepted, with documented risk

---

## D8: Client-Side Role Checks as UI Guards (Not Security)

**Context:** Some UI elements (finance tabs, data export buttons, admin settings) should only be visible to authorized roles.

**Decision:** Use `useAuth()` hook to read the session role on the client, then conditionally render UI elements. Server-side `requireRole()` is the real security gate.

**Consequence:**
- Client-side role checks are purely cosmetic — they hide UI elements but don't prevent access
- A user who modifies the JS or calls server functions directly can bypass client checks
- Server-side `requireRole()` in `permissions.server.ts` is the actual access control
- `canAccessFinance()`, `canAccessDataExport()`, `canDeleteData()`, `canAccessAdminSettings()` are helper functions used in both contexts
- Trade-off: acceptable because the server always validates; client checks are UX convenience only

**Status:** Accepted

---

## D9: Vercel Deployment with No CI Pipeline

**Context:** The project deploys to Vercel via git push to `main`.

**Decision:** Deploy directly from `main` branch. No GitHub Actions, no CI/CD pipeline.

**Consequence:**
- Zero deploy friction — push and it goes
- No automated test gate — broken code deploys if tests aren't run locally
- No build verification before deploy
- Vercel's build step catches TypeScript errors, but not logic errors or test failures
- Trade-off: speed over safety; acceptable for a small team with local test discipline

**Status:** Accepted (flagged as known gap in architecture.md)

---

## D10: `postgres` Connection Pool with Dynamic Import

**Context:** The database library needs to be loaded at runtime, and the connection string must not be bundled into the client.

**Decision:** Use dynamic `import()` for the `postgres` library (`db.server.ts:loadPostgres()`), with the module name obfuscated as `["p","o","s","t","g","r","e","s"].join("")` to prevent bundlers from statically analyzing it.

**Consequence:**
- The import obfuscation prevents Vite/webpack from trying to bundle `postgres`
- Connection pool: `max: 4`, `idle_timeout: 20s`, `connect_timeout: 10s`
- `dbAvailable` flag provides circuit-breaker behavior — if connection drops, `isDbAvailable()` returns false and handlers return degraded responses
- Trade-off: obfuscation is unusual but necessary for TanStack Start's Vite build

**Status:** Accepted

---

*Last updated: Sprint 34*
