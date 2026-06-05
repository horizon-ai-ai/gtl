# Code Review Findings — feat/conversation-port-from-backend

- **Date**: 2026-06-05
- **Scope**: `git diff origin/main...HEAD` on `feat/conversation-port-from-backend` (commits `c33e36e`, `b98b69f`; 84 files, +18,855 / −1,410)
- **Method**: `/code-review high` — 7 finder angles (line-by-line, removed-behavior, cross-file, reuse, simplification, efficiency, altitude) → 38 candidates → per-candidate adversarial verification (12 CONFIRMED / 5 PLAUSIBLE / 1 REFUTED on correctness; cleanup candidates unverified, outranked by the output cap)

## Merge-blocker triage

| Priority | Finding | Status |
|---|---|---|
| Blocker | #1 PATCH status bypass | resolved (fix-conversation-port-review-blockers) |
| Blocker | #2 Model plan-gate bypass (2 routes) | resolved (fix-conversation-port-review-blockers) |
| Blocker | #3 Credits floor bypass | resolved (fix-conversation-port-review-blockers) |
| Blocker | #4 accept-quote double deposit (race) | resolved (fix-conversation-port-review-blockers) |
| Blocker | #5 Generation double-charge (race) | resolved (fix-conversation-port-review-blockers) |
| Blocker | #6 Revision quota over-consumption (race) | resolved (fix-conversation-port-review-blockers) |
| Freebie (one-line) | #9 isStreaming inversion | resolved (fix-conversation-port-review-blockers) |
| Fast-follow | #7 Stuck streaming placeholder | resolved (fix-conversation-port-review-blockers) |
| Fast-follow / product question | #8 Puck positional corruption | open |
| Blocker IF legacy sites exist in prod | #10 Legacy section render degradation | open |

#4–#6 share one root cause: check-then-act outside the transaction. Fix pattern: status-guarded `updateMany` / unique constraint / in-tx re-check.

---

## Confirmed findings (ranked by severity)

### 1. Order status self-promotion bypasses quote + deposit flow — `src/app/api/orders/[id]/route.ts:232` — CONFIRMED

PATCH `/api/orders/{id}` accepts the widened status enum (`quoted`/`confirmed`/`in_execution`/`closed` in the zod schema, lines 19–34) and writes `body.status` directly with only an ownership check — no `assertProjectTransition` (exists at `src/lib/project-orders.ts:43` but is not imported here), no admin gate.

**Failure**: owner of an order in `quote_pending` sends `PATCH {"status":"confirmed"}` → order is confirmed with no quote and no deposit `ProjectPayment`, then unlocks `revision-quota/purchase` (`purchase/route.ts:20`) and `revision_request` messages (`messages/route.ts:41`), both of which gate solely on `order.status === 'confirmed'`.

**Fix direction**: restrict owner-PATCHable statuses to a small allowlist (or none); route all project-order transitions through `assertProjectTransition` + dedicated routes.

### 2. Client-supplied model bypasses plan gating — `src/app/api/conversations/[id]/messages/route.ts:1054` and `src/app/api/chat/messages/route.ts:218` — CONFIRMED

Both routes use `body.selectedModel`/`preferredModel`/`model` verbatim: `model = body.selectedModel || pickModel({plan})`, flowing into `flexionStream` (line 1168) / `flexionComplete` (line 1189). The `pickConversationModels` allowlist is only used by GET `/api/conversations/models` for UI display — never enforced on POST.

**Failure**: free-plan user POSTs `selectedModel:"claude-opus-4-7"` → premium model runs; the plan-tier gate exists only client-side.

**Fix direction**: validate the requested model against the plan-resolved allowlist server-side (single helper, both routes).

### 3. Credits check is not cost-aware — `src/lib/credits.ts:52` — CONFIRMED

`assertCreditsAvailable(userId)` takes no cost parameter and throws only when `available <= 0`. Image generation later deducts a flat 20,000 (`imageCreditCost`, `generation-dispatcher.ts:193–197`) via `consumeCredits` (`credits.ts:44–49`), an unclamped increment.

**Failure**: user with 1 credit passes the check, generation runs, balance → −19,999. Repeatable abuse vector.

**Fix direction**: `assertCreditsAvailable(userId, cost)` with `available >= cost`; clamp or reject in `consumeCredits`.

### 4. accept-quote race double-records deposit — `src/app/api/orders/[id]/accept-quote/route.ts:22–32` — CONFIRMED

Status read (plain `findFirst` + in-memory `assertProjectTransition`) and active-quote check run outside the transaction; the in-tx `order.update` is keyed only by id with no status guard (lines 81–83); `ProjectPayment` has only a non-unique `@@index([order_id, kind])` (`schema.prisma:541`).

