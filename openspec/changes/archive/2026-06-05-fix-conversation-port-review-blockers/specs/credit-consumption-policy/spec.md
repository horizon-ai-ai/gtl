## ADDED Requirements

### Requirement: Fixed-cost operations check full cost before dispatch

For an operation whose credit cost is known before the work is performed (image generation, costed as `imageCreditCost(count)`), the system SHALL verify that the user's available credits are greater than or equal to the operation cost before dispatching any paid work. When the available balance is less than the cost, the system SHALL reject the request with an insufficient-credits error and SHALL NOT call the paid provider or consume credits.

#### Scenario: Sufficient balance for image generation

- **WHEN** a user with available credits greater than or equal to the image cost requests a generation
- **THEN** the system SHALL dispatch the generation and consume the computed cost

#### Scenario: Insufficient balance for image generation

- **WHEN** a user with available credits less than the image cost requests a generation
- **THEN** the system SHALL reject the request with an insufficient-credits error, SHALL NOT call the image provider, and SHALL NOT consume credits

##### Example: image generation availability (cost = 20000 per image)

| Available credits | Images requested | Cost | Result |
| ----------------- | ---------------- | ---- | ------ |
| 1 | 1 | 20000 | rejected, no consumption |
| 20000 | 1 | 20000 | dispatched, 20000 consumed |
| 30000 | 2 | 40000 | rejected, no consumption |
| 40000 | 2 | 40000 | dispatched, 40000 consumed |

### Requirement: Post-hoc-cost operations retain a positive-balance check

For an operation whose credit cost is not known until after the work completes (text chat, costed from token usage), the system SHALL require only that the user's available credits are greater than zero before dispatch, and SHALL consume the measured cost afterward.

#### Scenario: Text chat with a positive balance

- **WHEN** a user with available credits greater than zero sends a text chat message
- **THEN** the system SHALL dispatch the completion and consume the measured token cost afterward

#### Scenario: Text chat with an exhausted balance

- **WHEN** a user with available credits at or below zero sends a text chat message
- **THEN** the system SHALL reject the request with a quota-exceeded error
