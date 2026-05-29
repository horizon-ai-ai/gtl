## Why

The §3.1 auth recovery and verification endpoints (forgot-password, reset-password, verify-email) are built and tested, but no user-facing UI consumes them. A user who clicks a reset link or verification link in their email lands on a 404, and there is no in-app way to request a password reset or to resend a verification email. This change adds the three landing pages and wires them to the existing endpoints so the flows work end to end.

## What Changes

- Add page `/forgot` (in the existing `(auth)` route group) that posts to the forgot-password endpoint and shows a single anti-enumeration confirmation regardless of outcome.
- Add page `/reset` (reads a `token` query param) that posts to the reset-password endpoint, validates the new password client-side, and on success redirects to login.
- Add page `/verify` (reads a `token` query param) that calls the verify-email endpoint once on mount, renders verified / already-verified / expired / invalid states, and offers a resend affordance on dead links.
- Add endpoint `POST /api/auth/resend-verification` — anticipated by the email-verification spec. Re-issues a verification token for an active, unverified user; identifies the user by session when signed in, otherwise by an `email` field; returns `200` regardless of whether a user matched (anti-enumeration), mirroring forgot-password.
- Add a "忘記密碼？" link on the login page pointing to `/forgot`.
- Update the reset and verify email link paths in the email helpers from `/auth/reset` and `/auth/verify` to `/reset` and `/verify`, matching the new group-relative routes.
- Add Jest projects (node + jsdom) and React Testing Library to the dev stack, plus component tests for the three pages that lock the verify states + ran-once fetch guard, the reset validation gating, the forgot neutral confirmation, and the verify resend signed-in vs logged-out branches.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `account-recovery`: add UI requirements for the forgot-password and reset-password pages, and the login-page entry link.
- `email-verification`: add the resend-verification endpoint requirement, the verify-email landing-page UI requirements, and the email-link path update.

## Impact

- Affected specs: account-recovery, email-verification
- Affected APIs: adds one route (resend-verification); the existing recovery and verification routes are read-only consumers, unchanged.
- Affected code:
  - New:
    - src/app/(auth)/forgot/page.tsx
    - src/app/(auth)/reset/page.tsx
    - src/app/(auth)/verify/page.tsx
    - src/app/api/auth/resend-verification/route.ts
    - src/app/api/auth/resend-verification/route.test.ts
    - src/app/(auth)/forgot/page.test.tsx
    - src/app/(auth)/reset/page.test.tsx
    - src/app/(auth)/verify/page.test.tsx
    - jest.setup.dom.ts
  - Modified:
    - src/app/(auth)/login/page.tsx
    - src/lib/auth/emails.ts
    - jest.config.js
    - package.json
  - Removed: (none)
