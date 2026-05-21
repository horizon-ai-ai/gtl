## Context

NextAuth is wired with `session: { strategy: "jwt" }` in `src/lib/auth.ts`. JWT strategy means NextAuth never writes to the Prisma `Session` table on sign-in — the table exists in `prisma/schema.prisma` (with `refresh_token_hash`, `revoked_at`, `expires_at` columns) but is empty in practice. Other production routes already use the unified response envelope from `src/lib/api.ts` (`ok`, `fail`, `handleError`, `ApiError`), so new auth routes must follow that pattern. Email dispatch goes through `src/lib/notify.ts` which already wraps Resend and no-ops when `RESEND_API_KEY` is unset. `User.email_verified_at` is already declared on the `User` model but never set.

The change introduces three flows that share token-issuance plumbing (forgot/reset password and verify-email) plus a session-tracking layer that retrofits the empty `Session` table. The shared plumbing is the reason these three slices are bundled rather than shipped one at a time — they all want the same opaque-token-with-hash pattern.

## Goals / Non-Goals

**Goals:**

- Provide an end-to-end password recovery path: lost-password → email link → set new password → existing sessions revoked.
- Persist a `User.email_verified_at` timestamp set by a real link-click flow, so future paid-feature gates can rely on it.
- Make the `Session` table reflect real credentialed sign-ins so a user can list and revoke their own active sessions.
- Reuse the existing `notify.sendEmail` helper, the existing `ApiError` / `ok` / `handleError` envelope, and the existing `bcryptjs` hashing — no new top-level dependencies.
- Resist account-enumeration on forgot-password by returning the same response shape whether the email exists or not.

**Non-Goals:**

- UI pages for any of these flows. Server endpoints only in this change; the design partner already has a login page that can link to `/forgot-password` once the route exists. Acceptance is HTTP-level.
- Login lockout (5-failure / 15-min) and the `LoginAttempt` table from roadmap §3.1 step 6. Defer to a follow-up change.
- Disposable email domain block at registration (roadmap §3.1 step 8). Defer.
- LINE login (roadmap §3.1 step 8 footnote — deferred at business level).
- Listing OAuth (Google) sessions. NextAuth's Google provider does not produce a credentials-side row; only credentialed sign-ins land in the `Session` table in v1. The list endpoint must say so via a `type: "credentials"` field so the UI can render an explanation later.
- 2FA / WebAuthn / passkeys.
- Cleaning up expired tokens proactively. A nightly cron is out of scope; rows are filtered out at validation time by `expires_at` check.
- `POST /api/auth/resend-verification` — a user who never received the register-time verification email has no in-product path to request another in v1. We accept this gap. If support demand materializes, a follow-up change can add the endpoint, reusing the same token table and emitting a new `EmailVerificationToken` while invalidating any prior unconsumed rows for the same user.

## Decisions

### Persisting sessions without leaving the JWT strategy

NextAuth supports two session strategies: `"jwt"` (stateless, fast, no DB read on every request) and `"database"` (DB-backed, easy to revoke, one DB read per request). Switching to `"database"` would solve sessions list/revoke trivially but it requires NextAuth's own `Account` table layout, invalidates every existing JWT cookie on deploy, and pushes a DB round-trip onto every authenticated request.

We will stay on `"jwt"` and add our own session-tracking layer:

1. NextAuth's `events.signIn` callback fires after a successful credentials sign-in. It will create a `Session` row with `refresh_token_hash` set to a fresh random hash (the credentials provider issues no refresh token, so this column holds an opaque session secret we never reveal — semantically a session secret hash; we keep the existing column name to avoid a rename migration), `expires_at` set to `now + 30 days` to match NextAuth's `session.maxAge`, and `ip` / `user_agent` taken from the request context.
2. The created row's id is returned from the `jwt` callback as a `sid` claim on the token.
3. The `session` callback runs on every authenticated request. It will look up `Session` by id, reject (return an empty session) if `revoked_at` is set or `expires_at < now`, and refresh a `last_seen_at` column at most once per minute to keep DB writes bounded.
4. Revoking a session sets `revoked_at = now`. The next request bearing that JWT fails at the `session` callback and the user is logged out.

This keeps the JWT cookie flow intact for unrelated routes while making revocation a single SQL update.

### Token shape and storage

Each of the three flows needs a one-time token mailed to the user. Three options were considered:

