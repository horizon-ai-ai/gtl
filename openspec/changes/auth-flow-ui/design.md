## Context

The recovery and verification endpoints from the `complete-auth-flows` change are implemented and
tested: forgot-password issues a reset token, reset-password rotates the password and revokes
sessions, register issues a verification token, and verify-email stamps `email_verified_at`. None of
these have a user-facing UI. The email helpers already send links to `/auth/reset` and `/auth/verify`,
but no route serves those paths, so an emailed link 404s.

The app uses Next.js App Router with an existing `(auth)` route group (`/login`, `/register`) that
renders a centered card via `src/app/(auth)/layout.tsx`, shadcn `Card / Input / Button / Label`, and
zh-TW copy. The `email-verification` spec already anticipates a future
`POST /api/auth/resend-verification` endpoint and states the token-supersede rule applies to it.

## Goals / Non-Goals

**Goals:**

- Make the forgot-password, reset-password, and verify-email flows usable end to end from the browser.
- Give an unverified user a way to get a fresh verification email when their link is dead.
- Reuse existing layout, components, and the established response-envelope and anti-enumeration
  patterns.

**Non-Goals:**

- Email-verification **enforcement**. `email_verified_at` is currently read nowhere for access
  control; this change adds no banner and no paid-feature gate. (Maps to roadmap open-question #1,
  deferred to a separate change.)
- **Session management UI** (`GET/DELETE /api/auth/sessions`). The endpoints exist; the UI is deferred.
- **Rate limiting.** §2.2 is not built; forgot-password has no limiter today, so resend-verification
  matches that. Limiting is a follow-up tied to §2.2.

## Decisions

### Pages live inside the existing `(auth)` route group

The three pages are created at `src/app/(auth)/forgot/page.tsx`, `.../reset/page.tsx`, and
`.../verify/page.tsx`, serving `/forgot`, `/reset`, and `/verify`. This reuses the existing
`(auth)/layout.tsx` centered-card chrome (no new layout) and keeps one flat namespace alongside
`/login` and `/register`. Alternative considered: literal `/auth/*` pages matching the current email
link strings with zero email edits, but that leaves a `/login` vs `/auth/forgot` naming split for no
real benefit pre-production. Chosen Option B because the project is pre-production (emails are
dev/sandbox only), so the cost is two one-line string edits rather than broken inboxes.

### Email link paths updated to the group-relative routes

`src/lib/auth/emails.ts` changes the reset link from `/auth/reset?token=` to `/reset?token=` and the
verify link from `/auth/verify?token=` to `/verify?token=`, so emailed links resolve to the new pages.

### Verify page calls verify-email once via a ran-once guard

The verify-email endpoint is a GET that mutates (`email_verified_at`). The page calls it on mount
inside an effect guarded by a `useRef` ran-once flag so React strict-mode's double-invoke does not
fire two requests. The endpoint is idempotent regardless — a second hit on a consumed token whose user
is verified returns `already_verified: true` — so a stray double call degrades to the already-verified
state rather than an error.

### Resend identifies the user by session, falling back to an email field

`POST /api/auth/resend-verification` resolves the target as `session?.user?.email ?? body.email`. When
a visitor is signed in (e.g. auto-logged-in after register) the email field is unnecessary; when they
opened the link logged-out, the page collects an email. If neither is present the endpoint returns
`VALIDATION_ERROR`. Alternative considered: session-only (useless on the logged-out verify page) or
email-only (forces signed-in users to retype). The session-or-email model covers both entry paths.

### Resend mirrors forgot-password anti-enumeration

The endpoint returns `200 { data: {} }` whether or not a matching user exists. It issues a token via
`issueToken(user.id, "verify")` and calls `sendVerifyEmail` only when the user is `status = "active"`
and `email_verified_at` is null; otherwise it no-ops and logs a masked-email line. Token supersede is
already guaranteed by the existing `issueToken` rule in the email-verification spec, so this endpoint
inherits it without restating the transaction.

## Implementation Contract

**Behavior:**

- `/forgot` — email input; submitting posts to the forgot-password endpoint and always shows one
  neutral confirmation ("若該 Email 有對應帳號，我們已寄出重設連結"), never revealing whether the email
  exists. Links back to `/login`.
- `/reset?token=` — reads `token` from the query string. With no token, renders an invalid state
  linking to `/forgot`. Otherwise shows new-password + confirm fields, blocks submit unless the value
  is ≥ 8 chars and the two fields match, then posts `{ token, new_password }`. On `200`, shows a
  success message and redirects to `/login`. On the endpoint's error envelope (RESOURCE_NOT_FOUND /
  BUSINESS_RULE_VIOLATION / VALIDATION_ERROR), shows "連結已失效或過期" with a link to `/forgot`.
- `/verify?token=` — reads `token`, calls the verify-email endpoint once on mount. Renders: loading;
  verified (`data.already_verified === false`); already-verified (`data.already_verified === true`);
  and a dead-link state (missing token, RESOURCE_NOT_FOUND, or BUSINESS_RULE_VIOLATION) that exposes
  the resend affordance — a bare resend button using the session email when signed in, or an email
  field when logged out. Success/already-verified link to `/login`.
- Login page shows a "忘記密碼？" link to `/forgot`.

**Interface — `POST /api/auth/resend-verification`:**

- Request body: `{ email?: string }` (zod-validated; `email` must be a valid email when present).
- Resolution: target email = signed-in session user's email, else `body.email`; neither → 400
  `VALIDATION_ERROR`.
- Side effect: for an active, unverified matching user, `issueToken(userId, "verify")` then
  `sendVerifyEmail(email, token)`. No matching/eligible user → no token, no email, masked-email log.
- Response: always `200 { data: {}, meta: { request_id } }` on a resolved email (success or no-match).

**Failure modes:** resend never reveals account existence (always `200` once an email is resolved).
The verify page treats any non-2xx from verify-email as a recoverable dead-link state offering resend,
not a hard error.

**Acceptance criteria:**

- New Jest test `src/app/api/auth/resend-verification/route.test.ts` passes, covering: active
  unverified user → token issued + `sendVerifyEmail` called once; already-verified user → no send,
  still `200`; unknown email → no send, still `200`; missing email and no session → `VALIDATION_ERROR`;
  session present and body email omitted → resolves from session and sends.
- Manual: registering, clicking the emailed verify link, reaching `/verify` shows success and sets
  `email_verified_at`. Requesting a reset, clicking the emailed link, setting a new password at
  `/reset` redirects to `/login` and the new password authenticates.

**Scope boundaries:** in scope — the three pages, the resend endpoint + its test, the login link, and
the two email-link string edits. Out of scope — verification enforcement, session-management UI, and
rate limiting (see Non-Goals).

## Risks / Trade-offs

- [GET verify-email mutates state, so email link-prefetchers/scanners could auto-consume a token] →
  The endpoint is idempotent for an already-verified user (returns `already_verified`), and this
  matches the existing endpoint contract; not changed here.
- [Editing email link paths breaks any verify/reset link already delivered] → Pre-production only;
  emails are dev/sandbox, so no real inbox holds a `/auth/*` link.
- [Resend with no rate limit allows repeated verification emails] → Accepted; matches forgot-password
  today. Limiting lands with §2.2 across all recovery endpoints.
