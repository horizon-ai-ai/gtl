# email-verification Specification

## Purpose

TBD - created by archiving change 'complete-auth-flows'. Update Purpose after archive.

## Requirements

### Requirement: Registration issues a verification token

The system SHALL, after a successful user creation in `POST /api/auth/register`, create an `EmailVerificationToken` row for the new user with `expires_at` set to 24 hours after creation and SHALL dispatch a verification email via `sendEmail` containing the plaintext token. The token issuance and email dispatch SHALL NOT block the registration response — a failure to dispatch SHALL be logged but SHALL NOT cause the registration request to fail.

#### Scenario: New registration produces a verification token row

- **WHEN** `POST /api/auth/register` succeeds and creates user `u_new` with email `bob@example.com`
- **THEN** an `EmailVerificationToken` row exists with `user_id = "u_new"`, `token_hash` not null, `consumed_at` null, and `expires_at` between 23 and 25 hours from now
- **AND** `sendEmail` is invoked at least once with `to = "bob@example.com"`
- **AND** the register endpoint response is unchanged in shape (still `200 { data: { user_id, type, ... } }`)

#### Scenario: Email dispatch failure does not fail registration

- **WHEN** `POST /api/auth/register` succeeds and creates a user, but `sendEmail` throws or returns `{ skipped: true, error: ... }`
- **THEN** the registration endpoint still responds with `200` and the user row remains in the database
- **AND** a server log line records the dispatch failure


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
### Requirement: Verify-email link sets `email_verified_at`

The system SHALL accept `GET /api/auth/verify-email?token=<plaintext>`. When the SHA-256 hash of the supplied token matches an existing `EmailVerificationToken` row with `consumed_at` null and `expires_at > now`, the system SHALL, in a single database transaction, set `User.email_verified_at = now` on the associated user and set `consumed_at = now` on the token row. The system SHALL respond `200 { data: { user_id, already_verified: false } }`.

#### Scenario: Valid token verifies the user

- **WHEN** `GET /api/auth/verify-email?token=<plaintext>` is requested with a token whose hash matches an unconsumed, unexpired row for user `u_123`, and `User.email_verified_at` is currently null
- **THEN** the `User` row for `u_123` has `email_verified_at` set to a timestamp within 5 seconds of now
- **AND** the matching token row has `consumed_at` set
- **AND** the response is `200` with body containing `data.user_id = "u_123"` and `data.already_verified = false`


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
### Requirement: Re-verification is idempotent

The system SHALL, when `GET /api/auth/verify-email` receives a token whose user already has `email_verified_at` set, return `200 { data: { user_id, already_verified: true } }` without modifying the user record. This check takes precedence over both the consumed-state and the expiry checks: it applies whether the token row is unconsumed or consumed, and whether or not `expires_at` has passed. Rationale: once a user is verified, a repeat click on any of their verification links (e.g. an old one surfaced from email history) is a success from the user's perspective, not an error.

#### Scenario: Clicking the link again after success

- **WHEN** a user with `email_verified_at` already set clicks the same verification link a second time
- **THEN** the response is `200` with body containing `data.already_verified = true`
- **AND** `User.email_verified_at` is unchanged from its prior value (same exact timestamp)

#### Scenario: Already-verified user clicks an expired link

- **WHEN** a user with `email_verified_at` already set clicks a verification link whose `expires_at` is in the past
- **THEN** the response is `200` with body containing `data.already_verified = true` (the already-verified check precedes the expiry check)
- **AND** `User.email_verified_at` is unchanged


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
### Requirement: Re-issuing a verification token supersedes prior unconsumed verification tokens

The system SHALL, on every call to `issueToken(user_id, "verify")`, set `consumed_at = now` on every `EmailVerificationToken` row belonging to that user where `consumed_at` is currently null, before inserting the new row. Once a future `POST /api/auth/resend-verification` endpoint exists, this rule SHALL apply to it identically. Supersede SHALL NOT touch rows belonging to other users and SHALL NOT touch `PasswordResetToken` rows.

#### Scenario: Re-issuing for the same user invalidates the prior link

- **GIVEN** a registered but unverified user `u_new` whose original registration issued one `EmailVerificationToken` with `consumed_at` null
- **WHEN** `issueToken("u_new", "verify")` is called a second time (e.g. via a future resend endpoint)
- **THEN** exactly two `EmailVerificationToken` rows exist for `u_new`: the older has `consumed_at` set to a non-null timestamp, the newer has `consumed_at` null
- **AND** a subsequent `GET /api/auth/verify-email?token=<older-plaintext>` returns `400 BUSINESS_RULE_VIOLATION` (the token-helper consume path rejects already-consumed rows; the route reaches the helper only when the user is still unverified)
- **AND** a subsequent `GET /api/auth/verify-email?token=<newer-plaintext>` returns `200` and sets `User.email_verified_at`

