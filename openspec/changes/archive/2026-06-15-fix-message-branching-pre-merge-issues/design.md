## Context

PR #7 introduces message branching: `Message.parent_message_id`, `Conversation.active_leaf_message_id`, an active-path loader (`loadActivePathMessages` in `src/lib/conversation/active-path.ts`), branch-aware GET routes, and sibling-pager UI. A multi-agent review confirmed 20 correctness issues; the 10 in pre-merge scope are fixed by this change. The shared root cause for half of them: branch maintenance (parent assignment + leaf bump) was hand-rolled at each writer instead of being owned by one primitive, and the migration left legacy rows flat with no backfill.

All work lands on the PR branch `codex/admin-model-settings-db-only`. The DB currently holds only test data, but the user chose backfill over data-wipe (cheap SQL, and the guards also protect against future orphan writers).

## Goals / Non-Goals

**Goals:**

- No conversation history is lost or hidden by branch-aware reads — for legacy conversations, for new messages from any writer route, and after branch switches.
- No credits are consumed for generations the user did not explicitly request or tried to stop.
- Regeneration prompts never receive a user message as the prior-version source.
- Post-response marketing-intelligence settlement survives serverless freeze.
- Remove the dead `wantsGeneration` field from the intent contract (refine discuss-first flow is BY DESIGN, author-confirmed 2026-06-12).

**Non-Goals:**

- Review findings #11–#16 (version anchoring of plain sends, website-builder routing fallback, delegation hints, SSE sibling metadata) — follow-up change.
- Performance findings #17–#22 and cleanup findings #23–#24 — post-merge.
- Changing the refine→discuss-first UX itself.

## Decisions

### Decision: single appendMessage primitive owns parent assignment and leaf bump

All conversation-message writers call one helper, `appendMessage`, exported from `src/lib/conversation/active-path.ts`. It (a) defaults `parent_message_id` to the conversation's current `active_leaf_message_id` when the caller does not pass an explicit parent, (b) creates the message and updates `active_leaf_message_id` inside one `prisma.$transaction`, re-reading the leaf inside the transaction so concurrent sends serialize. Callers migrated in this change: the conversations messages route, the design-task generate route's message writes via dispatch, `createGenerationPlaceholder` in `src/lib/conversation/dispatch/shared.ts`, the website-builder orchestrator's message writes, `src/app/api/orders/route.ts` (order_form tool message), and `src/app/api/chat/messages/route.ts` (user + assistant messages). Alternative considered: patching each writer in place — rejected because it preserves the 13-call-site drift that caused review #5 and #12 in the first place.

### Decision: migration backfills parent chains instead of read-time repair