1. **One unified `AuthToken` table with a `purpose` enum** — flexible but couples unrelated flows; deleting all reset tokens for a user requires a `where: { purpose: ... }` clause.
2. **Stateless signed JWTs** — no DB write, but cannot be revoked (e.g., after a password reset all outstanding reset tokens for that user should be invalidated). Hard to enforce single-use.
3. **Two separate tables: `PasswordResetToken` and `EmailVerificationToken`** — chosen. Each row stores `id`, `user_id`, `token_hash`, `expires_at`, `consumed_at`, `created_at`. The plaintext token is never stored — only `sha256(token)`. The link emitted in email is `?token=<plaintext>`. On click, the route hashes the input and looks it up. Single-use is enforced by setting `consumed_at` in the same transaction as the side effect (rotate password / set `email_verified_at`).

TTLs: password reset = 30 minutes (matches roadmap §3.1 step 2); email verification = 24 hours.

**Re-issuance supersedes prior tokens.** `issueToken(user_id, purpose)` sets `consumed_at = now` on every prior unconsumed row of the same purpose for that user before inserting the new row. Only the most recently issued link is ever valid; clicking an older link from a forwarded email or a log fails `consumeToken` with `BUSINESS_RULE_VIOLATION` (already consumed). `consumed_at` is overloaded here to mean "used OR superseded" — both states are equivalent for the `consumeToken` check, so no schema change is needed. If audit telemetry later wants to distinguish "user clicked" from "system superseded," add a `superseded_at` column at that point.

### Forgot-password against enumeration

`POST /api/auth/forgot-password` will always return `ok({})` regardless of whether the email matches a user. If a matching active user exists, a token is issued and emailed. If not, the route still does a constant-time-ish bcrypt no-op (a dummy `bcrypt.compare` against a fixed hash) to avoid timing differences. Rate limiting is not in scope of this change — when `src/lib/api/rate-limit.ts` lands (roadmap §2.2), this endpoint should be wrapped at 3 requests / hour / email.

## Implementation Contract

**Behavior (HTTP):**

- `POST /api/auth/forgot-password { email }` → `200 { data: {}, meta: { request_id } }`. Side effect: if email matches an active user, a `PasswordResetToken` row exists with `expires_at = now + 30m` and an email is dispatched via `sendEmail`. Returns the same shape if not.
- `POST /api/auth/reset-password { token, new_password }` → `200 { data: { user_id }, meta }` on success. Failure modes: `404 RESOURCE_NOT_FOUND` if token hash unknown, `400 VALIDATION_ERROR` if password fails length policy (min 8, max 100 — same as register), `400 BUSINESS_RULE_VIOLATION` if token already consumed or expired. Side effects: rotates `User.password_hash`, sets `consumed_at` on token, sets `revoked_at = now` on every `Session` row belonging to that user.
- `GET /api/auth/verify-email?token=...` → `200 { data: { user_id, already_verified } }`. `already_verified: true` is returned for idempotent re-clicks. Failure modes: `404 RESOURCE_NOT_FOUND` for unknown tokens, `400 BUSINESS_RULE_VIOLATION` for expired (but not consumed) tokens. Side effects: sets `User.email_verified_at = now` and `consumed_at` on token in one transaction.
- `GET /api/auth/sessions` → `200 { data: { sessions: [{ id, ip, user_agent, created_at, last_seen_at, current }] } }`. Returns rows for the calling user where `revoked_at IS NULL AND expires_at > now`. The `current` flag is true for the session whose id matches the `sid` claim in the request JWT.
- `DELETE /api/auth/sessions/:id` → `200 { data: {} }` on success, `404 RESOURCE_NOT_FOUND` if the session belongs to another user or does not exist. Side effect: sets `revoked_at = now`. Revoking your own current session is allowed; the next request will fail in the `session` callback.

**Data model:**

```
model PasswordResetToken {
  id          String    @id @default(uuid()) @db.Uuid
  user_id     String    @db.Uuid
  user        User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  token_hash  String    @unique
  expires_at  DateTime
  consumed_at DateTime?
  created_at  DateTime  @default(now())

  @@index([user_id, consumed_at])
}

model EmailVerificationToken {
  id          String    @id @default(uuid()) @db.Uuid
  user_id     String    @db.Uuid
  user        User      @relation(fields: [user_id], references: [id], onDelete: Cascade)
  token_hash  String    @unique
  expires_at  DateTime
  consumed_at DateTime?
  created_at  DateTime  @default(now())

  @@index([user_id, consumed_at])
}
```

