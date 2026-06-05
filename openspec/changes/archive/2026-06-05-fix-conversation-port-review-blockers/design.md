# Design — fix-conversation-port-review-blockers

## Context

`feat/conversation-port-from-backend` ports a conversation workspace, order/quote/payment flow, and credit metering into the app. A `/code-review high` pass (findings in `docs/18_code_review_conversation_port.md`) confirmed six merge-blocking defects and one UI bug. They cluster into three policy gaps (status integrity, model gating, credit floor) and four correctness defects (three check-then-act races, one stuck-streaming path), plus a one-line SSE flag inversion.

Constraints:
- The `Order` table is shared between legacy e-commerce orders (`project_type` null) and project orders (`project_type` set). Only project orders are tightened here.
- Deposit recording is currently manual bookkeeping (no payment gateway); `status` is the only trusted signal that money changed hands, which is why status integrity matters.
- Prisma + PostgreSQL; concurrency fixes rely on atomic conditional writes, not application-level locks.

## Goals / Non-Goals

In scope:
- Close the three body-crafting bypasses (status, model, credits).
- Make the three money/quota mutations safe under concurrent requests.
- Finalize stuck streaming placeholders; flip the inverted `isStreaming` flag.

Out of scope:
- Cleanup/efficiency/altitude items from the review (duplicate owned-order lookups, wallet helper extraction, SSE over-refetch, dead `intent-keywords.ts`, dead `/api/chat/messages` route).
- Lower-severity verified findings (unvalidated `?status=` → 500, unvalidated `activeDesignTaskId`, mutating GET, enum spelling duplication, customer-cancel refund rate, legacy site render degradation).
- Tightening status writes on legacy (non-project) orders.
- Replacing manual deposit recording with real payment processing.

## Decisions

### Reject status writes for project orders in the generic update route

The generic order PATCH handler will branch on `project_type`: when set, a `status` field in the body is rejected with a business-rule error; permitted non-status fields still apply. Legacy orders keep their current behavior. Rationale: project status transitions carry money/quota side-effects that only the dedicated routes (and `assertProjectTransition`) perform; the generic route can never reproduce them safely. Alternative considered — routing the generic PATCH through `assertProjectTransition` — rejected because the transition guard validates ordering but not the deposit/quote side-effects, so it would still allow a side-effect-free jump to `confirmed`.

### Verify a paid deposit before in_execution

The admin start route will check for a `ProjectPayment` of kind `deposit` with status `paid` before transitioning `confirmed -> in_execution`. Rationale: defense in depth — even if a future route sets `confirmed` without a deposit, work cannot start unpaid. Alternative — trusting `status === 'confirmed'` alone — rejected as the single point of failure this review already exploited.

### Status-guarded conditional writes for the three races

Each race is fixed by making the mutating write conditional on the precondition, inside the existing transaction, so concurrent requests cannot both succeed:
- accept-quote: the order update becomes conditional on the order still being in the pre-accept status (guarded update affecting zero rows ⇒ abort), so only one concurrent accept records a deposit.
- revision quota: the increment becomes a single guarded update conditioned on `used < total` (replacing the read-via-global-client then unconditional increment), so over-consumption affecting zero rows aborts.
- generation: the in-flight check and the `queued` marker creation are made atomic via an idempotency key derived from (conversation, task, intent) so a double-click cannot create two queued generations or call the paid image API twice.

Rationale: PostgreSQL conditional `updateMany`/unique constraints give correctness without app-level locks. Alternative — serializable transactions — rejected as heavier and still needing retry handling.

### Cost-aware credit check

`assertCreditsAvailable` gains a cost parameter. Image generation passes the computed `imageCreditCost(count)` and requires `available >= cost` before any paid work; text chat passes no cost (or zero) and retains the `available > 0` semantics, since token cost is only known after the call. Rationale: image cost is fully known up front, so a true pre-check is possible and prevents the negative-balance overdraft; text cost is not, so a small post-hoc overshoot is unavoidable and acceptable. Alternative — allow one overdraft then block — rejected: no reason to permit any overshoot when the price is known before the work.

