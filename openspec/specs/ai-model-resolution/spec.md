# ai-model-resolution Specification

## Purpose

Defines how the platform resolves which AI model serves a conversation or design-task request. Model selection is driven by admin-managed `AiModelSetting` rows (not a per-plan allowlist); when no model is configured the request fails with `AI_MODEL_NOT_CONFIGURED` rather than falling back to a default.

## Requirements

### Requirement: Conversation model is resolved from admin-managed database settings

The chat and design-task generation endpoints SHALL resolve the AI model from active `AiModelSetting` rows with `purpose = "conversation"` rather than from environment variables or a plan allowlist. The system SHALL NOT forward a client-supplied model identifier to the AI provider; a client override SHALL only select among the configured settings.

When a request carries a model override (for example `selectedModel`, `preferredModel`, or `model`), the system SHALL select the active conversation setting whose `id` or `model_id` equals the override. If the override matches no active setting, the system SHALL fall back to the active setting marked `is_default`, and otherwise to the first active setting by sort order. The provider call SHALL use the selected setting's `model_id`, decrypted API key, and base URL.

The `AI_MODEL_NOT_CONFIGURED` (HTTP 422) gate SHALL apply only to requests that actually invoke a text model: the streamed chat reply and design-task generation whose delivery is text. When no active conversation setting exists, such a request SHALL be rejected with `AI_MODEL_NOT_CONFIGURED` and SHALL NOT call the AI provider, and SHALL NOT substitute a plan default or an environment-configured model. Requests that do not consume a conversation text model — image-domain dispatch (Gemini/Banana) and site/web generation that does not depend on the conversation model — SHALL NOT be blocked by this gate.

#### Scenario: Override matches a configured setting

- **WHEN** a user sends a chat message whose override equals the `id` or `model_id` of an active conversation setting
- **THEN** the system SHALL use that setting's `model_id` and provider configuration for the completion

#### Scenario: Override matches no configured setting

- **WHEN** a user sends a chat message with an override that matches no active conversation setting
- **THEN** the system SHALL use the default active setting (or the first active setting when none is marked default) and SHALL NOT forward the override to the provider

#### Scenario: Text request blocked when no conversation model is configured

- **WHEN** a chat or text-delivery design-task generation request is made while no active conversation setting exists
- **THEN** the system SHALL return `AI_MODEL_NOT_CONFIGURED` with HTTP 422 and SHALL NOT call the AI provider

#### Scenario: Image and web tasks are not blocked by the text-model gate

- **WHEN** an image-domain task (dispatched to the image pipeline) or a site/web generation that does not depend on the conversation model is requested while no active conversation setting exists
- **THEN** the system SHALL proceed with that task and SHALL NOT return `AI_MODEL_NOT_CONFIGURED`


<!-- @trace
source: fix-ai-model-resolution-review
updated: 2026-06-08
code:
  - src/lib/site-builder.ts
  - src/lib/flexion.ts
  - src/lib/website-builder/orchestrator.ts
  - src/lib/conversation/intent-resolver.ts
  - src/lib/conversation/marketing-intelligence.ts
  - docs/18_code_review_conversation_port.md
  - src/app/api/support/ask/route.ts
  - src/app/api/admin/copilot/route.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/lib/ai-model-settings.ts
  - src/app/api/conversations/[id]/messages/route.ts
tests:
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/lib/flexion.test.ts
  - src/app/api/conversations/[id]/messages/route.force-generate.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/lib/ai-model-settings.ddl.test.ts
  - src/lib/conversation/marketing-intelligence.test.ts
-->

---
### Requirement: Resolved provider config is authoritative for the provider call

When a request has a resolved provider config (base URL, decrypted API key, model id), the provider call SHALL use it and SHALL NOT be overridden by ambient environment provider credentials (for example an Anthropic API key present in the environment). Credit accounting for the call SHALL use the resolved setting's credit multiplier rather than a static default. Every conversation-path LLM call — the streamed chat reply, first-version design-task generation, conversation intent classification, and site/web schema generation — SHALL use a provider config resolved from the active settings rather than an environment-only default.

#### Scenario: Ambient Anthropic key does not override the resolved provider

- **WHEN** the environment contains an Anthropic API key AND a request supplies a resolved provider config pointing at a different provider
- **THEN** the system SHALL send the call to the resolved provider's base URL with the resolved key and model id, and SHALL NOT route it to Anthropic

#### Scenario: First-version generation uses the resolved provider and multiplier

- **WHEN** a design-task first-version generation runs with a resolved conversation setting
- **THEN** the provider call SHALL use that setting's provider config and credits SHALL be charged using that setting's credit multiplier

#### Scenario: Intent classification uses the resolved provider

- **WHEN** conversation intent classification runs on the same request as a resolved chat model
- **THEN** it SHALL use a provider config resolved from the active settings rather than an environment-only model

<!-- @trace
source: fix-ai-model-resolution-review
updated: 2026-06-08
code:
  - src/lib/site-builder.ts
  - src/lib/flexion.ts
  - src/lib/website-builder/orchestrator.ts
  - src/lib/conversation/intent-resolver.ts
  - src/lib/conversation/marketing-intelligence.ts
  - docs/18_code_review_conversation_port.md
  - src/app/api/support/ask/route.ts
  - src/app/api/admin/copilot/route.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/lib/ai-model-settings.ts
  - src/app/api/conversations/[id]/messages/route.ts
tests:
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/lib/flexion.test.ts
  - src/app/api/conversations/[id]/messages/route.force-generate.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/lib/ai-model-settings.ddl.test.ts
  - src/lib/conversation/marketing-intelligence.test.ts
-->