# credit-consumption-policy Specification (delta)

## ADDED Requirements

### Requirement: Message edits only trigger paid regeneration within the generation's lineage

Editing a user message SHALL dispatch a paid regeneration only when the edited message belongs to the target generation's lineage — it is the generation's recorded instruction message or an ancestor on the generation's branch path. An edit to any other message SHALL be processed as a plain message edit: no generation quick-reply SHALL be attached, no generation SHALL be dispatched, and no credits SHALL be consumed.

#### Scenario: Typo fix on an unrelated message does not bill

- **WHEN** a conversation contains a completed image generation and the user edits an unrelated consultative question to fix a typo
- **THEN** the edit is sent without a generation quick-reply, no generation is dispatched, and no credits are consumed

#### Scenario: Editing the generation's instruction still regenerates

- **WHEN** the user edits the message that triggered an existing generation
- **THEN** a regeneration is dispatched for that generation's task and billed under the existing fixed-cost policy
