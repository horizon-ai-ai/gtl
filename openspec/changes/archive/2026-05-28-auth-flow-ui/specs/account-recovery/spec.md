## ADDED Requirements

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

### Requirement: Login page links to forgot-password

The system SHALL display a link on the login page that navigates to `/forgot`.

#### Scenario: Login page exposes the forgot-password entry point

- **WHEN** a user views the login page
- **THEN** a "忘記密碼？" link to `/forgot` is present

### Requirement: Password-reset email links to the reset page

The system SHALL build the password-reset email link to the `/reset` page route carrying the plaintext
token as a `token` query parameter.

#### Scenario: Reset email link targets the reset page

- **WHEN** `sendPasswordResetEmail` composes a message for a token
- **THEN** the link points at the `/reset` route with the token as a `token` query parameter
