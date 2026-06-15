# generation-revision-source Specification (delta)

## ADDED Requirements

### Requirement: Revision prompts only accept generation results as the prior version

When resolving the prior-version source for a text regeneration, the system SHALL only accept messages whose type is `generation_result`. A user message SHALL NOT be used as the prior-version source, regardless of how the source message id was supplied. When no qualifying generation result exists for the task, the system SHALL build the creation prompt — without a prior-version content block and without revision instructions.

#### Scenario: First generation uses the creation prompt

- **WHEN** a text generation is dispatched for a task that has no prior generation results, with the triggering user message's id supplied as the source message id
- **THEN** the prompt contains no 被修改的前版內容 block and instructs full deliverable creation, not revision

#### Scenario: Regeneration from a real prior version

- **WHEN** a text generation is dispatched with a source message id that refers to an existing `generation_result` message
- **THEN** the prompt contains that result's content as the prior version and uses the revision instructions
