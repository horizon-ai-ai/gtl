## Why

The code review of the `codex/admin-model-settings-db-only` branch (full record in `.notes/code-review/260608_程式碼審查_AI模型設定.md`) found seven correctness and hardening defects that undermine the DB-driven model feature: the resolved per-request provider is silently bypassed when an ambient Anthropic key is set, the first-version generation path ignores the resolved provider and credit multiplier, image/web tasks are wrongly blocked, schema DDL runs on every request, several LLM call sites still read env config, marketing search burns a model call when nothing is configured, and a malformed ciphertext crashes opaquely. Findings #1, #2, #4, #5 each defeat the feature's core premise.

## What Changes

- **Provider selection honors the resolved `providerConfig` (#1).** `flexion` SHALL take the Anthropic env path only when the request supplies no `providerConfig`; a request-supplied provider always wins.
- **First-version generation uses the resolved provider + multiplier (#2).** The design-task generation path in the conversation messages route SHALL pass the resolved `providerConfig` to the provider call and the resolved `creditMultiplier` to credit accounting, matching the streamed-chat path in the same route.
- **Model resolution is gated to text-delivery only (#3).** The `AI_MODEL_NOT_CONFIGURED` check SHALL apply only where a text model is actually used; image dispatch (Gemini/Banana) SHALL NOT require a conversation model, and the web/site path SHALL either receive the resolved `providerConfig` or be exempt from the hard gate.
- **Schema setup leaves the request hot path (#4).** The runtime `CREATE TABLE`/`ALTER`/`CREATE INDEX` block SHALL run at most once per process (memoized), not on every resolution; the Prisma migration remains the source of truth.
- **Sibling LLM call sites resolve from DB config (#5).** Conversation intent classification and the site-schema generator SHALL use a resolved `providerConfig` rather than env-only `pickModel`; the standalone LLM endpoints (`support/ask`, `admin/copilot`, `website-builder/orchestrator`) SHALL likewise be migrated to DB-resolved provider config.
- **Marketing availability reflects real configuration (#6).** Marketing research SHALL NOT issue a router classification call unless a usable search model is configured.
- **Ciphertext decode fails cleanly (#7).** `decryptModelApiKey` SHALL surface a configuration error (not a raw `SyntaxError`) on malformed `api_key_ciphertext`.

## Non-Goals

- **#8 plan-based model gating** — intentionally removed per the `ai-model-resolution` spec; not reintroduced here.
- **#9 crypto de-duplication** (`ai-model-settings` vs `analytics/crypto`) — cleanup, deferred.
- **#10 `openRouterChat` refactor** to reuse `flexion` headers and the sequential→parallel purpose resolves — cleanup/efficiency, deferred.
- **Standalone LLM endpoints remain env-based** — `support/ask`, `admin/copilot`, and `website-builder/orchestrator` still resolve their model via env-only `pickModel` and are NOT migrated to DB-resolved `providerConfig` in this change; tracked as a follow-up (in-code comments mark each site).
- No change to the encryption scheme, the admin UI, or the DB schema itself.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-model-resolution`: refine where the `AI_MODEL_NOT_CONFIGURED` gate applies (text-delivery only, not image/web dispatch); require that the resolved provider config and credit multiplier are honored by every provider call regardless of ambient env keys; require that conversation-path LLM calls (chat, first-version generation, intent classification, site-schema) resolve their provider from the DB settings.

## Impact

- Affected specs: `ai-model-resolution`
- Affected code:
  - Modified:
    - src/lib/flexion.ts
    - src/lib/ai-model-settings.ts
    - src/lib/conversation/marketing-intelligence.ts
    - src/lib/conversation/intent-resolver.ts
    - src/lib/site-builder.ts
    - src/app/api/conversations/[id]/messages/route.ts
    - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
    - src/app/api/support/ask/route.ts
    - src/app/api/admin/copilot/route.ts
    - src/lib/website-builder/orchestrator.ts
  - New: (none)
  - Removed: (none)