**Failure**: double-click / two tabs → both requests pass `quoted→confirmed`, both create a `kind:'deposit'` ProjectPayment and upsert revision quota.

**Fix direction**: status-guarded `updateMany({where:{id, status:'quoted'}})` and bail when count=0, or unique constraint on `(order_id, kind='deposit')`.

### 5. Concurrent generations duplicate paid work — `src/lib/conversation/generation-dispatcher.ts:238` — CONFIRMED

`findInFlightGeneration` (lines 199–214) is an unlocked `findMany`; `dispatchImageGeneration` checks at 238 then creates the `queued` message at 257 with several awaits in between; `generationId` is a fresh `randomUUID()` per call — no idempotency.

**Failure**: rapid double-send/retry → both calls see no in-flight row, both call `generateBananaImages` (real image-API cost) and both `consumeCredits` 20,000.

**Fix direction**: idempotency key derived from (conversation, task, intent) or a unique partial index on in-flight generation messages.

### 6. Revision quota over-consumption race — `src/app/api/orders/[id]/messages/route.ts:48–51` + `src/lib/project-orders.ts:99` — CONFIRMED

`ensureRevisionAvailable` reads via the **global** prisma client (not `tx`) and is read-only; the in-tx `revisionQuota.update({data:{used:{increment:1}}})` has no `used < total` where-guard.

**Failure**: used=1/total=2, two concurrent revision_requests → used=3; free extra paid revision.

**Fix direction**: atomic `updateMany({where:{order_id, used:{lt: total}}, data:{used:{increment:1}}})`, fail when count=0.

### 7. Streaming placeholder row can be orphaned in 'streaming' status — `src/app/api/conversations/[id]/messages/route.ts:1148→1307` — CONFIRMED

Placeholder assistant row (status `streaming`) is created at 1148, finalized at 1307. The only try/catch in between (1167–1193) wraps just `flexionStream`, and its `flexionComplete` fallback can itself throw. Everything else (token/credit math, action detection, 1194–1306) is covered only by the route-level catch (1352) which does **no DB cleanup**; there is no `finally`. Client (`useConversations.ts:99`) renders `metadata.status === 'streaming'` as a spinner with no staleness timeout.

**Failure**: any throw in the gap leaves a permanent stuck-spinner message in the conversation.

**Fix direction**: `try/finally` (or catch) that marks the placeholder `failed`/deletes it; optionally a client-side staleness cutoff.

### 8. Puck save corrupts section metadata positionally — `src/lib/site-puck.tsx:113–122` — CONFIRMED

`puckDataToSiteSchema` maps `data.content` by index against the **original** `schema.sections[index]` (via `schemaRef`, pinned until save): `layoutVariant`/`variantFamily` always, and `type` for `FeatureListBlock`, are inherited from whatever section originally sat at that index. The default `<Puck>` editor (trade-site-puck-editor.tsx:109) allows reorder/delete.

**Failure**: user reorders or deletes blocks and saves → block N inherits variant/type metadata from the wrong section; silent corruption.

**Fix direction**: carry the original section id through Puck block props and join by id, not index.

### 9. isStreaming inverted on message.completed — `src/hooks/useConversations.ts:298–303` — CONFIRMED (found independently by 2 angles)

`streamMessageFromEvent` returns `isStreaming: true` exactly when `eventName === "message.completed"` for an assistant `ai` message — the terminal event is inverted. `conversation-interface.tsx` (991/1097/1200/1216) keeps the message as a typing indicator and suppresses content; only the debounced, fail-able `scheduleReload` (657–663) repairs it.

**Fix direction**: flip the boolean. One line.

### 10. Legacy persisted sites render degraded — `src/app/site-preview/[id]/route.ts:29` — CONFIRMED

Preview switched from React `SiteRenderer` to `renderWebsiteHtml`; its `renderSiteModule` (`orchestrator.ts:1935–1943`) cases only `hero/features/products/productDetails/socialProof/closingInfo` and dumps everything else into `renderGenericModule`. `origin/main`'s SiteSchema union actively persisted `story/specs/cta/faq/testimonials/gallery/inquiry` sections.

**Failure**: any pre-branch site renders its CTA/gallery/inquiry sections as generic blocks — silent regression for existing data.

**Open product question**: do legacy sites with those types exist in the production DB? If yes → blocker; if no → moot.

---

## Verified but cut by the 10-slot cap (lower severity)

