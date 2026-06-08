# Tasks

> Spec mapping: tasks 1–5 implement the requirement **Conversation model is resolved from admin-managed database settings** and complete the removal of **Client-requested model is validated against the plan allowlist** (the deleted `resolveRequestedModel` clamp).

## 1. Remove dead env/plan-allowlist resolution code

- [x] 1.1 In `src/lib/conversation/api.ts`, delete the exported `resolveRequestedModel` function (the synchronous plan-allowlist clamp) and the exported `pickConversationModels` function. Their only caller was `resolve-requested-model.test.ts`; routes use `resolveRequestedModelForProvider` and the models endpoint imports `pickConversationModels` from `@/lib/ai-model-settings`.
- [x] 1.2 In the same file, remove the now-unused `pickConversationModelsFromEnv` import from `@/lib/ai-model-settings`. Keep the `resolveRequestedModelConfig` import and the `resolveRequestedModelForProvider` wrapper. Confirm `ApiError` is still imported only if still referenced after the deletion (the throw moved into `ai-model-settings.ts`).
- [x] 1.3 Run `npm run typecheck` and `npm run lint` and confirm no unused-symbol or unresolved-reference errors remain in `src/lib/conversation/api.ts`.

## 2. Replace the obsolete resolver unit test

- [x] 2.1 Rewrite `src/lib/conversation/resolve-requested-model.test.ts` to target `resolveRequestedModelConfig` from `@/lib/ai-model-settings` instead of the deleted `resolveRequestedModel`. Mock `@/lib/db` so `prisma.$executeRawUnsafe` resolves (no-op for `ensureAiModelSettingsTable`) and `prisma.$queryRaw` returns a controllable array of `AiModelSetting` rows.
- [x] 2.2 Assert: (a) with rows present and no override, the row marked `is_default` is selected (its `model_id` returned); (b) an override equal to a row `id` selects that row; (c) an override equal to a row `model_id` selects that row; (d) an unmatched override falls back to the default row.
- [x] 2.3 Assert that when `prisma.$queryRaw` returns an empty array, `resolveRequestedModelConfig` rejects with an `ApiError` whose code is `AI_MODEL_NOT_CONFIGURED`.
- [x] 2.4 Run `npx jest src/lib/conversation/resolve-requested-model.test.ts` and confirm all cases pass.

## 3. Fix `chat/messages` route test

- [x] 3.1 In `src/app/api/chat/messages/route.test.ts`, add `jest.mock("@/lib/ai-model-settings", ...)` exporting a `resolveRequestedModelConfig` mock that returns `{ model, providerConfig: { baseUrl, apiKey, provider }, creditMultiplier }`, deriving `model` from the requested override (echo the override when provided, else a fixed `"db-default"`).
- [x] 3.2 Replace the `model plan gating` describe block: remove the `planDefaultModel`/`pickModel` references. Assert that `flexionStreamMock.mock.calls[0][0].model` equals the value the mocked resolver returned for the given override, and that `flexionStreamMock.mock.calls[0][0].providerConfig` is forwarded.
- [x] 3.3 Add one case where the `resolveRequestedModelConfig` mock rejects with `new ApiError("AI_MODEL_NOT_CONFIGURED", ...)`; assert the response status is 422 and `flexionStreamMock` is not called (the route wraps resolution in `.catch` and returns `handleError`).
- [x] 3.4 Keep the `text-chat balance semantics` cases; they only need resolution to succeed via the new mock. Run `npx jest src/app/api/chat/messages/route.test.ts` and confirm green.

## 4. Fix `conversations/[id]/messages` route test

- [x] 4.1 In `src/app/api/conversations/[id]/messages/route.test.ts`, add the same `jest.mock("@/lib/ai-model-settings", ...)` resolver mock as task 3.1.
- [x] 4.2 Replace the `model plan gating` describe block: drop `planDefaultModel`/`pickModel`; assert the resolved `model` and `providerConfig` reach `flexionStreamMock`. Keep the two `streaming placeholder finalization` cases (they need resolution to succeed).
- [x] 4.3 Run `npx jest "src/app/api/conversations/[id]/messages/route.test.ts"` and confirm green, including the existing 500-on-stream-failure assertion.

## 5. Fix `design-tasks` generate route test

- [x] 5.1 In `src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts`, add `jest.mock("@/lib/ai-model-settings", ...)` exporting `resolveRequestedModelConfig` returning a fixed `{ model: "db-model", providerConfig: {...}, creditMultiplier: 5 }`, so the route's pre-dispatch resolution no longer touches `prisma` raw methods.
- [x] 5.2 Run `npx jest "src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts"` and confirm the four credit-floor cases return their expected statuses (402 short balance, 200 on covered single/multi-image).

## 6. Full verification

- [x] 6.1 Run `npm test` and confirm all suites pass (0 failed).
- [x] 6.2 Run `npm run typecheck` and `npm run lint` and confirm both clean.
- [x] 6.3 Confirm the test suite proves the requirement **Conversation model is resolved from admin-managed database settings** (DB-driven selection, default fallback, and `AI_MODEL_NOT_CONFIGURED` on empty config) is satisfied end-to-end.
- [x] 6.4 Confirm the requirement **Client-requested model is validated against the plan allowlist** is fully removed: no remaining `resolveRequestedModel`/`pickModel`-clamp references in `src/lib/conversation/api.ts` or the test suite.