##### Example: cross-purpose isolation

- **GIVEN** user `u_x` has one unconsumed `PasswordResetToken` and one unconsumed `EmailVerificationToken`
- **WHEN** `issueToken("u_x", "verify")` is called
- **THEN** the prior `EmailVerificationToken` has `consumed_at` set, the new `EmailVerificationToken` has `consumed_at` null
- **AND** the existing `PasswordResetToken` still has `consumed_at` null (it is not touched)


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
### Requirement: Verify-email rejects unknown and expired tokens

The system SHALL return `404 RESOURCE_NOT_FOUND` from `GET /api/auth/verify-email` when the token hash does not match any row. The system SHALL return `400 BUSINESS_RULE_VIOLATION` when the matching row has `expires_at <= now` and the associated user is not already verified.

#### Scenario: Verify-email rejection matrix

##### Example: failure cases

| Token state | User `email_verified_at` | Expected status | Expected error code | User mutated |
| ----------- | ------------------------ | --------------- | ------------------- | ------------ |
| Hash unknown | null | 404 | RESOURCE_NOT_FOUND | No |
| Hash matches, `expires_at` was 1 hour ago | null | 400 | BUSINESS_RULE_VIOLATION | No |
| Hash matches, unconsumed, unexpired | null | 200 | (none) | Yes (now set) |
| Hash matches, consumed | already set | 200 (idempotent) | (none) | No |

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
### Requirement: Resend-verification endpoint re-issues a token for an unverified user

