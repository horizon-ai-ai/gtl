## Why

Code review of PR #7 (`codex/admin-model-settings-db-only`, message branching) confirmed 20 correctness issues. Ten were agreed as pre-merge scope on 2026-06-12: nine fixes plus one author-confirmed-by-design cleanup. The worst ones lose conversation history permanently, bill users for generations they did not request or tried to stop, and feed wrong content into LLM prompts. Full findings: `.notes/code-review/260612_訊息分支審查/修復說明_訊息分支審查.md` (personal notes, not committed).

Implementation MUST happen on the PR branch `codex/admin-model-settings-db-only`, not on `main` or `feat/g3-ui-redesign`.

## What Changes

- **Active-path integrity** (review #1, #2, #5, #9):
  - Root-level messages (`parent_message_id` NULL) are no longer treated as siblings of each other, removing phantom ‹k/N› version arrows whose click collapses a conversation to one message.
  - The message-branching migration backfills `parent_message_id` chains (by `created_at` order) and `active_leaf_message_id` for existing conversations, so legacy history survives the first post-deploy message.
  - A single `appendMessage` helper (parent defaults to current active leaf; create + leaf bump inside one transaction) replaces hand-rolled create+bump at all conversation-message writers, including the orders route and chat route that currently write orphan messages invisible to branch-aware reads.
  - LLM context builders in the conversations messages route read the active path instead of flat `created_at` scans, so edited-away branches no longer pollute prompts.
- **Generation revision source** (review #4): the prior-version lookup for text generation only accepts `generation_result` messages; a user message can never be injected as 被修改的前版內容, so first generations use the creation prompt, not the revision prompt.
- **Credit-consumption guard** (review #6): editing a user message only dispatches a regeneration when the edited message belongs to the target generation's lineage (its instruction message or an ancestor on its branch path); unrelated edits go through the plain edit path with no charge.
- **Cancellation reliability** (review #7, #8):
  - Stopping while the assistant message is still a local placeholder records a pending cancel and issues the server cancel as soon as the server message id is known, instead of only aborting the client fetch.
  - Streaming flushes no longer clobber a concurrently written `cancelRequested` metadata flag (merge-safe update or separate flag storage), so a cancel issued mid-stream takes effect.
- **Post-response settlement** (review #10): the marketing-intelligence settle (message metadata update + SSE event) runs inside the serverless runtime's lifecycle extension (`after()` from `next/server`) instead of a fire-and-forget promise after the response returns.
- **Intent schema cleanup** (review #3, author-confirmed BY DESIGN): the refine→discuss-first flow stays; the dead `wantsGeneration` field is removed from the intent-resolver prompt/schema (the route no longer reads it), and the refine reply's generate confirmation quick action is covered by a regression check.

## Non-Goals

- Review findings #11–#16 (dangling leaf on dispatch failure beyond what `appendMessage` fixes, version anchoring of plain sends, website-builder routing fallback, delegation hints, SSE sibling metadata) — deferred to a follow-up.
- Performance findings #17–#22 (unbounded active-path load, streaming refetch loop, render-loop O(n²), sequential awaits) — post-merge work.
- Reuse/simplification cleanups #23–#24 — post-merge work.
- Restoring immediate regeneration for refine intents — author confirmed discuss-first-then-confirm is the intended design.

## Capabilities

### New Capabilities

- `conversation-active-path`: integrity of the branched message tree — sibling computation, legacy backfill, the append invariant (parent + active-leaf bump, transactional, used by every conversation-message writer), and branch-aware LLM context.
- `generation-revision-source`: which message may serve as the prior-version source for a regeneration prompt, and what first generations must receive.
- `generation-cancellation`: a user-issued stop takes effect at every phase of a generation — before the server message id is known and during streaming — and prevents further paid work.
- `post-response-settlement`: server work scheduled after an API response returns (marketing-intelligence persistence and events) completes reliably on serverless.

### Modified Capabilities

- `credit-consumption-policy`: add a requirement that regeneration dispatch from a message edit requires the edited message to belong to the target generation's lineage; unrelated edits must not consume credits.

## Impact

- Affected specs: `conversation-active-path` (new), `generation-revision-source` (new), `generation-cancellation` (new), `post-response-settlement` (new), `credit-consumption-policy` (modified)
- Affected code:
  - New: prisma/migrations (one new backfill migration directory under `prisma/migrations/`)
  - Modified: `src/lib/conversation/active-path.ts`, `src/app/api/conversations/[id]/messages/route.ts`, `src/app/api/orders/route.ts`, `src/app/api/chat/messages/route.ts`, `src/lib/website-builder/orchestrator.ts`, `src/lib/conversation/dispatch/shared.ts`, `src/lib/conversation/dispatch/text-generation.ts`, `src/lib/conversation/intent-resolver.ts`, `src/hooks/useConversations.ts`, `src/app/(app)/generate/page.tsx`
  - Removed: (none)
- Target branch: `codex/admin-model-settings-db-only` (PR #7). Commits follow repo conventions: conventional titles, short bullet bodies, step-scoped atomic commits, no Co-Authored-By trailer.