The existing `Session` model gains a `last_seen_at DateTime?` column and an index `@@index([user_id, revoked_at, expires_at])`.

**Helpers:**

- `src/lib/auth/tokens.ts` exports `issueToken(user_id, purpose: "reset" | "verify"): Promise<{ token: string, hash: string, expires_at: Date }>` and `consumeToken(plaintext, purpose): Promise<{ user_id }>` (throws `ApiError` on miss/expired/consumed).
- `src/lib/auth/emails.ts` exports `sendPasswordResetEmail(to, token)` and `sendVerifyEmail(to, token)` which render hard-coded plaintext + HTML and call `notify.sendEmail`. Links point to `${APP_URL}/auth/reset?token=...` and `${APP_URL}/auth/verify?token=...` (UI pages out of scope — endpoints will accept the token regardless).

**Acceptance:**

- Manual flow: register a new account in dev → see a verify email in the Resend log (or `[email:noop]` console line) → POST to the verify endpoint with the token → confirm `User.email_verified_at` is set.
- Manual flow: POST `/api/auth/forgot-password` for a registered user → POST `/api/auth/reset-password` with the issued token + a new password → log in with new credentials → confirm prior sessions are revoked (a second browser logged in before reset receives an empty session on next request).
- Unit test: `consumeToken` rejects unknown / expired / already-consumed tokens. (Test infra is Jest per `package.json` — confirm during apply; if absent, add a minimal Jest config alongside.)
- The four roadmap §3.1 acceptance bullets pass (excluding the "UI optional in this batch" parts).

**Scope boundaries (in scope):** five HTTP routes listed above, two Prisma models, one `Session` model addition, sign-in event hook in `src/lib/auth.ts`, register-route hook, two email helpers.

**Scope boundaries (out of scope):** UI pages, rate limiting, login lockout, disposable email block, LINE login, OAuth-session listing, 2FA, token cleanup cron, resend-verification endpoint.

## Risks / Trade-offs

- [JWT sessions can outlive `Session.revoked_at` for up to one request] → The `session` callback runs on every authenticated request and rejects revoked sessions; the gap is bounded by request duration, not by JWT TTL.
- [Sign-in event runs after the JWT is already minted — `sid` claim assignment depends on event ordering] → NextAuth guarantees the `jwt` callback (where we set `sid`) runs after `events.signIn`; verify in the apply phase by inspecting a freshly issued JWT in dev.
- [Per-request DB read in the `session` callback is a latency tax on every authenticated route] → Index `Session(user_id, revoked_at, expires_at)` keeps the lookup O(log n). `last_seen_at` updates are throttled to once-per-minute to keep write pressure low.
- [Returning identical `200 ok` for unknown emails on forgot-password can hide misconfigured email forwarders] → We log the no-match case server-side (`console.info("[forgot-password:no-match]", emailMaskedHash)`) for operator visibility without leaking to the client.
- [`Session.refresh_token_hash` column is being repurposed as a session secret hash without rename] → Documented in the column comment; a future rename migration is acceptable but not blocking.
- [Bcrypt no-op timing dummy may not perfectly equalize response time across the email-exists / email-missing branches] → Acceptable for v1; rate limiting (when added in §2.2) is the durable defense against enumeration.

## Migration Plan

1. Generate a Prisma migration adding the two token tables, the `Session.last_seen_at` column, and the new `Session` index. Run on staging first.
2. Deploy the code change; existing JWTs in the wild will not have a `sid` claim — handle this by treating a missing `sid` as "legacy session, allow and stamp on next sign-in" rather than rejecting. New sign-ins immediately get tracked.
3. Rollback strategy: the new tables are additive and the `session` callback's missing-`sid` fallback means rolling back the application code does not strand users; the DB migration can stay applied.

## Open Questions

- Where do the reset/verify link target URLs point? `${APP_URL}/auth/reset` and `${APP_URL}/auth/verify` are assumed — confirm `APP_URL` env var name during apply (the codebase already references `NEXT_PUBLIC_APP_URL` in places; we should reuse, not introduce a new var).
- Should `email_verified_at` be a hard gate or a soft warning for paid features? Roadmap §6 open question; out of scope here but the column being set correctly is the prerequisite for whichever answer wins.