The system SHALL accept `POST /api/auth/resend-verification` with a body of `{ email?: string }`. The
system SHALL resolve the target email as the signed-in session user's email when a session is present,
otherwise the request body's `email`; when neither is available the system SHALL return `400
VALIDATION_ERROR`. When the resolved email matches a `User` with `status = "active"` and
`email_verified_at` null, the system SHALL call `issueToken(user_id, "verify")` and dispatch a
verification email via `sendVerifyEmail`. In all other cases (no match, suspended user, or already
verified) the system SHALL NOT issue a token and SHALL NOT send an email. The system SHALL respond
`200 { data: {}, meta: { request_id } }` whenever an email was resolved, regardless of whether a token
was issued, so the response does not leak account existence or verification state.

#### Scenario: Active unverified user receives a new verification email

- **WHEN** `POST /api/auth/resend-verification` arrives with `{ email: "bob@example.com" }` and a
  `User` with that email has `status = "active"` and `email_verified_at` null
- **THEN** `issueToken` is called with that user's id and purpose `"verify"`
- **AND** `sendVerifyEmail` is invoked once with `to` equal to that email
- **AND** the response is `200` with body `{ data: {}, meta: { request_id: <string> } }`

#### Scenario: Signed-in user omits the email field

- **WHEN** `POST /api/auth/resend-verification` arrives with an empty body but an authenticated session
  for an active, unverified user
- **THEN** the target email is resolved from the session
- **AND** `sendVerifyEmail` is invoked once for that user

#### Scenario: Resend does not leak account state

- **WHEN** `POST /api/auth/resend-verification` resolves an email that either matches no user, matches
  a non-active user, or matches an already-verified user
- **THEN** no token is issued and `sendVerifyEmail` is not called
- **AND** the response is `200` with body `{ data: {}, meta: { request_id: <string> } }`

#### Scenario: Resolution matrix

##### Example: target resolution and outcomes

| Session | Body email | User state | Token issued | Status | Error code |
| ------- | ---------- | ---------- | ------------ | ------ | ---------- |
| none | absent | n/a | No | 400 | VALIDATION_ERROR |
| none | bob@x (active, unverified) | active, unverified | Yes | 200 | (none) |
| none | bob@x (unknown) | no match | No | 200 | (none) |
| none | bob@x (verified) | already verified | No | 200 | (none) |
| active unverified user | absent | from session | Yes | 200 | (none) |


<!-- @trace
source: auth-flow-ui
updated: 2026-05-28
code:
  - src/app/(auth)/login/page.tsx
  - docs/admin_api_extraction_pattern.md
  - src/app/(auth)/reset/page.tsx
  - docs/17_spec_gap_roadmap.md
  - src/lib/auth/emails.ts
  - package.json
  - src/app/api/auth/resend-verification/route.ts
  - jest.setup.dom.ts
  - src/app/(auth)/verify/page.tsx
  - src/app/(auth)/forgot/page.tsx
  - jest.config.js
tests:
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/(auth)/forgot/page.test.tsx
  - src/app/(auth)/reset/page.test.tsx
  - src/lib/auth/emails.test.ts
  - src/app/(auth)/verify/page.test.tsx
-->

---
### Requirement: Verify-email landing page renders the verification result

The system SHALL serve a `/verify` page in the `(auth)` route group that reads a `token` query
parameter and calls `GET /api/auth/verify-email` exactly once on mount, guarded so React strict-mode
re-invocation does not issue a second request. The page SHALL render distinct states for: in-flight
loading; verified (`data.already_verified === false`); already-verified (`data.already_verified ===
true`); and a dead-link state when the token is absent or the endpoint returns an error
(`RESOURCE_NOT_FOUND` or `BUSINESS_RULE_VIOLATION`). The verified and already-verified states SHALL
link to `/login`. The dead-link state SHALL expose a resend affordance that submits to `POST
/api/auth/resend-verification`. When the visitor is signed in, the affordance SHALL submit using the
session email and SHALL NOT render an email field; when the visitor is logged out, it SHALL collect an
email via an input field.

#### Scenario: Valid token shows the verified state

- **WHEN** a user opens `/verify?token=<token>` and `GET /api/auth/verify-email` returns `200` with
  `data.already_verified = false`
- **THEN** the page shows a success state and a link to `/login`
- **AND** the verify-email endpoint was called exactly once

#### Scenario: Already-verified token shows the already-verified state

- **WHEN** `GET /api/auth/verify-email` returns `200` with `data.already_verified = true`
- **THEN** the page shows an already-verified state and a link to `/login`

#### Scenario: Dead link exposes the resend affordance

- **WHEN** the `token` query parameter is absent, or `GET /api/auth/verify-email` returns
  `RESOURCE_NOT_FOUND` or `BUSINESS_RULE_VIOLATION`
- **THEN** the page shows a dead-link message and a resend control that posts to
  `POST /api/auth/resend-verification`

#### Scenario: Logged-out visitor submits resend with an email

- **WHEN** a logged-out user enters an email in the resend control on the dead-link state and submits
- **THEN** the page calls `POST /api/auth/resend-verification` with that email and shows a neutral
  confirmation that a verification email has been sent if the account is unverified, without revealing
  account state

#### Scenario: Signed-in visitor resends without an email field

- **WHEN** a signed-in user activates the resend control on the dead-link state
- **THEN** no email field is shown and the page calls `POST /api/auth/resend-verification`, which
  resolves the target from the session
- **AND** the page shows the same neutral confirmation


<!-- @trace
source: auth-flow-ui
updated: 2026-05-28
code:
  - src/app/(auth)/login/page.tsx
  - docs/admin_api_extraction_pattern.md
  - src/app/(auth)/reset/page.tsx
  - docs/17_spec_gap_roadmap.md
  - src/lib/auth/emails.ts
  - package.json
  - src/app/api/auth/resend-verification/route.ts
  - jest.setup.dom.ts
  - src/app/(auth)/verify/page.tsx
  - src/app/(auth)/forgot/page.tsx
  - jest.config.js
tests:
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/(auth)/forgot/page.test.tsx
  - src/app/(auth)/reset/page.test.tsx
  - src/lib/auth/emails.test.ts
  - src/app/(auth)/verify/page.test.tsx
-->

---
### Requirement: Verification email links to the verify page

The system SHALL build the verification email link to the `/verify` page route carrying the plaintext
token as a `token` query parameter.

#### Scenario: Verification email link targets the verify page

- **WHEN** `sendVerifyEmail` composes a message for a token
- **THEN** the link points at the `/verify` route with the token as a `token` query parameter

<!-- @trace
source: auth-flow-ui
updated: 2026-05-28
code:
  - src/app/(auth)/login/page.tsx
  - docs/admin_api_extraction_pattern.md
  - src/app/(auth)/reset/page.tsx
  - docs/17_spec_gap_roadmap.md
  - src/lib/auth/emails.ts
  - package.json
  - src/app/api/auth/resend-verification/route.ts
  - jest.setup.dom.ts
  - src/app/(auth)/verify/page.tsx
  - src/app/(auth)/forgot/page.tsx
  - jest.config.js
tests:
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/(auth)/forgot/page.test.tsx
  - src/app/(auth)/reset/page.test.tsx
  - src/lib/auth/emails.test.ts
  - src/app/(auth)/verify/page.test.tsx
-->