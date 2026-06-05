## ADDED Requirements

### Requirement: Client-requested model is validated against the plan allowlist

The chat message endpoints SHALL NOT forward a client-supplied model identifier to the AI provider without validation. When a request carries a model override (for example `selectedModel` or `preferredModel`), the system SHALL accept it only if it belongs to the requesting user's plan allowlist (the same set exposed for selection by the conversation models endpoint). If the requested model is absent, unknown, or outside the plan's allowlist, the system SHALL clamp the model to the plan default returned by `pickModel({ plan })`.

#### Scenario: Requested model is within the plan allowlist

- **WHEN** a user on a plan whose allowlist includes the requested model sends a chat message with that model override
- **THEN** the system SHALL use the requested model for the completion

#### Scenario: Requested model is outside the plan allowlist

- **WHEN** a user sends a chat message with a model override that is not in their plan's allowlist
- **THEN** the system SHALL use the plan default from `pickModel({ plan })` and SHALL NOT forward the requested model to the provider

#### Scenario: Requested model is unknown or absent

- **WHEN** a chat request carries an unrecognized model identifier or no override
- **THEN** the system SHALL use the plan default from `pickModel({ plan })`

##### Example: model resolution by plan

| Plan | Requested model | Resolved model |
| ---- | --------------- | -------------- |
| free | (none) | plan default |
| free | premium model not in free allowlist | plan default (clamped) |
| free | model in free allowlist | requested model |
| free | unknown string | plan default (clamped) |
