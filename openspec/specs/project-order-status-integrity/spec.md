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

---
### Requirement: Lifecycle advances validate status transitions and record history

The trade-order lifecycle advance route SHALL NOT write `order.status` directly. Whenever a lifecycle stage advance implies a status change, the route SHALL validate the transition via `assertProjectTransition` against the allowed-transition table and SHALL write an `OrderStatusHistory` row in the same database transaction as the order update. The allowed-transition table SHALL include the trade fulfilment continuations `confirmed -> shipped` and `shipped -> completed`. A stage advance whose implied transition is illegal SHALL fail with a conflict error and SHALL NOT modify the order.

#### Scenario: Admin advances a stage with a legal status transition

- **WHEN** an admin advances a `quoted` trade order to the `order_confirmed` stage
- **THEN** the system SHALL set the order status to `confirmed`, SHALL write an `OrderStatusHistory` row recording `quoted -> confirmed`, and SHALL update `metadata.lifecycle_stage` atomically with the status change

#### Scenario: Stage advance implying an illegal transition is rejected

- **WHEN** an admin advances a trade order to a stage whose mapped status is not reachable from the order's current status in the allowed-transition table
- **THEN** the system SHALL reject the request with a conflict error and SHALL NOT change the order's status, metadata, or history

##### Example: stage-to-status mapping under the extended transition table

| Current status | Target stage | Implied status | Result |
| -------------- | ------------ | -------------- | ------ |
| quoted | order_confirmed | confirmed | allowed, history row quoted -> confirmed |
| confirmed | shipped | shipped | allowed, history row confirmed -> shipped |
| shipped | stocked_inbound | completed | allowed, history row shipped -> completed |
| quoted | shipped | shipped | rejected (quoted -> shipped not allowed) |


<!-- @trace
source: fix-g3-redesign-pre-merge-issues
updated: 2026-06-08
code:
  - docs/19_修復說明_對話移植審查.html
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/globals.css
  - src/app/admin/trade/quotations/page.tsx
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/components/app/hero-breathing.tsx
  - src/app/layout.tsx
  - docs/admin_api_extraction_pattern.md
  - src/app/api/orders/[id]/lifecycle/route.ts
  - docs/21_修復說明_G3改版合併前修正.md
  - docs/17_spec_gap_roadmap.md
  - HANDOFF_G3_UI_REDESIGN.md
  - src/app/(app)/orders/[id]/page.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/orders/route.ts
  - src/app/page.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查.md
  - docs/20_code_review_g3_ui_redesign.md
  - src/components/app/trade-order-timeline.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - tailwind.config.ts
  - src/app/(app)/orders/page.tsx
  - src/components/ui/prompt-chips.tsx
  - docs/21_修復說明_G3改版合併前修正.pdf
  - src/components/app/app-shell.tsx
  - src/components/app/brand-watermark.tsx
  - src/components/ui/ai-chat-input.tsx
  - src/app/(app)/generate/page.tsx
  - src/lib/chips/default-prompts.ts
  - src/lib/trade-order-stages.ts
  - docs/21_修復說明_G3改版合併前修正.html
tests:
  - src/app/api/orders/[id]/lifecycle/lifecycle-gates.test.ts
  - src/app/api/orders/list-date-filters.test.ts
-->

---
### Requirement: Order owners cannot change status through lifecycle advances

The system SHALL NOT allow a non-admin order owner to advance a lifecycle stage that implies an order status change. Non-admin owners SHALL be limited to advancing metadata-only stages (`processing`, `in_transit`, `arrived_warehouse`) by exactly one step forward, and such advances SHALL leave `order.status` unchanged. Stage advances that imply a status change SHALL require the `admin` or `super_admin` role.

#### Scenario: Owner attempts a status-changing stage advance

- **WHEN** an authenticated non-admin owner posts a lifecycle advance targeting `order_confirmed`, `shipped`, or `stocked_inbound`
- **THEN** the system SHALL reject the request with a business-rule error and SHALL NOT change the order's status or metadata

#### Scenario: Owner advances a metadata-only stage

- **WHEN** an authenticated non-admin owner advances the active metadata-only stage (for example `processing`) by one step
- **THEN** the system SHALL update `metadata.lifecycle_stage` and SHALL leave `order.status` unchanged

<!-- @trace
source: fix-g3-redesign-pre-merge-issues
updated: 2026-06-08
code:
  - docs/19_修復說明_對話移植審查.html
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/globals.css
  - src/app/admin/trade/quotations/page.tsx
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/components/app/hero-breathing.tsx
  - src/app/layout.tsx
  - docs/admin_api_extraction_pattern.md
  - src/app/api/orders/[id]/lifecycle/route.ts
  - docs/21_修復說明_G3改版合併前修正.md
  - docs/17_spec_gap_roadmap.md
  - HANDOFF_G3_UI_REDESIGN.md
  - src/app/(app)/orders/[id]/page.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/orders/route.ts
  - src/app/page.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查.md
  - docs/20_code_review_g3_ui_redesign.md
  - src/components/app/trade-order-timeline.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - tailwind.config.ts
  - src/app/(app)/orders/page.tsx
  - src/components/ui/prompt-chips.tsx
  - docs/21_修復說明_G3改版合併前修正.pdf
  - src/components/app/app-shell.tsx
  - src/components/app/brand-watermark.tsx
  - src/components/ui/ai-chat-input.tsx
  - src/app/(app)/generate/page.tsx
  - src/lib/chips/default-prompts.ts
  - src/lib/trade-order-stages.ts
  - docs/21_修復說明_G3改版合併前修正.html
tests:
  - src/app/api/orders/[id]/lifecycle/lifecycle-gates.test.ts
  - src/app/api/orders/list-date-filters.test.ts
-->