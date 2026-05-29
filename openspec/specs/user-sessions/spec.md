# user-sessions Specification

## Purpose

TBD - created by archiving change 'complete-auth-flows'. Update Purpose after archive.

## Requirements

### Requirement: Credentialed sign-in persists a Session row

The system SHALL, on every successful credentials provider sign-in, create a `Session` row before the JWT is issued. The row SHALL have `user_id` set to the signing-in user, `refresh_token_hash` set to the SHA-256 hash of a freshly generated 32-byte random secret, `expires_at` set to 30 days after creation, `ip` and `user_agent` populated from the request when available, `revoked_at` null, and `last_seen_at` set to creation time. The system SHALL embed the new row's id as a `sid` claim on the issued JWT.

#### Scenario: Sign-in stamps a Session row and a sid claim

- **WHEN** a user successfully signs in via the credentials provider at the NextAuth catchall route
- **THEN** exactly one new `Session` row exists with `user_id` equal to that user's id and `revoked_at` null
- **AND** the JWT returned in the `next-auth.session-token` cookie contains a `sid` claim equal to the new row's id
- **AND** the `Session.expires_at` value matches the JWT's expiry within 5 seconds


<!-- @trace
source: complete-auth-flows
updated: 2026-05-27
code:
  - jest.config.js
  - src/app/api/auth/forgot-password/route.ts
  - src/app/api/auth/register/route.ts
  - .env.example
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - src/lib/auth/tokens.ts
  - src/app/api/auth/sessions/[id]/route.ts
  - src/lib/auth/emails.ts
  - docs/17_spec_gap_roadmap.md
  - package.json
  - src/lib/auth.ts
  - src/app/api/auth/reset-password/route.ts
  - src/app/api/auth/sessions/route.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/api/auth/verify-email/route.ts
  - prisma/migrations/20260521000000_auth_recovery_and_sessions/migration.sql
  - src/app/(app)/trade/notifications/page.tsx
tests:
  - src/app/api/auth/verify-email/route.test.ts
  - src/lib/auth/emails.test.ts
  - src/app/api/auth/forgot-password/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/auth/sessions/[id]/route.test.ts
  - src/app/api/auth/sessions/route.test.ts
  - src/app/api/auth/reset-password/route.test.ts
  - src/lib/auth/tokens.test.ts
-->

---
### Requirement: Authenticated requests are rejected when their session is revoked or expired

The system SHALL, on every authenticated request that produces a session via NextAuth's `session` callback, look up the `Session` row whose id matches the JWT's `sid` claim. The system SHALL return an empty session (causing downstream `auth()` calls to resolve to `null`) when the row is missing, when `revoked_at` is not null, or when `expires_at <= now`. The system SHALL update `last_seen_at` to the current time on the matching row at most once per minute per row.

#### Scenario: Revoked session forces sign-out on next request

- **GIVEN** a user is signed in with JWT `sid = s_active`, and a `Session` row with id `s_active` exists with `revoked_at = null`
- **WHEN** the system sets `revoked_at = now` on row `s_active` (via a reset-password or explicit DELETE)
- **AND** the user's browser sends a subsequent authenticated request with the same JWT cookie
- **THEN** `auth()` resolves to a session whose `user` field is undefined (treated as logged out by route handlers using `requireUser`)

#### Scenario: Missing sid on legacy JWTs falls through gracefully

- **WHEN** a request arrives with a JWT minted before this change ships (no `sid` claim present)
- **THEN** the `session` callback SHALL return the session normally without a DB lookup
- **AND** the next sign-in for the same user SHALL stamp a fresh `Session` row and `sid` claim


<!-- @trace
source: complete-auth-flows
updated: 2026-05-27
code:
  - jest.config.js
  - src/app/api/auth/forgot-password/route.ts
  - src/app/api/auth/register/route.ts
  - .env.example
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - src/lib/auth/tokens.ts
  - src/app/api/auth/sessions/[id]/route.ts
  - src/lib/auth/emails.ts
  - docs/17_spec_gap_roadmap.md
  - package.json
  - src/lib/auth.ts
  - src/app/api/auth/reset-password/route.ts
  - src/app/api/auth/sessions/route.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/api/auth/verify-email/route.ts
  - prisma/migrations/20260521000000_auth_recovery_and_sessions/migration.sql
  - src/app/(app)/trade/notifications/page.tsx
tests:
  - src/app/api/auth/verify-email/route.test.ts
  - src/lib/auth/emails.test.ts
  - src/app/api/auth/forgot-password/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/auth/sessions/[id]/route.test.ts
  - src/app/api/auth/sessions/route.test.ts
  - src/app/api/auth/reset-password/route.test.ts
  - src/lib/auth/tokens.test.ts
-->

---
### Requirement: Authenticated users can list their active sessions

The system SHALL accept `GET /api/auth/sessions` from an authenticated user and SHALL return the list of `Session` rows belonging to that user where `revoked_at IS NULL AND expires_at > now`. Each item in the list SHALL include `id`, `ip`, `user_agent`, `created_at`, `last_seen_at`, and a boolean `current` set to true when the row's id matches the request JWT's `sid` claim. The system SHALL NOT include `refresh_token_hash` or any other secret material in the response.

