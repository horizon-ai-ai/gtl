## ADDED Requirements

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

### Requirement: Verification email links to the verify page

The system SHALL build the verification email link to the `/verify` page route carrying the plaintext
token as a `token` query parameter.

#### Scenario: Verification email link targets the verify page

- **WHEN** `sendVerifyEmail` composes a message for a token
- **THEN** the link points at the `/verify` route with the token as a `token` query parameter
