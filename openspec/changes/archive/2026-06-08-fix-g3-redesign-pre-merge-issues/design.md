## Context

PR #5 (`feat/g3-ui-redesign`) adds a 9-stage trade-order timeline with a lifecycle-advance API, redesigns the orders list with date filters, and rebuilds the app shell. Code review (docs/20_code_review_g3_ui_redesign.md) confirmed 7 issues that must be fixed before merge. The most severe: POST `/api/orders/{id}/lifecycle` writes `order.status` via raw `prisma.order.update`, bypassing `assertProjectTransition`, `OrderStatusHistory`, and the quote-acceptance gate — an order owner can promote a `quoted` order to `in_execution` in one click.

Relevant current state on the PR branch:

- `ALLOWED_TRANSITIONS` (src/lib/project-orders.ts): `draft→quote_pending→quoted→confirmed→in_execution→closed`, each with `cancelled`.
- The lifecycle route's `STAGE_TO_STATUS` maps `order_confirmed→in_execution`, `shipped→shipped`, `stocked_inbound→completed`. Two of these targets (`shipped`, `completed`) are not reachable in `ALLOWED_TRANSITIONS` at all, and `in_execution` is only legal from `confirmed` — so the current mapping cannot pass validation as-is; it must be redefined, not merely wrapped.
- All fixes land on branch `feat/g3-ui-redesign`, not main.

## Goals / Non-Goals

**Goals:**

- No order status change ever bypasses `assertProjectTransition` or skips its `OrderStatusHistory` row.
- Order owners cannot change order status through the lifecycle route at all.
- Date filters on GET `/api/orders` validate input (400 on garbage) and include the whole selected end day.
- Restore three regressed UI behaviors: draft-order 建議品項 block, collapsed-sidebar logout button, completed-order progress bar; replace the hardcoded `成立者 SHINKA` mock text with data-driven creator rendering from `order.customer.name`.

**Non-Goals:**

- Review findings #8–#11 (dead 檔案 filter, clearing `lifecycle_stage` on terminal status, removing the legacy duplicate timeline, STAGE_LABELS dedup) — deferred.
- Per-user timezone correctness for date filters (dates are interpreted as UTC day windows; see Risks).
- Reworking the 9-stage model or where `lifecycle_stage` is stored.
- Enabling the PL/CI document buttons (they stay disabled placeholders titled 尚未上傳).

## Decisions

### Owner lifecycle advances are metadata-only

Stages listed in `STAGE_TO_STATUS` (the ones with a status side-effect) can only be advanced by `admin`/`super_admin`. Non-admin owners may advance only the metadata-only stages (`processing`, `in_transit`, `arrived_warehouse`), keeping the existing one-step-forward rule. Owner attempts on a status-changing stage get `BUSINESS_RULE_VIOLATION` with a message directing them to the existing flows (quote acceptance for 訂單成立; admin for fulfilment milestones).

Rationale: the deposit/quote-acceptance gate lives in `accept-quote` (which validates an active quote before `quoted→confirmed`). Letting an owner trigger any status bump from the lifecycle route would re-open that side door, no matter how the mapping is fixed. Alternative considered — replicating the quote-acceptance checks inside the lifecycle route — rejected as logic duplication that would drift from `accept-quote`.

### Remap STAGE_TO_STATUS onto a validated trade status chain