#### Scenario: List returns the caller's active sessions only

- **GIVEN** user `u_123` has three `Session` rows: `s_a` (active), `s_b` (active, is current), `s_c` (revoked yesterday); and user `u_999` has one active session `s_x`
- **WHEN** user `u_123` sends `GET /api/auth/sessions` while authenticated via the JWT whose `sid = "s_b"`
- **THEN** the response status is `200` and `data.sessions` contains exactly two items with ids `s_a` and `s_b`
- **AND** the item with id `s_b` has `current = true` and the item with id `s_a` has `current = false`
- **AND** no item references `s_c` or `s_x`
- **AND** no item exposes a `refresh_token_hash` field


<!-- @trace
source: complete-auth-flows
updated: 2026-05-27
code:
  - jest.config.js
  - src/app/api/auth/forgot-password/route.ts
  - src/app/api/auth/register/route.ts
  - .env.example
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - src/lib/auth/tokens.ts
  - src/app/api/auth/sessions/[id]/route.ts
  - src/lib/auth/emails.ts
  - docs/17_spec_gap_roadmap.md
  - package.json
  - src/lib/auth.ts
  - src/app/api/auth/reset-password/route.ts
  - src/app/api/auth/sessions/route.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/api/auth/verify-email/route.ts
  - prisma/migrations/20260521000000_auth_recovery_and_sessions/migration.sql
  - src/app/(app)/trade/notifications/page.tsx
tests:
  - src/app/api/auth/verify-email/route.test.ts
  - src/lib/auth/emails.test.ts
  - src/app/api/auth/forgot-password/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/auth/sessions/[id]/route.test.ts
  - src/app/api/auth/sessions/route.test.ts
  - src/app/api/auth/reset-password/route.test.ts
  - src/lib/auth/tokens.test.ts
-->

---
### Requirement: Authenticated users can revoke a session by id

The system SHALL accept `DELETE /api/auth/sessions/:id` from an authenticated user. When `:id` matches a `Session` row whose `user_id` equals the caller's id **and whose `revoked_at` is currently null**, the system SHALL set `revoked_at = now` on that row and respond `200 { data: {} }`. In every other case — `:id` does not match a row, matches a row belonging to a different user, or matches one of the caller's own rows that is already revoked — the system SHALL respond `404 RESOURCE_NOT_FOUND` without disclosing which case applied. The operation is therefore not idempotent: a repeat `DELETE` on an already-revoked id returns `404`, not `200`. This is acceptable because the observable end state (that session is revoked) is identical either way.

#### Scenario: Revoking an active own session succeeds

- **GIVEN** user `u_123` is authenticated and a `Session` row `s_other` exists with `user_id = "u_123"` and `revoked_at` null
- **WHEN** the user sends `DELETE /api/auth/sessions/s_other`
- **THEN** the response is `200` and the row `s_other` has `revoked_at` set to a timestamp within 5 seconds of now

#### Scenario: Repeat DELETE on an already-revoked own session returns 404

- **GIVEN** user `u_123` is authenticated and a `Session` row `s_done` exists with `user_id = "u_123"` and `revoked_at` already set
- **WHEN** the user sends `DELETE /api/auth/sessions/s_done`
- **THEN** the response is `404` with error code `RESOURCE_NOT_FOUND`
- **AND** the row `s_done` keeps its original `revoked_at` value (it is not re-stamped)

#### Scenario: Revoking another user's session returns 404

- **GIVEN** user `u_123` is authenticated and a `Session` row `s_other_user` exists with `user_id = "u_999"`
- **WHEN** `u_123` sends `DELETE /api/auth/sessions/s_other_user`
- **THEN** the response is `404` with error code `RESOURCE_NOT_FOUND`
- **AND** the `Session` row `s_other_user` is unchanged (still has `revoked_at` null)

<!-- @trace
source: complete-auth-flows
updated: 2026-05-27
code:
  - jest.config.js
  - src/app/api/auth/forgot-password/route.ts
  - src/app/api/auth/register/route.ts
  - .env.example
  - prisma/migrations/migration_lock.toml
  - prisma/schema.prisma
  - src/lib/auth/tokens.ts
  - src/app/api/auth/sessions/[id]/route.ts
  - src/lib/auth/emails.ts
  - docs/17_spec_gap_roadmap.md
  - package.json
  - src/lib/auth.ts
  - src/app/api/auth/reset-password/route.ts
  - src/app/api/auth/sessions/route.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/api/auth/verify-email/route.ts
  - prisma/migrations/20260521000000_auth_recovery_and_sessions/migration.sql
  - src/app/(app)/trade/notifications/page.tsx
tests:
  - src/app/api/auth/verify-email/route.test.ts
  - src/lib/auth/emails.test.ts
  - src/app/api/auth/forgot-password/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/auth/sessions/[id]/route.test.ts
  - src/app/api/auth/sessions/route.test.ts
  - src/app/api/auth/reset-password/route.test.ts
  - src/lib/auth/tokens.test.ts
-->