A new Prisma migration backfills legacy data: for every conversation, `parent_message_id` of each message with a NULL parent (except the conversation's first message) is set to the immediately preceding message by `created_at` (window function, single UPDATE), and `active_leaf_message_id` is set to the latest message of each conversation that has messages. Alternative considered: wiping test data — rejected by the user (backfill SQL is cheap and keeps test conversations usable).

### Decision: root messages are never siblings of each other

`siblingsFor` in `src/lib/conversation/active-path.ts` returns a singleton group (`count 1, index 0, ids [self]`) for any message whose `parent_message_id` is NULL. Version arrows only ever appear for true siblings (shared non-NULL parent). This is defense-in-depth on top of the backfill: a future writer that slips past `appendMessage` produces at worst an invisible-arrow root, never a clickable control that collapses the conversation.

### Decision: LLM context builders read the active path

The two flat history reads in the conversations messages route (`preTaskHistory` and the main `history` fed to `buildRecentTurns`/intent inference) are replaced by one active-path load per request (helper `loadActivePathHistory(conversationId, limit)` wrapping `loadActivePathMessages` and taking the last `limit` chain messages). The GET handler in the same file already uses the active path; this aligns the write path.

### Decision: revision source must be a generation result

The prior-version query in `sourceTextFromPriorVersion` (`src/lib/conversation/dispatch/text-generation.ts`) adds `message_type: generation_result` to its `where` clause for both the explicit-source and latest-fallback branches. When no generation result exists, the function returns null and the dispatcher uses the creation prompt (no 被修改的前版內容 block, no 修正版 instruction).

### Decision: edit-triggered regeneration requires lineage membership

In `handleEditedMessage` (`src/app/(app)/generate/page.tsx`), `shouldRegenerate` is true only when the edited message is the target generation's instruction message (its recorded source message id) or an ancestor on the generation's branch path. Conservative variant chosen (exact source-message match plus ancestor walk over already-loaded client messages): a false negative costs the user one click on the existing regenerate affordance; a false positive costs 20,000 credits.

### Decision: pending-cancel handshake for early stop

`stopActiveMessage` in `src/hooks/useConversations.ts` no longer silently skips the server cancel for `local-` placeholder ids. It records a pending-cancel marker for the conversation; when the server-assigned assistant message id arrives (POST response or SSE `message.created`), the hook immediately issues the cancel API call. The client-side abort and optimistic-bubble removal behavior is unchanged.

### Decision: cancel flag stored merge-safe against streaming flushes

`updateGenerationMessage` (`src/lib/conversation/dispatch/shared.ts`) must not erase a concurrently written `cancelRequested` flag. Chosen approach: every metadata write re-reads the current row's metadata inside the same update path and preserves `cancelRequested` (and any cancellation fields) over the in-memory copy. The legacy streaming path in the conversations messages route gets the same treatment plus the missing cancel check in its streaming loop. Alternative considered: separate DB column for cancellation — cleaner long-term but a schema change beyond pre-merge scope.

### Decision: marketing-intelligence settle runs under the runtime lifecycle extension (waitUntil)

The fire-and-forget `void intelligencePromise.then(...)` in the conversations messages route is wrapped in the serverless runtime's lifecycle-extension mechanism, so the metadata update and `marketing.intelligence.ready` SSE publish are guaranteed on Vercel. Originally specified as `after()` from `next/server`, but implementation found the repo is on Next 14.2.35, which ships neither `after()` nor `unstable_after`. Chosen equivalent: `waitUntil` from `@vercel/functions` (new dependency), which hooks Vercel's request context directly and degrades to a plain detached continuation in local dev. Migrating to `after()` is a one-line change when the repo moves to Next 15.

### Decision: wantsGeneration removed from the intent contract

The intent-resolver prompt and parsed schema (`src/lib/conversation/intent-resolver.ts`) drop the `wantsGeneration` field entirely — the route no longer reads it, and a dead field misleads future readers. Refine classifications stay; the refine reply must keep attaching its generate confirmation quick action (covered by a regression check, not behavior change).

## Implementation Contract

**Behavior (observable when complete):**

1. Opening a pre-migration conversation shows the full history in order, no version arrows on any message, and sending a new message keeps all prior history visible.
2. A user message bubble shows ‹k/N› arrows only when it has true siblings (same non-NULL parent); clicking an arrow switches branches without ever shrinking the conversation below the switched-to branch's path.
3. Submitting an order with a `conversation_id`, or posting via the chat messages route, produces a message that appears in subsequent conversation GETs.
4. After editing a user message, the next assistant turn's prompt context contains only active-path messages (verifiable by inspecting the history passed to intent inference / `buildRecentTurns` in a test).
5. First text generation for a task produces the creation prompt — no 被修改的前版內容 block (unit-testable on the prompt builder given a task with no generation results).
6. Editing a user message unrelated to any generation sends a plain edit (no `proceed_generate` quick reply, no dispatch, no credit consumption). Editing the instruction message of a generation still regenerates.
7. Pressing stop before the server message id is known results in a server-side cancel as soon as the id arrives; pressing stop mid-stream results in the generation ending as cancelled even when streaming flushes race the cancel write. Cancelled generations do not bill further work after the cancel takes effect.
8. With marketing intelligence enabled, the assistant message's metadata eventually carries the intelligence pack and the SSE event fires, even on serverless (settle scheduled via `waitUntil` from `@vercel/functions`).
9. `wantsGeneration` appears nowhere in `src/lib/conversation/intent-resolver.ts` (prompt text, type, or parser) and nothing in `src/` reads it; refine replies still carry their generate confirmation quick action.

**Interfaces / data shapes:**

- `appendMessage(conversationId, data, options?)` in `src/lib/conversation/active-path.ts`: accepts the message create payload minus parent; optional explicit `parentMessageId` for sibling-creating flows (edits, regenerations); returns the created message; performs leaf bump transactionally. Direct `prisma.message.create` for conversation messages is no longer present outside this helper (grep-verifiable).
- New migration directory under `prisma/migrations/` containing the backfill UPDATEs; idempotent (re-running on backfilled data changes nothing).
- `loadActivePathHistory(conversationId, limit)` in `src/lib/conversation/active-path.ts` returning active-path messages capped to the last `limit`.

**Failure modes:**

- `appendMessage` transaction failure leaves both message and leaf unchanged (no half-applied state).
- Revision-source lookup finding no generation result is not an error: dispatcher falls back to the creation prompt.
- Pending cancel that never learns a server id (request failed) is dropped with the existing abort cleanup — no orphaned cancel calls.

**Acceptance criteria:**

- `npm test` passes; new/updated unit tests cover: sibling computation for NULL-parent roots, revision-source filter (user message rejected, generation result accepted, none → null), edit-lineage guard decision, cancel-flag preservation across a metadata merge, appendMessage parent defaulting.
- Type check (`npx tsc --noEmit`) and lint pass.
- Manual or scripted verification of behaviors 1–3 against the local Docker DB (`gtl-pg` on :5544) seeded with a flat legacy conversation.

**Scope boundaries:**

- In scope: the ten review items listed in the proposal, the `appendMessage` primitive, the backfill migration, and regression tests for each fix.
- Out of scope: review #11–#24, schema changes beyond the backfill migration, SSE sibling metadata, any UX change to the refine discuss-first flow.

## Risks / Trade-offs

- [Backfill assumes `created_at` order matches conversational order] → True for all existing writers (single inserts per turn); the UPDATE is restricted to NULL-parent rows so already-branched data is untouched.
- [appendMessage adoption touches many call sites on a moving PR branch] → Step-scoped atomic commits; each call-site migration compiles and tests independently.
- [Transactional leaf bump adds a write lock per message] → Negligible: one short transaction per message create; no long-running work inside the transaction.
- [Re-read-and-merge metadata writes add one read per streaming flush] → Bounded by the existing ≥320ms flush throttle; acceptable until the deferred performance pass (#19) reworks streaming persistence.
- [after() requires Next.js version support] → CONFIRMED during implementation: Next 14.2.35 does not ship `after()`. Resolved by using `waitUntil` from `@vercel/functions` instead (see updated decision above); type check verifies the import resolves.

## Migration Plan

1. Land code + migration on the PR branch; CI runs tests.
2. On deploy, `prisma migrate deploy` applies the backfill before the new code serves traffic (standard Vercel build order).
3. Rollback: the migration only fills previously NULL columns; rolling back code leaves the data valid for the old flat reads. No destructive step.

## Open Questions

(none — scope and design decisions confirmed with the user on 2026-06-12; refine flow confirmed by the author)
