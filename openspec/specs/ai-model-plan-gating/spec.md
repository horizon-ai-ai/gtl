# ai-model-plan-gating Specification

## Purpose

Defines how the platform resolves which AI model serves a conversation or design-task request. Model selection is driven by admin-managed `AiModelSetting` rows (not a per-plan allowlist); when no model is configured the request fails with `AI_MODEL_NOT_CONFIGURED` rather than falling back to a default.

## Requirements

### Requirement: Conversation model is resolved from admin-managed database settings

The chat and design-task generation endpoints SHALL resolve the AI model from active `AiModelSetting` rows with `purpose = "conversation"` rather than from environment variables or a plan allowlist. The system SHALL NOT forward a client-supplied model identifier to the AI provider; a client override SHALL only select among the configured settings.

When a request carries a model override (for example `selectedModel`, `preferredModel`, or `model`), the system SHALL select the active conversation setting whose `id` or `model_id` equals the override. If the override matches no active setting, the system SHALL fall back to the active setting marked `is_default`, and otherwise to the first active setting by sort order. The provider call SHALL use the selected setting's `model_id`, decrypted API key, and base URL.

When no active conversation setting exists, the system SHALL reject the request with `AI_MODEL_NOT_CONFIGURED` (HTTP 422) and SHALL NOT call the AI provider. The system SHALL NOT substitute a plan default or an environment-configured model.

#### Scenario: Override matches a configured setting

- **WHEN** a user sends a chat message whose override equals the `id` or `model_id` of an active conversation setting
- **THEN** the system SHALL use that setting's `model_id` and provider configuration for the completion

#### Scenario: Override matches no configured setting

- **WHEN** a user sends a chat message with an override that matches no active conversation setting
- **THEN** the system SHALL use the default active setting (or the first active setting when none is marked default) and SHALL NOT forward the override to the provider

#### Scenario: No conversation model is configured

- **WHEN** a chat or design-task generation request is made while no active conversation setting exists
- **THEN** the system SHALL return `AI_MODEL_NOT_CONFIGURED` with HTTP 422 and SHALL NOT call the AI provider

##### Example: model resolution from database settings

| Active settings (id, model_id, default) | Requested override | Resolved model |
| --------------------------------------- | ------------------ | -------------- |
| [(s1, gpt-5.4, true), (s2, claude-opus-4-7, false)] | (none) | gpt-5.4 (default) |
| [(s1, gpt-5.4, true), (s2, claude-opus-4-7, false)] | s2 | claude-opus-4-7 (by id) |
| [(s1, gpt-5.4, true), (s2, claude-opus-4-7, false)] | claude-opus-4-7 | claude-opus-4-7 (by model_id) |
| [(s1, gpt-5.4, true), (s2, claude-opus-4-7, false)] | unknown-model | gpt-5.4 (default fallback) |
| [] | anything | error: AI_MODEL_NOT_CONFIGURED (422) |

<!-- @trace
source: fix-db-model-resolution-tests
updated: 2026-06-08
code:
  - docs/21_修復說明_G3改版合併前修正.pdf
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - docs/19_修復說明_對話移植審查.md
  - docs/22_ai_model_settings_seed_notes.md
  - docs/19_修復說明_對話移植審查.html
  - src/lib/conversation/api.ts
  - src/lib/ai-model-settings.ts
  - docs/admin_api_extraction_pattern.md
  - docs/19_修復說明_對話移植審查_表格版.html
  - docs/17_spec_gap_roadmap.md
  - docs/20_code_review_g3_ui_redesign.md
  - docs/21_修復說明_G3改版合併前修正.html
  - docs/19_修復說明_對話移植審查.pdf
  - docs/21_修復說明_G3改版合併前修正.md
  - src/app/api/conversations/models/route.ts
tests:
  - src/app/api/chat/messages/route.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
-->