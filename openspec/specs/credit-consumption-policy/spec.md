# credit-consumption-policy Specification

## Purpose

TBD - created by archiving change 'fix-conversation-port-review-blockers'. Update Purpose after archive.

## Requirements

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

---
### Requirement: Post-hoc-cost operations retain a positive-balance check

For an operation whose credit cost is not known until after the work completes (text chat, costed from token usage), the system SHALL require only that the user's available credits are greater than zero before dispatch, and SHALL consume the measured cost afterward.

#### Scenario: Text chat with a positive balance

- **WHEN** a user with available credits greater than zero sends a text chat message
- **THEN** the system SHALL dispatch the completion and consume the measured token cost afterward

#### Scenario: Text chat with an exhausted balance

- **WHEN** a user with available credits at or below zero sends a text chat message
- **THEN** the system SHALL reject the request with a quota-exceeded error

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

---
### Requirement: Message edits only trigger paid regeneration within the generation's lineage

Editing a user message SHALL dispatch a paid regeneration only when the edited message belongs to the target generation's lineage — it is the generation's recorded instruction message or an ancestor on the generation's branch path. An edit to any other message SHALL be processed as a plain message edit: no generation quick-reply SHALL be attached, no generation SHALL be dispatched, and no credits SHALL be consumed.

#### Scenario: Typo fix on an unrelated message does not bill

- **WHEN** a conversation contains a completed image generation and the user edits an unrelated consultative question to fix a typo
- **THEN** the edit is sent without a generation quick-reply, no generation is dispatched, and no credits are consumed

#### Scenario: Editing the generation's instruction still regenerates

- **WHEN** the user edits the message that triggered an existing generation
- **THEN** a regeneration is dispatched for that generation's task and billed under the existing fixed-cost policy

<!-- @trace
source: fix-message-branching-pre-merge-issues
updated: 2026-06-15
code:
  - src/app/(app)/generate/page.tsx
  - src/app/api/conversations/[id]/messages/route.ts
  - src/lib/conversation/dispatch/text-generation.ts
  - src/lib/conversation/intent-resolver.ts
  - package.json
  - src/lib/conversation/dispatch/shared.ts
  - src/hooks/useConversations.ts
  - src/lib/conversation/edit-lineage.ts
  - .claude_pr7.utf8.diff
tests:
  - src/lib/conversation/dispatch/shared.cancel-merge.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/lib/conversation/dispatch/text-generation.test.ts
  - src/lib/conversation/edit-lineage.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/hooks/useConversations.pendingCancel.test.tsx
  - src/app/api/conversations/[id]/messages/route.force-generate.test.ts
-->