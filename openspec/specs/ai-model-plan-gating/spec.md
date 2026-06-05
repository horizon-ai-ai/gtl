# ai-model-plan-gating Specification

## Purpose

TBD - created by archiving change 'fix-conversation-port-review-blockers'. Update Purpose after archive.

## Requirements

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

<!-- @trace
source: fix-conversation-port-review-blockers
updated: 2026-06-05
code:
  - src/lib/conversation/generation-dispatcher.ts
  - docs/19_修復說明_對話移植審查.pdf
  - src/lib/project-orders.ts
  - src/app/api/chat/messages/route.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/lib/credits.ts
  - src/app/api/conversations/[id]/messages/route.ts
  - src/hooks/useConversations.ts
  - docs/19_修復說明_對話移植審查.html
  - docs/19_修復說明_對話移植審查.md
  - docs/18_code_review_conversation_port.md
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/app/api/orders/[id]/accept-quote/route.ts
  - src/lib/api.ts
  - src/app/api/orders/[id]/messages/route.ts
  - src/lib/conversation/api.ts
  - docs/19_修復說明_對話移植審查_表格版.html
  - src/app/api/admin/orders/[id]/start/route.ts
  - docs/17_spec_gap_roadmap.md
  - docs/admin_api_extraction_pattern.md
  - src/app/api/orders/[id]/route.ts
tests:
  - src/app/api/orders/[id]/messages/route.test.ts
  - src/app/api/chat/messages/route.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/app/api/orders/[id]/accept-quote/route.test.ts
  - src/lib/credits.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/lib/conversation/generation-dispatcher.test.ts
  - src/app/api/orders/[id]/downstream-gates.test.ts
  - src/app/api/orders/[id]/route.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/app/api/admin/orders/[id]/start/route.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
-->