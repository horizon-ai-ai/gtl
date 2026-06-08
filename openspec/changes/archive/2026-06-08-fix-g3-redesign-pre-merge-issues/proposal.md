## Why

Code review of PR #5 (`feat/g3-ui-redesign`, the G3 brand redesign) confirmed 10 issues, of which 7 must be fixed before the branch merges to main and deploys (see docs/20_code_review_g3_ui_redesign.md). The most severe is a business-integrity hole: the new trade-order lifecycle route lets an order owner promote a `quoted` order straight to `in_execution`, bypassing the deposit/payment gate, the `assertProjectTransition` state machine, and the `OrderStatusHistory` audit trail.

## What Changes

- **Lifecycle route hardening** (review #1): POST `/api/orders/{id}/lifecycle` validates every status change through `assertProjectTransition`, writes an `OrderStatusHistory` row for each status mutation, and refuses owner-initiated advances that would change order status past an unpaid gate (status-changing stage advances become admin-only; owners may advance only stages with no status side-effect).
- **Restore AI-suggested line items** (review #2): the draft-order 建議品項 block (`metadata.suggested_items`) is rendered again — on the redesigned orders list card for draft orders, matching pre-redesign behavior.
- **Remove hardcoded mock content** (review #3): drop the literal `成立者 SHINKA` from the trade-order timeline and render the creator from order data instead — the timeline shows `order.customer.name` (already snapshotted at order creation from the inquiry buyer's company profile) and hides the line when absent; demo orders keep SHINKA via demo data, not code.
- **Restore collapsed-sidebar logout** (review #4): the logout button stays clickable when the sidebar is collapsed; only its text label is hidden (pre-redesign behavior).
- **Inclusive end-date filtering** (review #5): `date_end` / `quote_date_end` on GET `/api/orders` include the entire selected day instead of cutting off at midnight UTC (which dropped most end-date orders for UTC+8 users).
- **Validate date filter params** (review #6): malformed date query params return 400 `VALIDATION_ERROR` instead of a Prisma 500 that the client renders as a silent empty list.
- **Completed-order progress bar** (review #7): the trade timeline renders a 100% progress connector when all 9 stages are done, instead of 0%.

All fixes land on the `feat/g3-ui-redesign` branch (PR #5) before merge — not on main.

## Non-Goals

- Review findings #8–#11 are explicitly deferred: the dead 檔案 filter (needs API support), clearing `metadata.lifecycle_stage` on terminal status (needs a design decision), removing the legacy duplicate timeline (needs author confirmation per the Phase 12 handoff doc), and the STAGE_LABELS duplication cleanup.
- No redesign of the 9-stage lifecycle model itself; `metadata.lifecycle_stage` remains the storage for intermediate stages.
- No changes to the codex `admin-model-settings-db-only` branch stacked on top of this PR.
- Rejected approach for #1: removing the lifecycle route entirely (the stepper advance is a deliberate Phase 9 feature; it needs guarding, not deletion).

## Capabilities

### New Capabilities

- `order-list-filtering`: date-range filter semantics for GET `/api/orders` — input validation of date params and inclusive end-date behavior.

### Modified Capabilities

- `project-order-status-integrity`: extend the server-controlled-status requirement to cover the new lifecycle-advance route — status transitions through it SHALL be validated by `assertProjectTransition`, SHALL be recorded in `OrderStatusHistory`, and owner-initiated advances SHALL NOT change order status.

## Impact

- Affected specs: `project-order-status-integrity` (modified), `order-list-filtering` (new)
- Affected code (all on branch `feat/g3-ui-redesign`):
  - Modified: src/app/api/orders/[id]/lifecycle/route.ts
  - Modified: src/lib/project-orders.ts
  - Modified: src/app/api/orders/route.ts
  - Modified: src/app/(app)/orders/page.tsx
  - Modified: src/app/(app)/orders/[id]/page.tsx
  - Modified: src/components/app/trade-order-timeline.tsx
  - Modified: src/components/app/app-shell.tsx
  - New: src/app/api/orders/[id]/lifecycle/lifecycle-gates.test.ts
  - Removed: (none)
- Reference: docs/20_code_review_g3_ui_redesign.md (review findings and verification evidence)
