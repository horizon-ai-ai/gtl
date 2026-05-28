# account-recovery Specification

## Purpose

TBD - created by archiving change 'complete-auth-flows'. Update Purpose after archive.

## Requirements

### Requirement: Forgot-password issues a single-use reset token

The system SHALL accept `POST /api/auth/forgot-password` with an email payload, and when the email matches an active user, SHALL create a `PasswordResetToken` row with `expires_at` set to 30 minutes after creation and SHALL dispatch a reset email containing the plaintext token via `sendEmail`. The system SHALL store only the SHA-256 hash of the token (`token_hash`), never the plaintext.

#### Scenario: Token issued for a known active user

- **WHEN** a `POST /api/auth/forgot-password` request arrives with body `{ email: "alice@example.com" }` and a `User` row with that email exists with `status = "active"`
- **THEN** a `PasswordResetToken` row exists with `user_id` equal to that user's id, `token_hash` not null, `consumed_at` null, and `expires_at` between 29 and 31 minutes from now
- **AND** `sendEmail` is invoked exactly once with `to` equal to the user's email

##### Example: token row shape

- **GIVEN** an active user with id `u_123` and email `alice@example.com`, current time `2026-05-21T10:00:00Z`
- **WHEN** the route runs successfully
- **THEN** a token row matches `{ user_id: "u_123", token_hash: <sha256 hex>, consumed_at: null, expires_at: "2026-05-21T10:30:00Z" }`


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
### Requirement: Forgot-password does not leak account existence

The system SHALL return `200 { data: {}, meta: { request_id } }` from `POST /api/auth/forgot-password` regardless of whether the email matches a user. When the email does not match, the system SHALL NOT create a token, SHALL NOT call `sendEmail`, and SHALL perform a dummy bcrypt comparison to equalize response time. The system SHALL log a `[forgot-password:no-match]` line server-side for operator visibility.

#### Scenario: Unknown email returns the same shape

- **WHEN** a `POST /api/auth/forgot-password` request arrives with body `{ email: "nobody@example.com" }` and no `User` row matches
- **THEN** the response status is `200` with body `{ data: {}, meta: { request_id: <string> } }`
- **AND** no `PasswordResetToken` row is created
- **AND** `sendEmail` is not called
- **AND** a `[forgot-password:no-match]` log line is emitted


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
### Requirement: Reset-password rotates the password and revokes sessions

The system SHALL accept `POST /api/auth/reset-password` with `{ token, new_password }`. When the token's SHA-256 hash matches an existing `PasswordResetToken` row with `consumed_at` null and `expires_at > now`, the system SHALL, in a single database transaction: hash `new_password` with bcrypt cost 12, update the target user's `password_hash`, set `consumed_at = now` on the token row, and set `revoked_at = now` on every `Session` row for that user where `revoked_at` is currently null. The system SHALL respond `200 { data: { user_id } }`.

#### Scenario: Valid token rotates credentials and revokes sessions

- **WHEN** a `POST /api/auth/reset-password` request arrives with a token whose hash matches an unconsumed, unexpired `PasswordResetToken` for user `u_123`, and `new_password` is `"NewPass1234"`
- **THEN** the `User` row for `u_123` has a `password_hash` that bcrypt-verifies against `"NewPass1234"` and does not verify against the prior password
- **AND** the matching `PasswordResetToken` row has `consumed_at` set to a timestamp within 5 seconds of now
- **AND** every `Session` row with `user_id = u_123` that previously had `revoked_at = null` now has `revoked_at` set
- **AND** the response status is `200` with body containing `data.user_id = "u_123"`


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
### Requirement: Re-issuing a reset token supersedes prior unconsumed reset tokens

The system SHALL, on every successful `POST /api/auth/forgot-password` whose email matches an active user, set `consumed_at = now` on every `PasswordResetToken` row belonging to that user where `consumed_at` is currently null, before inserting the new row. The most recently issued reset link SHALL be the only one whose hash is accepted by `POST /api/auth/reset-password`; any link from a prior issuance SHALL be rejected as `400 BUSINESS_RULE_VIOLATION` (already consumed). Supersede SHALL NOT touch rows belonging to other users and SHALL NOT touch `EmailVerificationToken` rows.

#### Scenario: Second forgot-password request invalidates the first link

- **GIVEN** an active user `u_123` with no existing `PasswordResetToken` rows
- **WHEN** `POST /api/auth/forgot-password` is invoked once with that user's email, then invoked a second time with the same email a moment later
- **THEN** exactly two `PasswordResetToken` rows exist for `u_123`: the first has `consumed_at` set to a non-null timestamp earlier than the second row's `created_at`, and the second has `consumed_at` null
- **AND** `POST /api/auth/reset-password` with the token from the **first** email returns `400 BUSINESS_RULE_VIOLATION`
- **AND** `POST /api/auth/reset-password` with the token from the **second** email returns `200` and rotates the password