`STAGE_TO_STATUS` becomes `order_confirmed→confirmed`, `shipped→shipped`, `stocked_inbound→completed`, and `ALLOWED_TRANSITIONS` gains two explicit trade-fulfilment continuations: `confirmed→shipped` and `shipped→completed` (plus `cancelled` from each, matching the table's existing pattern). Every status change in the lifecycle route is then validated with `assertProjectTransition(order.status, newStatus)` and recorded via `writeOrderStatusHistory`, with the order update and history write inside one `prisma.$transaction`.

Rationale: `order_confirmed` (訂單成立) semantically means `confirmed`, not `in_execution`; the current `quoted→in_execution` jump is exactly the two-state skip the review flagged. `shipped`/`completed` already exist in the `OrderStatus` enum (legacy family) and are the honest names for trade fulfilment milestones; admitting them as explicit transitions keeps one validated state machine instead of a parallel unvalidated one. Alternative considered — making lifecycle advances never touch status — rejected because Phase 11 deliberately made 觸發成立訂單 visibly settle the state, and it would widen the status/metadata divergence (deferred finding #9).

### Validate date filter params and use an exclusive next-day upper bound

GET `/api/orders` parses each of `date_start`, `date_end`, `quote_date_start`, `quote_date_end` once; any value where `Number.isNaN(parsed.getTime())` yields `ApiError("VALIDATION_ERROR", …)` → 400. End-date params filter with `lt: <parsed date + 1 day>` instead of `lte: <midnight of parsed date>`, so the entire selected day is included.

Rationale: `lt` next-day-midnight is the standard inclusive-day idiom and avoids the 23:59:59.999 millisecond-edge hack. Dates remain UTC-interpreted; full local-timezone fidelity would need a client-supplied offset (out of scope, see Risks).

### Restore regressed UI behaviors in place, no new components

- 建議品項: the redesigned `OrderCard` in src/app/(app)/orders/page.tsx renders the draft-order block (`metadata.suggested_items` list plus `notes` summary) under the field grid, gated exactly as the pre-redesign list was: `status === "draft" && (suggested_items?.length || notes)`.
- Logout: in src/components/app/app-shell.tsx, move `sidebar-expanded-only` off the logout `<form>` and back onto the `登出` label `<span>`, restoring the always-visible icon button.
- Progress bar: in src/components/app/trade-order-timeline.tsx, when no stage is `active` (all done), the connector width is 100% (`activeIdx === -1` → full), not `Math.max(0,-1) = 0`.
- SHINKA: delete the `idx === 2` block that renders the literal `成立者 SHINKA` and replace it with data-driven rendering — the timeline takes a `creatorName` prop and the order detail page (src/app/(app)/orders/[id]/page.tsx) passes `order.customer?.name`, which the create-order route already snapshots from the inquiry buyer's `CompanyProfile.name` at creation (deal-time fact, deliberately frozen; no write-path change needed, retroactive for existing trade orders). Demo orders keep showing SHINKA by naming the demo buyer's company SHINKA in data, not code.

Rationale: each is a restoration or deletion; introducing new abstractions here would expand the diff teammates must re-review before merge.

## Implementation Contract

**Behavior (observable after this change):**

1. POST `/api/orders/{id}/lifecycle` as a non-admin owner targeting `order_confirmed`, `shipped`, or `stocked_inbound` → 4xx `BUSINESS_RULE_VIOLATION`; order status and metadata unchanged.
2. POST `/api/orders/{id}/lifecycle` as admin targeting `order_confirmed` on a `quoted` order → status becomes `confirmed`, one `OrderStatusHistory` row (`quoted→confirmed`, actor = admin user id) is written atomically with the order update, and the existing `lifecycle_advanced` OrderEvent is still created.
3. Any lifecycle advance whose mapped status transition is illegal per the (extended) `ALLOWED_TRANSITIONS` → `CONFLICT` error from `assertProjectTransition`; nothing is written.
4. Owner advancing `processing`/`in_transit`/`arrived_warehouse` one step forward continues to work and never changes `order.status`.
5. GET `/api/orders?date_start=not-a-date` (any of the four date params) → 400 `VALIDATION_ERROR`, not 500.
6. GET `/api/orders?date_end=2026-06-07` includes orders created at any time on 2026-06-07 (UTC).
7. Orders list: a `draft` order with `metadata.suggested_items` shows the 建議品項 block on its card.
8. App shell: with the sidebar collapsed, the logout icon button is visible and submits the logout action; only the 登出 text is hidden.
9. Trade timeline: an order with `lifecycle_stage = "stocked_inbound"` renders the progress connector at 100% width with all nodes checked; the string `SHINKA` appears nowhere in src/; the 成立者 line renders `order.customer.name` (the buyer company name snapshotted at order creation) when present and is absent otherwise.

**Interface / data shape:** route paths, request bodies, and response envelopes are unchanged. `STAGE_TO_STATUS` values change as described; `ALLOWED_TRANSITIONS` gains `confirmed→shipped`, `shipped→completed`. New test file src/app/api/orders/[id]/lifecycle/lifecycle-gates.test.ts.

**Failure modes:** validation failures surface as the existing `ApiError` envelope (`VALIDATION_ERROR` 400, `BUSINESS_RULE_VIOLATION` 4xx, `CONFLICT`); no silent fallbacks are added. The orders-page client keeps its current error handling (improving it is out of scope).

**Acceptance criteria:** `npm run test` passes including the new lifecycle-gates tests covering contract items 1–4; items 5–6 covered by route tests or manual curl against local dev; items 7–9 verified manually in the browser on the PR branch. `npm run lint` and the production build stay green.

**Scope boundaries:** only the files in the proposal Impact (plus the new test file and src/lib/project-orders.ts for the transition-table extension) change; src/app/(app)/orders/[id]/page.tsx changes only to pass the `creatorName` prop. No prisma schema changes, no new dependencies, no changes under src/app/admin/ or to the codex admin-model-settings branch.

## Risks / Trade-offs

- [Extending `ALLOWED_TRANSITIONS` affects all callers of `assertProjectTransition`] → the two added edges (`confirmed→shipped`, `shipped→completed`) are forward-only continuations no existing route attempts; existing tests guard the current edges.
- [Date filters remain UTC-day windows, not local-day] → still strictly better than today (no day is silently truncated); document in the route comment; full tz support deferred.
- [Changing `order_confirmed` to map to `confirmed` alters Phase 11's visible behavior (status label shows 已確認 instead of 執行中)] → state still visibly settles, which was the Phase 11 intent; flag in the PR comment for the redesign author. If the author insists on `in_execution`, the admin flow must chain `confirmed→in_execution` explicitly — raise during PR review rather than silently re-skip states.
- [建議品項 block re-adds visual bulk to the redesigned card] → gated to draft orders only, matching pre-redesign behavior.

## Open Questions

- None blocking. One review-time confirmation for the redesign author: whether `order_confirmed` advance should remain admin-only or be replaced by a deep-link to the existing accept-quote flow in the timeline UI (this change ships admin-only as the safe default).
