## Why

The platform ships registration and login but is missing the rest of the credential lifecycle: a user who forgets their password has no path back into their account, a user whose credentials may be compromised cannot see or revoke active sessions, and `User.email_verified_at` is declared in the schema but never set because no verify flow exists. These are table-stakes for any production account system and are flagged P0 in `docs/17_spec_gap_roadmap.md` §3.1.

## What Changes

- Add `POST /api/auth/forgot-password` — accepts an email, issues a single-use token with a 30-minute TTL, dispatches a reset link via the existing `src/lib/notify.ts` helper. Returns `ok` regardless of whether the email is registered (no account enumeration).
- Add `POST /api/auth/reset-password` — validates the token, rotates `User.password_hash`, marks the token consumed, revokes all of the user's existing sessions.
- Add `GET /api/auth/verify-email` — link-click handler that validates the token and sets `User.email_verified_at`. Idempotent: re-clicking a consumed token within its TTL window returns success.
- Modify `POST /api/auth/register` — after user creation, issue an `EmailVerificationToken` and dispatch the verification email via `sendEmail`.
- Add `GET /api/auth/sessions` — lists the current user's active `Session` rows (id, ip, user_agent, created_at, last_seen_at, current flag).
- Add `DELETE /api/auth/sessions/:id` — sets `revoked_at` on the matching row; subsequent requests carrying the matching JWT are rejected in the session callback.
- Modify `src/lib/auth.ts` — wire `events.signIn` to create a `Session` row and embed its id as a `sid` claim on the issued JWT. Extend the `session` callback to look up the row and reject if `revoked_at` is set or `expires_at` has passed.
- Add two Prisma models: `PasswordResetToken` and `EmailVerificationToken`. Each keyed by opaque random token hash, with `user_id`, `expires_at`, `consumed_at`, `created_at`.
- Add an index `Session(user_id, revoked_at, expires_at)` to support the list query.

## Non-Goals

(See design.md §Goals / Non-Goals for the full list and rationale.)

## Capabilities

### New Capabilities

- `account-recovery`: forgot-password and reset-password flows, including token issuance/validation contracts and post-reset session revocation.
- `email-verification`: verify-email token flow plus the register-time email dispatch hook that produces the token.
- `user-sessions`: persisting NextAuth credentials sign-ins as `Session` rows, listing them for the current user, and revoking them by id.

### Modified Capabilities

None. The Spectra specs tree is currently empty; this change introduces the first three capability files.

## Impact

- Affected specs: three new capabilities listed above.
- Affected code:
  - New:
    - src/app/api/auth/forgot-password/route.ts
    - src/app/api/auth/reset-password/route.ts
    - src/app/api/auth/verify-email/route.ts
    - src/app/api/auth/sessions/route.ts
    - src/app/api/auth/sessions/[id]/route.ts
    - src/lib/auth/tokens.ts
    - src/lib/auth/emails.ts
  - Modified:
    - prisma/schema.prisma
    - src/lib/auth.ts
    - src/app/api/auth/register/route.ts
  - Removed: (none)
- Dependencies: no new packages — `bcryptjs`, `next-auth`, `resend`, `zod`, `@prisma/client` are all already in `package.json`.
- Data: one new Prisma migration adding two token tables and one `Session` index. No backfill required.
- Outbound email: increases Resend traffic; current `sendEmail` already no-ops when `RESEND_API_KEY` is unset, so dev/test environments are unaffected.
