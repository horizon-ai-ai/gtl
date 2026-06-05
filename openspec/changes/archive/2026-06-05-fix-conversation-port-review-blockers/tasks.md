# Tasks — fix-conversation-port-review-blockers

## 1. Project order status integrity

- [x] 1.1 Make project order status server-controlled (Design: reject status writes for project orders in the generic update route): the generic order update endpoint rejects a `status` field for project orders — when the target order's `project_type` is non-null, PATCH `/api/orders/{id}` returns a business-rule error and persists no status change, while permitted non-status fields still apply. Satisfies requirement "Project order status is server-controlled". Verify with an integration test asserting a `quote_pending` project order stays `quote_pending` after a `status: "confirmed"` PATCH, and that a non-status PATCH on the same order still succeeds.
- [x] 1.2 Verify a paid deposit before in_execution (Design: verify a paid deposit before in_execution): the admin start route checks for a `ProjectPayment` of kind `deposit` with status `paid` on the order and rejects the `confirmed -> in_execution` transition with a business-rule error when absent. Satisfies requirement "In-execution project orders imply a recorded paid deposit". Verify with tests covering both the paid-deposit (transitions) and no-deposit (rejected) branches.
- [x] 1.3 Confirm the downstream gates are closed: add a test asserting that after task 1.1, an owner cannot reach `revision-quota/purchase` or send a `revision_request` order message by self-promoting status, because the order never reaches `confirmed` outside accept-quote.

## 2. Money and quota race fixes

- [x] 2.1 Make quote acceptance safe under concurrency (Design: status-guarded conditional writes for the three races): the order status transition in the accept-quote route becomes a write conditional on the order still being in its pre-accept status inside the existing transaction, so a zero-row result aborts the request. Two concurrent accepts on the same active quote then yield exactly one paid deposit `ProjectPayment` and one `confirmed` order. Verify with a concurrent-invocation test asserting deposit-payment count equals 1.
- [x] 2.2 Make revision-quota consumption atomic (Design: status-guarded conditional writes for the three races): replace the read-then-increment (currently using the global client outside the transaction) with a single guarded update conditioned on `used < total`, returning a business-rule error when zero rows match. With `used = total - 1`, two concurrent `revision_request` calls leave `used` no greater than `total`. Verify with a concurrent-invocation test asserting `used <= total`.
- [x] 2.3 Make image generation idempotent (Design: status-guarded conditional writes for the three races): the in-flight detection and the `queued` generation marker creation become atomic (idempotency key derived from conversation + task + intent, or an additive unique constraint) so a double-clicked or retried generate produces one queued generation and one paid image-provider call. Verify with a concurrent-invocation test asserting a single queued `generation_result` and a single provider charge.

## 3. Credit floor

- [x] 3.1 Apply the cost-aware credit check (Design: cost-aware credit check): `assertCreditsAvailable` accepts a cost and image generation passes `imageCreditCost(count)`, requiring `available >= cost` before any paid work; a short balance throws an insufficient-credits error with no provider call and no consumption. Satisfies requirement "Fixed-cost operations check full cost before dispatch". Verify with unit tests for the sufficient, insufficient, and multi-image-count cases, asserting no consumption on rejection.
- [x] 3.2 Preserve the text-chat balance semantics (Design: cost-aware credit check): text chat passes no cost (or zero) and retains the `available > 0` check, consuming the measured token cost afterward. Satisfies requirement "Post-hoc-cost operations retain a positive-balance check". Verify with tests asserting a positive-balance chat dispatches and an exhausted balance is rejected with quota-exceeded.

## 4. AI model plan gating

- [x] 4.1 Add a model-resolution helper (Design: plan-allowlist model validation with clamp-on-miss) that validates a requested model against the requesting plan's allowlist (sharing the source used by the conversation models endpoint) and clamps to `pickModel({ plan })` on a miss. Partially satisfies requirement "Client-requested model is validated against the plan allowlist". Verify with unit tests covering in-allowlist (honored), out-of-plan (clamped), unknown (clamped), and absent (clamped) inputs.
- [x] 4.2 Apply the resolver on both chat POST routes (Design: plan-allowlist model validation with clamp-on-miss) so the value forwarded to the provider is the resolved model, never the raw client value. Completes requirement "Client-requested model is validated against the plan allowlist". Verify with route tests asserting an out-of-plan `selectedModel` results in the plan default reaching the provider call on both the conversations messages route and the chat messages route.

## 5. Streaming correctness

- [x] 5.1 Finalize the streaming placeholder on all paths (Design: finalize streaming placeholder on all paths; flip isStreaming): an error occurring between placeholder creation and finalization marks the assistant row failed (or removes it) rather than leaving it in `streaming` status. Verify with a test that forces a mid-stream error and asserts no row remains in `streaming` status.
- [x] 5.2 Flip the SSE completion flag (Design: finalize streaming placeholder on all paths; flip isStreaming): the `message.completed` handler sets `isStreaming` to false for assistant AI messages so a finished reply renders settled. Verify with a client-state test asserting a `message.completed` event yields `isStreaming: false`.

## 6. Verification

- [x] 6.1 Run the full test suite and the type-check, confirming all new tests pass and no regression is introduced. Verify by recording the passing command output.
- [x] 6.2 Cross-check each fixed finding against `docs/18_code_review_conversation_port.md`, marking the seven in-scope findings resolved and confirming no out-of-scope finding was silently changed. Verify by content review of the findings doc against the diff.
