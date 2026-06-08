# Design

## Context

Code review of the admin-model-settings feature surfaced seven defects (full record in `.notes/code-review/260608_程式碼審查_AI模型設定.md`). The root theme is fragmented provider selection: `flexion` has an env/Anthropic branch and a `providerConfig` branch, marketing has its own `openRouterChat`, and several conversation-path LLM calls never receive the DB-resolved provider. This change makes the resolved provider authoritative on the conversation path and removes mis-placed gating and per-request DDL.

## Goals / Non-Goals

**Goals:** the resolved `providerConfig` + `creditMultiplier` are honored by every conversation-path provider call; the `AI_MODEL_NOT_CONFIGURED` gate fires only when a text model is actually used; schema setup leaves the hot path; malformed ciphertext fails cleanly; marketing availability reflects real configuration.

**Non-Goals:** #8 plan gating (removed by design), #9 crypto de-duplication, #10 `openRouterChat` refactor; no change to the encryption scheme, DB schema, or admin UI.

## Decisions

1. **Provider precedence (#1).** In `flexion` `flexionStream`/`flexionComplete`, check `req.providerConfig` first; take the Anthropic/env path only when no `providerConfig` is supplied. Env-only callers are unaffected (no `providerConfig` → same behavior as today).
2. **Thread the resolved model through generation (#2).** `createGenerationResult` in the conversation messages route gains `providerConfig` and `creditMultiplier` parameters; the caller passes the already-resolved values; the internal `flexionComplete` and `rawToCredits` calls use them.
3. **Gate placement (#3).** Move `resolveRequestedModelConfig` out of the shared prefix in the design-task generate route so it runs only in the text-delivery branch. The image branch performs no resolution. The web branch passes `resolvedModel.providerConfig` into `generateSiteSchema` (so the site generator uses DB config) while keeping that function's existing `try/catch` → `FALLBACK_SCHEMA`, so a missing model degrades instead of returning 422.
4. **#5 scope.** All conversation request-path siblings — intent classification (`intent-resolver`) and `generateSiteSchema` (`site-builder`) — and the standalone LLM endpoints `support/ask`, `admin/copilot`, and `website-builder/orchestrator` are migrated to resolve their provider from DB settings (`resolveRequestedModelConfig`/`resolvePurposeModelConfig`) instead of env-only `pickModel`. (Originally the three standalone endpoints were going to be deferred to a follow-up; they were migrated here for full coverage so no conversation/LLM path silently stays on env-only config.)
5. **DDL memoization (#4).** `ensureAiModelSettingsTable` guards with a module-level cached `Promise` so the `CREATE TABLE`/`ALTER`/`CREATE INDEX` block runs at most once per process. The Prisma migration remains the source of truth.
6. **Decrypt hardening (#7).** Wrap the `JSON.parse` + decipher in `decryptModelApiKey` in `try/catch`; on failure throw `ApiError("AI_MODEL_NOT_CONFIGURED", …)` instead of a raw `SyntaxError`.
7. **Marketing availability (#6).** Gate the router classification call on a resolvable search model: `maybeResearch` SHALL return early (no LLM call) when no usable search model is configured.

## Risks

- **Provider precedence** touches every `flexion` caller. Mitigation: env-only callers pass no `providerConfig`, so their path is byte-for-byte unchanged; only callers that already pass `providerConfig` change behavior (which is the fix).
- **`generateSiteSchema` signature change** has one caller (the generate route web branch); update it in the same change.

## Verification approach

- `flexion`: with `ANTHROPIC_API_KEY` set AND a `providerConfig` supplied, the request hits the `providerConfig` base URL, not Anthropic.
- generate route: an image task with no conversation model returns 200 (not 422); a text-delivery task with no model returns 422.
- `createGenerationResult`: the forced-generate path forwards `providerConfig` and charges with the resolved `creditMultiplier`.
- `ai-model-settings`: the DDL block executes once across multiple resolutions (spy/count).
- `decryptModelApiKey`: malformed ciphertext throws `ApiError` with code `AI_MODEL_NOT_CONFIGURED`.
- marketing: with no search model configured, no router classification call is issued.
