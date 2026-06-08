## ADDED Requirements

### Requirement: Conversation model selection is admin-only

The end-user interface SHALL NOT expose any control for choosing the conversation model, and chat/message requests SHALL NOT carry a user-chosen model identifier. The conversation model SHALL be the active `AiModelSetting` with `purpose = "conversation"` marked `is_default` (falling back to the first active conversation setting by `sort_order`, then `created_at`, when none is marked default). Admins SHALL change which model is used only through the admin panel's default toggle. The server SHALL retain its clamp — ignoring any model identifier that may still arrive on a request — as a defensive backstop, so removing the UI control does not change the server resolution contract.

#### Scenario: Chat UI exposes no model selector

- **WHEN** an end user opens the chat input on the generate landing
- **THEN** no model selector is shown and the sent request contains no user-chosen model identifier

#### Scenario: Conversation uses the admin default

- **WHEN** a chat message is sent with no model override
- **THEN** the system resolves the active `is_default` conversation setting (or the first active conversation setting by sort order when none is marked default) and uses it for the completion

#### Scenario: A stray client-supplied model is ignored

- **WHEN** a request nonetheless includes a model identifier
- **THEN** the system does not treat it as a user selection and resolves the model as the admin default per the rule above

##### Example: resolution with three active conversation models

| Active conversation settings (model, is_default, sort_order) | Resolved model |
| ------------------------------------------------------------ | -------------- |
| (claude-opus-4-7, true, 10), (gemini-3.1-pro-preview, false, 20), (gpt-5.4, false, 30) | claude-opus-4-7 (is_default) |
| (claude-opus-4-7, false, 10), (gemini-3.1-pro-preview, false, 20) | claude-opus-4-7 (first by sort_order) |
