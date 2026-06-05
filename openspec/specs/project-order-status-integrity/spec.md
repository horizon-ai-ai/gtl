# project-order-status-integrity Specification

## Purpose

TBD - created by archiving change 'fix-conversation-port-review-blockers'. Update Purpose after archive.

## Requirements

### Requirement: Project order status is server-controlled

The system SHALL NOT allow an order owner to set the `status` of a project order (an order whose `project_type` is non-null) through the generic order update endpoint. Project-order status transitions SHALL occur only through the dedicated transition routes (accept-quote, cancel, submit, and the admin transition routes), each of which validates the transition via `assertProjectTransition`. Status changes to legacy (non-project) orders are out of scope and SHALL remain unchanged.

#### Scenario: Owner attempts to set status on a project order via generic update

- **WHEN** an authenticated owner sends PATCH `/api/orders/{id}` with a `status` field for an order whose `project_type` is set
- **THEN** the system SHALL reject the request with a business-rule error and SHALL NOT change the order's status

#### Scenario: Owner updates non-status fields on a project order

- **WHEN** an authenticated owner sends PATCH `/api/orders/{id}` for a project order without a `status` field (for example, updating notes)
- **THEN** the system SHALL apply the permitted field changes and SHALL leave the status unchanged

#### Scenario: Status transition through a dedicated route

- **WHEN** an authenticated owner accepts an active quote via the accept-quote route
- **THEN** the system SHALL move the order to `confirmed` only after `assertProjectTransition` validates the `quoted -> confirmed` transition

##### Example: status field handling by order type

| Order project_type | PATCH body contains status | Result |
| ------------------ | -------------------------- | ------ |
| null (legacy) | yes | status applied (unchanged behavior) |
| "website" | yes | rejected, status unchanged |
| "website" | no | other fields applied, status unchanged |


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
### Requirement: In-execution project orders imply a recorded paid deposit

The system SHALL guarantee that a project order moved to `in_execution` has a recorded paid deposit `ProjectPayment`. The admin route that moves an order from `confirmed` to `in_execution` SHALL verify that a `ProjectPayment` of kind `deposit` with status `paid` exists for the order before performing the transition.

#### Scenario: Admin starts a confirmed order with a paid deposit

- **WHEN** an admin starts a project order that has a `ProjectPayment` of kind `deposit` with status `paid`
- **THEN** the system SHALL transition the order to `in_execution`

#### Scenario: Admin starts a confirmed order with no paid deposit

- **WHEN** an admin attempts to start a project order that has no paid deposit `ProjectPayment`
- **THEN** the system SHALL reject the request with a business-rule error and SHALL NOT transition the order to `in_execution`

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