### Plan-allowlist model validation with clamp-on-miss

A validation helper resolves the requested model against the plan's allowlist (the same set surfaced by the conversation models endpoint). In-allowlist ⇒ honored; absent/unknown/out-of-plan ⇒ clamped to `pickModel({ plan })`. Rationale: clamping avoids breaking any client sending a stale id while closing the premium-model and undercharge leak. Alternative — reject with 4xx — rejected to avoid surfacing errors for benign stale ids.

### Finalize streaming placeholder on all paths; flip isStreaming

The streaming assistant row will be finalized (or marked failed) in a `finally`/catch so an error between creation and finalize cannot orphan it in `streaming` status. The SSE handler's `message.completed` branch sets `isStreaming: false`. Rationale: both are localized correctness fixes with no policy dimension.

## Implementation Contract

Observable behavior after this change:

- **Order status (project):** PATCH `/api/orders/{id}` with a `status` field on a project order returns a business-rule error and the persisted status is unchanged; the same request without `status` succeeds for other fields. Verify: integration test asserting a project order in `quote_pending` stays `quote_pending` after such a PATCH, and that revision-quota/purchase and `revision_request` remain blocked.
- **Deposit-before-start:** admin start on a `confirmed` order lacking a paid deposit `ProjectPayment` returns a business-rule error; with a paid deposit it transitions to `in_execution`. Verify: test both branches.
- **accept-quote race:** two concurrent accepts on the same active quote result in exactly one paid deposit `ProjectPayment` and one `confirmed` order; the loser receives an error. Verify: concurrent-call test asserting deposit count == 1.
- **revision-quota race:** with `used = total - 1`, two concurrent `revision_request` calls result in at most one additional increment; `used` never exceeds `total`. Verify: concurrent-call test asserting `used <= total`.
- **generation race:** two concurrent generate calls for the same task produce one queued generation and one paid image API invocation. Verify: test asserting a single `generation_result` queued row / single charge.
- **credit floor:** a user with available credits below `imageCreditCost(count)` receives an insufficient-credits error with no provider call and no credit consumption; a user with `available >= cost` succeeds and is charged exactly the cost. Verify: tests for both branches and for the multi-image count multiplier.
- **model gating:** an out-of-plan or unknown `selectedModel` results in the plan default being used (asserted via the resolved model passed to the provider call); an in-plan model is honored. Verify: unit test of the resolver helper covering in-allowlist / out-of-plan / unknown / absent.
- **streaming:** a completed assistant text reply renders settled (not typing); an error mid-stream leaves no row stuck in `streaming` status. Verify: a finalize-on-error test and a client-state assertion that `message.completed` yields `isStreaming: false`.

Scope boundary: changes are limited to the files listed in the proposal Impact section. No schema migration is required unless a unique constraint is chosen for the generation idempotency fix; if so, that migration is additive and in scope.

## Risks / Trade-offs

- [Generation idempotency via unique constraint needs a migration] → Prefer a key derived from existing columns; if a constraint is required, ship an additive migration and handle the unique-violation as "already in flight."
- [Clamping models silently changes the model a user thinks they selected] → Acceptable: the UI only offers in-plan models; clamping affects only crafted/stale requests.
- [Plan allowlist must stay in sync with the models endpoint] → Derive both from one shared source to prevent drift.
- [Conditional writes change error surfaces] → Map zero-row guarded updates to the existing business-rule error type so clients see consistent failures.

## Migration Plan

- Deploy with the branch; no data backfill required.
- If the generation idempotency fix uses a unique constraint, include the additive Prisma migration in the same deploy.
- Rollback: revert the branch; no destructive schema change is introduced (any added constraint is additive and safe to drop).

## Open Questions

- Generation idempotency: derived key vs. unique partial index — to be settled during implementation based on whether a stable key exists across the double-click window.