##### Example: cross-user isolation

- **GIVEN** active users `u_a` and `u_b`, and `u_a` has one unconsumed `PasswordResetToken`
- **WHEN** `POST /api/auth/forgot-password` is invoked with `u_b`'s email
- **THEN** `u_a`'s prior token row still has `consumed_at` null (it is not superseded)
- **AND** exactly one new row exists for `u_b` with `consumed_at` null


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
### Requirement: Reset-password rejects unknown, expired, and consumed tokens

The system SHALL return `404 RESOURCE_NOT_FOUND` from `POST /api/auth/reset-password` when the supplied token's hash does not match any row. The system SHALL return `400 BUSINESS_RULE_VIOLATION` when the matching row has `consumed_at` not null or `expires_at <= now`. The system SHALL NOT modify any user record or session in either failure case. The system SHALL return `400 VALIDATION_ERROR` when `new_password` violates the policy `min 8, max 100 characters`.

#### Scenario: Reset request rejection matrix

##### Example: failure cases

| Input token state | New password | Expected status | Expected error code | User mutated |
| ----------------- | ------------ | --------------- | ------------------- | ------------ |
| Unknown hash | "ValidPass1" | 404 | RESOURCE_NOT_FOUND | No |
| Hash matches but `consumed_at` set 1 minute ago | "ValidPass1" | 400 | BUSINESS_RULE_VIOLATION | No |
| Hash matches but `expires_at` was 1 minute ago | "ValidPass1" | 400 | BUSINESS_RULE_VIOLATION | No |
| Valid token | "short" | 400 | VALIDATION_ERROR | No |
| Valid token | "ValidPass1" | 200 | (none) | Yes |

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
### Requirement: Forgot-password page requests a reset link

The system SHALL serve a `/forgot` page in the `(auth)` route group that collects an email address and
submits it to `POST /api/auth/forgot-password`. The page SHALL display a single neutral confirmation
message after submission regardless of the response, and SHALL NOT indicate whether the email matched
an account. The page SHALL provide a link back to `/login`.

#### Scenario: Submitting an email shows the neutral confirmation

- **WHEN** a user enters an email on `/forgot` and submits the form
- **THEN** the page calls `POST /api/auth/forgot-password` with that email
- **AND** the page displays a confirmation stating that a reset link has been sent if an account
  exists, without revealing whether the email matched a user

#### Scenario: The page links back to login

- **WHEN** a user views `/forgot`
- **THEN** a link to `/login` is present


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
### Requirement: Reset-password page rotates the password from an emailed link

The system SHALL serve a `/reset` page in the `(auth)` route group that reads a `token` query
parameter. When the token is absent, the page SHALL render an invalid-link state with a link to
`/forgot`. When a token is present, the page SHALL present a new-password field and a confirmation
field, SHALL block submission unless the new password is at least 8 characters and the two fields
match, and SHALL submit `{ token, new_password }` to `POST /api/auth/reset-password`. On a `200`
response the page SHALL show a success message and redirect to `/login`. On any error response the
page SHALL show a failure message and a link to `/forgot` to request a new link.

#### Scenario: Valid token and matching passwords rotate credentials

- **WHEN** a user opens `/reset?token=<token>`, enters a new password of at least 8 characters in both
  fields, and submits
- **THEN** the page calls `POST /api/auth/reset-password` with `{ token, new_password }`
- **AND** on a `200` response the page shows a success message and navigates to `/login`

#### Scenario: Missing token renders an invalid-link state

- **WHEN** a user opens `/reset` with no `token` query parameter
- **THEN** the page shows an invalid-link message and a link to `/forgot`
- **AND** no request is made to `POST /api/auth/reset-password`

#### Scenario: Mismatched or too-short password blocks submission

- **WHEN** a user on `/reset?token=<token>` enters passwords that do not match, or a password shorter
  than 8 characters
- **THEN** the submit action is blocked and no request is made to `POST /api/auth/reset-password`

#### Scenario: Rejected token shows a recovery path

- **WHEN** `POST /api/auth/reset-password` returns an error response (unknown, expired, or consumed
  token)
- **THEN** the page shows a failure message and a link to `/forgot`


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
### Requirement: Login page links to forgot-password

The system SHALL display a link on the login page that navigates to `/forgot`.

#### Scenario: Login page exposes the forgot-password entry point

- **WHEN** a user views the login page
- **THEN** a "忘記密碼？" link to `/forgot` is present


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
### Requirement: Password-reset email links to the reset page

The system SHALL build the password-reset email link to the `/reset` page route carrying the plaintext
token as a `token` query parameter.

#### Scenario: Reset email link targets the reset page

- **WHEN** `sendPasswordResetEmail` composes a message for a token
- **THEN** the link points at the `/reset` route with the token as a `token` query parameter

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