# post-response-settlement Specification (delta)

## ADDED Requirements

### Requirement: Post-response work is scheduled through the runtime lifecycle extension

Server work that must complete after an API response has been returned (persisting marketing-intelligence results to message metadata and publishing the corresponding ready event) SHALL be scheduled through the serverless runtime's lifecycle-extension mechanism (`waitUntil` from `@vercel/functions`; `after()` from `next/server` once the repo is on a Next version that ships it). The system SHALL NOT rely on a detached promise continuation that the runtime is free to freeze when the response returns.

#### Scenario: Marketing intelligence settles after the response

- **WHEN** a message send returns its response while the marketing-intelligence lookup is still running
- **THEN** the lookup's result is persisted to the assistant message's metadata and the ready event is published, with that work registered via the lifecycle-extension mechanism rather than a detached promise
