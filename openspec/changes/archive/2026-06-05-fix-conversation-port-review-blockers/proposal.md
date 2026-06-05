## Why

A code review of `feat/conversation-port-from-backend` (documented in `docs/18_code_review_conversation_port.md`) found six merge-blocking security/money defects plus one user-visible UI bug. Three are exploitable by crafting a request body (privilege escalation, model-plan bypass, credit-floor bypass); three are check-then-act races on money/quota; one leaves finished chat replies stuck in a typing state. These must be fixed before the branch is merged and deployed.

## What Changes

Policy-defining fixes (each backed by a spec):

- **Project-order status integrity**: PATCH `/api/orders/{id}` rejects any `status` field when `project_type` is set; project-order transitions occur only through the dedicated routes (accept-quote / cancel / submit) guarded by `assertProjectTransition`. The admin `start` route additionally verifies a paid deposit `ProjectPayment` exists before moving to `in_execution`. **BREAKING** for any client that PATCHes status on a project order (none exists today; the customer UI gates status editing behind `!isProjectOrder`).
- **AI model plan gating**: the client-supplied model (`selectedModel` / `preferredModel`) on both chat POST routes is validated against the requesting plan's allowlist; an out-of-plan or unknown id is clamped to `pickModel({plan})` rather than forwarded to the provider.
- **Credit consumption**: `assertCreditsAvailable` becomes cost-aware. Image generation requires `available >= cost` (where `cost = imageCreditCost(count)`) before any paid work; insufficient balance throws `INSUFFICIENT_CREDITS`. Text chat retains the existing `available > 0` check since its token cost is unknown until after the call.

Correctness fixes (tasks only, no spec delta):

- **accept-quote race**: status-guarded write so two concurrent accepts cannot both record a deposit.
- **generation race**: idempotency so a double-clicked generate cannot run the paid image API twice.
- **revision-quota race**: atomic `used < total` guarded increment so concurrent revision requests cannot over-consume quota.
- **stuck streaming placeholder**: the `streaming` assistant row is finalized (or marked failed) on all error paths.
- **isStreaming inversion**: the `message.completed` SSE event sets `isStreaming: false` (one-line flip).

## Non-Goals

- Cleanup / efficiency / altitude items from the review (duplicated owned-order lookups, wallet helper extraction, SSE over-refetch, dead `intent-keywords.ts`, dead `/api/chat/messages` route, etc.) ? deferred to a separate change.
- The lower-severity verified findings (unvalidated `?status=` ? 500, unvalidated `activeDesignTaskId`, mutating GET on order detail, `canceled`/`cancelled` enum duplication, customer-cancel refund-rate-0, legacy site render degradation) ? not in scope here.
- Tightening status writes on **legacy** (non-project) e-commerce orders ? explicitly out of scope; only project orders are tightened.
- Replacing the manual (no payment-gateway) deposit recording with real payment processing.

## Capabilities

### New Capabilities

- `project-order-status-integrity`: who may change a project order's status, through which routes, and the invariant that `confirmed`/`in_execution` imply a recorded paid deposit.
- `ai-model-plan-gating`: server-side validation of a client-requested model against the plan allowlist, with clamp-on-miss behavior.
- `credit-consumption-policy`: cost-aware credit availability checks before paid operations, distinguishing fixed-cost (image) from post-hoc-cost (text) work.

### Modified Capabilities

(none)

## Impact

- Affected specs (new): `project-order-status-integrity`, `ai-model-plan-gating`, `credit-consumption-policy`
- Affected code:
  - Modified:
    - `src/app/api/orders/[id]/route.ts` (reject status for project orders in PATCH)
    - `src/app/api/admin/orders/[id]/start/route.ts` (verify paid deposit before in_execution)
    - `src/app/api/orders/[id]/accept-quote/route.ts` (status-guarded deposit write)
    - `src/app/api/orders/[id]/messages/route.ts` (atomic revision-quota increment)
    - `src/lib/project-orders.ts` (revision-quota guard helper)
    - `src/lib/conversation/generation-dispatcher.ts` (generation idempotency)
    - `src/lib/credits.ts` (cost-aware assertCreditsAvailable)
    - `src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts` (pass cost to credit check)
    - `src/lib/flexion.ts` (plan-allowlist validation helper)
    - `src/app/api/chat/messages/route.ts` (model validation)
    - `src/app/api/conversations/[id]/messages/route.ts` (model validation; finalize streaming placeholder on error)
    - `src/hooks/useConversations.ts` (isStreaming flip on message.completed)
  - New: (none)
  - Removed: (none)
