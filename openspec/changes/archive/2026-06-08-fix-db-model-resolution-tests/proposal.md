## Why

The `admin-model-settings-db-only` branch replaced env/plan-allowlist model selection with database-driven model resolution (`AiModelSetting` + `resolveRequestedModelConfig`). The implementation shipped without reconciling the artifacts that encode the old contract: the `ai-model-plan-gating` spec still mandates clamp-to-plan-default, and four Jest suites still assert that behavior (and mock `prisma` without the new raw-query methods), so they fail. The branch cannot merge with red CI and currently has no test proving the new resolution path works.

## What Changes

- **BREAKING** Model resolution no longer clamps an out-of-plan/unknown model to a plan default. Conversation and design-task endpoints resolve the model from active `AiModelSetting` rows; when none is configured the request fails with `AI_MODEL_NOT_CONFIGURED` (HTTP 422) instead of silently substituting a default.
- Rewrite the `ai-model-plan-gating` requirement to describe DB-driven resolution: selection by setting id / `model_id`, fallback to the purpose default, and the hard-error-when-unconfigured contract.
- Rewrite `src/lib/conversation/resolve-requested-model.test.ts` to cover `resolveRequestedModelConfig` (DB resolver) with a mocked `prisma`: default pick, explicit-id pick, and the `AI_MODEL_NOT_CONFIGURED` throw.
- Update the three route suites (`chat/messages`, `conversations/[id]/messages`, `conversations/[id]/design-tasks/[taskId]/generate`) to mock `@/lib/ai-model-settings` so resolution returns a deterministic model, and replace the obsolete clamp/plan-gating assertions with DB-resolution assertions.
- Remove the now-dead `resolveRequestedModel` and `pickConversationModels` exports from `src/lib/conversation/api.ts` (their only caller was the obsolete test; routes use `resolveRequestedModelForProvider` and the models endpoint imports `pickConversationModels` from `ai-model-settings`).

## Non-Goals

- No change to the DB-driven resolution implementation itself (`ai-model-settings.ts`, `flexion.ts` `providerConfig`, the admin UI). This change only reconciles spec + tests + dead code with the already-implemented behavior.
- Not addressing the design-task image-generation path coupling to a conversation-model row (an image/banana dispatch currently still calls `resolveRequestedModelConfig` and will 422 when no conversation model exists). Flagged for a separate change.
- Not touching the per-request `ensureAiModelSettingsTable()` DDL-on-hot-path concern; tracked separately.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-model-plan-gating`: replace the plan-allowlist clamp requirement with DB-driven model resolution and the `AI_MODEL_NOT_CONFIGURED` hard-error contract.

## Impact

- Affected specs: `ai-model-plan-gating`
- Affected code:
  - Modified:
    - src/lib/conversation/api.ts
    - src/lib/conversation/resolve-requested-model.test.ts
    - src/app/api/chat/messages/route.test.ts
    - src/app/api/conversations/[id]/messages/route.test.ts
    - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - New: (none)
  - Removed: (none)