- **Unvalidated `?status=` query param → 500** — `src/app/api/orders/route.ts:332` — CONFIRMED. `status: status as never` straight into Prisma; `handleError` (api.ts:69–75) only catches ApiError/ZodError, so `?status=foo` → PrismaClientValidationError → 500 instead of 400.
- **Unvalidated `activeDesignTaskId` write** — `src/app/api/conversations/[id]/route.ts:62–64` — CONFIRMED. No existence/conversation/ownership check; column is a bare `String? @db.Uuid` with no FK (`schema.prisma:268`). Foreign UUID is stored silently and later resolves to null. Low impact.
- **Mutating GET (lazy deliverable_snapshot write)** — `src/app/api/orders/[id]/route.ts:187–190` — PLAUSIBLE. Lockless `order.update` inside GET; rebuild is deterministic from current rows so concurrent writes converge (race real, effectively idempotent).
- **`canceled` vs `cancelled`, `completed` vs `closed` enum duplication** — `prisma/schema.prisma:446–460` — PLAUSIBLE. Footgun; all audited consumers currently handle both spellings (orders/page.tsx:34,41; orders/[id]/page.tsx:995; messages/route.ts:38; orders/route.ts:157–158).
- **Customer-cancel refund always 0** — `src/app/api/orders/[id]/cancel/route.ts:23` — PLAUSIBLE. `refundRateBeforeExecution: 0` in `PROJECT_ORDER_POLICY` makes the `refundAmount > 0` branch dead; reads as deliberate policy (refunds are admin-driven via admin cancel route's `refund_amount`). Confirm intent with product.
- **flexionStream throws when unconfigured** — `src/lib/flexion.ts:221` — PLAUSIBLE. Dev mock-stream fallback removed, but `ANTHROPIC_API_KEY` direct path (216–219) still provides fallback; only 500s when BOTH keys are unset.
- **Zero-item project order** — `src/app/api/orders/route.ts:412,415` — REFUTED. The `!isProjectOrder` guards are the designed quote-later flow (admin quotes later; alignment-snapshot machinery is built for itemless orders).

## Cleanup / efficiency / altitude candidates (finder output, NOT adversarially verified)

Reuse:
- Owned-order lookup (`findFirst({id, user_id, deleted_at:null})` + RESOURCE_NOT_FOUND) copy-pasted across ~7 sites in 6 order routes — extract `getOwnedOrder()` into `src/lib/project-orders.ts` (conversations already have `getOwnedConversation`).
- Wallet mutations hand-rolled in `wallet/topup/route.ts:18` and `orders/[id]/revision-quota/purchase/route.ts:26–48` — extract `creditPoints`/`debitPoints` into a `src/lib/wallet.ts` so balance and `PointTransaction` ledger can't diverge.
- Three parallel auth-guard spellings: `auth.ts requireUser`, `conversation/api.ts requireSessionUser`, and inline `await auth()` in order/wallet routes — consolidate to one that throws `ApiError`.
- Duplicate type definitions: `src/types/conversation.ts` (client) vs `src/lib/conversation/types.ts` (server) for step decisions / marketing intelligence — derive one from the other.
- Post-transition bookkeeping (status + timestamp + system message + event + history row) re-assembled per route — extract `applyOrderTransition()`.

Simplification:
- `quickActions` (messages/route.ts:1235–1268) and `stepDecision.nextActions` (1220–1234) independently recompute the same priority cascade — compute once.
- `bodyQuickReply(body)` parsed 3× in the POST handler (985, 1032, 1061).
- Dead ternary branch in `normalizeMessage` (`useConversations.ts:66–75`) — first branch subsumed by second.
- `handleWebsiteBuilderTurn` (orchestrator.ts:2502, ~340 lines, 8 turn types) repeats the memory/message/persist trio per branch — extract per-branch handlers, persist once.

Efficiency:
- SSE handler fires a debounced full-conversation GET on every `message.delta` even though deltas are already merged in-place (`useConversations.ts:687`) — reload only on terminal/structural events.
- GET `/api/orders` returns full rows incl. `deliverable_snapshot` JSON for up to 100 orders (route.ts:328) — add a select.
- Double 50-row history fetch per chat turn (messages/route.ts:980 and 1044) — reuse + append in memory.
- Sequential awaits on independent reads in design-task generate route (144–160) — Promise.all.
- `resolveProjectOrderRevision` includes `quotes:true` but never reads them (orders/route.ts:135).
- Messages GET orders ASC with take:100 → always returns the OLDEST window, no cursor (messages/route.ts:944).

Altitude:
- `src/lib/conversation/intent-keywords.ts` is imported nowhere — dead zh-TW keyword registry superseded by the LLM intent-resolver; delete.
- `src/app/api/chat/messages/route.ts` was expanded (+256 lines) but no client calls it (useConversations hits only `/api/conversations/*`) — dead-but-maintained duplicate of the conversations pipeline; delete or redirect. (Also carries blocker #2.)
- Website intent kinds special-cased via `siteIntent === "..."` at ~15 sites in orchestrator.ts — fold into a per-intent config registry.
- `intent-router.ts` gates the website-builder flow on hardcoded zh-TW substring lists — phrasing outside the list never enters the builder; fold into the LLM intent classifier.
