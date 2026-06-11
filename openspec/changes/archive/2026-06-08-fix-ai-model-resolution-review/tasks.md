# Tasks

> Spec mapping: tasks 1–7 implement **Resolved provider config is authoritative for the provider call** and the refined **Conversation model is resolved from admin-managed database settings** (text-only gate).

## 1. Honor providerConfig over ambient env (#1)

- [x] 1.1 In `src/lib/flexion.ts`, make `flexionStream` and `flexionComplete` take the Anthropic path only when `req.providerConfig` is absent — i.e. check `req.providerConfig` before the `if (ANTHROPIC_API_KEY)` short-circuit, so a supplied provider config always wins.
- [x] 1.2 Add a unit test: with `ANTHROPIC_API_KEY` set in env AND a `providerConfig` supplied, the outgoing request targets `providerConfig.baseUrl`/key (mock `fetch`), not `api.anthropic.com`. Confirm env-only callers (no `providerConfig`) still use the Anthropic/env path.

## 2. First-version generation uses resolved provider + multiplier (#2)

- [x] 2.1 In `src/app/api/conversations/[id]/messages/route.ts`, give `createGenerationResult` `providerConfig` and `creditMultiplier` parameters; pass `providerConfig` into its `flexionComplete` call and the multiplier into `rawToCredits`.
- [x] 2.2 At the `forceGenerate` call site, pass `resolvedModel.providerConfig` and `resolvedModel.creditMultiplier` into `createGenerationResult`.
- [x] 2.3 Update/add a test asserting the forced-generate path forwards `providerConfig` to `flexionComplete` and charges credits using the resolved multiplier.

## 3. Gate the 422 to text-delivery only (#3)

- [x] 3.1 In `src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts`, move `resolveRequestedModelConfig` out of the shared prefix so it runs only in the text-delivery branch; the image branch performs no resolution.
- [x] 3.2 In the web branch, pass `resolvedModel.providerConfig` into `generateSiteSchema` (depends on task 5.3) while keeping that function's `try/catch` → `FALLBACK_SCHEMA`, so a missing model degrades rather than 422s.
- [x] 3.3 Update the route test: an image-domain task with no active conversation setting returns 200 (dispatches image) — not 422; a text-delivery task with no setting returns 422 `AI_MODEL_NOT_CONFIGURED`.

## 4. Move schema setup off the hot path (#4)

- [x] 4.1 In `src/lib/ai-model-settings.ts`, guard `ensureAiModelSettingsTable` with a module-level cached `Promise` so the `CREATE TABLE`/`ALTER`/`CREATE INDEX` block runs at most once per process; keep the Prisma migration as the source of truth.
- [x] 4.2 Add a test (or extend the resolver test) asserting the DDL executor runs once across multiple `resolveRequestedModelConfig` calls (spy on `$executeRawUnsafe`).

## 5. Resolve sibling conversation-path LLM calls from DB (#5)

- [x] 5.1 In `src/lib/conversation/intent-resolver.ts`, add an optional `providerConfig` to `inferConversationIntent` and thread it into its `flexionComplete` call.
- [x] 5.2 In the messages route, pass `resolvedModel.providerConfig` to `inferConversationIntent` (replacing the env-only `pickModel`).
- [x] 5.3 In `src/lib/site-builder.ts`, add an optional `providerConfig` to `generateSiteSchema` and pass it into the `flexionStream` call.
- [x] 5.4 Migrate the standalone LLM endpoints `src/app/api/support/ask/route.ts`, `src/app/api/admin/copilot/route.ts`, and `src/lib/website-builder/orchestrator.ts` to resolve their provider from DB settings instead of env-only `pickModel` (done in this change for full coverage, rather than deferred).

## 6. Marketing availability reflects configuration (#6)

- [x] 6.1 In `src/lib/conversation/marketing-intelligence.ts`, gate the router classification on a resolvable search model: `maybeResearch` returns early (no router LLM call) when no usable search model is configured.
- [x] 6.2 Add a test: with no `marketing_search`/`marketing_deep` setting, `maybeResearch` issues no router classification call and returns null.

## 7. Clean ciphertext decode failure (#7)

- [x] 7.1 In `src/lib/ai-model-settings.ts`, wrap the `JSON.parse` + decipher in `decryptModelApiKey` in `try/catch`; on failure throw `ApiError("AI_MODEL_NOT_CONFIGURED", …)` instead of a raw `SyntaxError`.
- [x] 7.2 Add a test: a malformed `api_key_ciphertext` causes resolution to reject with `ApiError` code `AI_MODEL_NOT_CONFIGURED`, not an uncaught `SyntaxError`.

## 8. Verification

- [x] 8.1 `npm test` passes (0 failed), including the new/updated cases above.
- [x] 8.2 `npm run typecheck` and `npm run lint` clean for the changed files (the only remaining typecheck errors are in `orders/*`, which are already fixed on `main` and will clear when this branch syncs with `main` — unrelated to this change).
- [x] 8.3 Confirm **Resolved provider config is authoritative for the provider call** holds end-to-end: providerConfig wins over env (1.x), generation uses it + multiplier (2.x), intent/site-schema resolve from DB (5.x).
- [x] 8.4 Confirm the refined **Conversation model is resolved from admin-managed database settings** holds: 422 only on text-delivery, image/web not blocked (3.x).
