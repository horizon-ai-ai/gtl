# Design

## Context

The chat input's "MODEL" dropdown lets end users override the conversation model, which contradicts the team's admin-only policy. The backend already resolves the conversation model to the active `is_default` setting and clamps (ignores) any client-supplied model id, so this is a **front-end removal plus dead-code cleanup** — no resolution-logic change.

## Goals / Non-Goals

**Goals:** remove the model picker and all plumbing that exists only to feed it; rely on the server's existing default resolution.

**Non-Goals:** deactivating the extra active conversation models (they stay `active` per team decision and simply become unreachable from the UI); changes to the `/admin/models` default toggle; any change to the server resolution/clamp contract; image/marketing model resolution.

## Decisions

1. **`ai-chat-input.tsx`** — remove the `modelOptions` / `selectedModel` / `onModelChange` / `requireModel` props, the model `<select>` block, and the `modelMissing` gating + "尚未設定模型" message. Send-button enablement no longer depends on a model being present.
2. **`generate/page.tsx`** — remove `selectedModel` state (`modelValue` / `setSelectedModel`), stop passing model props to `AIChatInput`, and drop `models` from the `useConversations` destructuring.
3. **`useConversations.ts`** — remove the `models` state and the `GET /api/conversations/models` fetch, remove `models` from the hook's returned value, stop sending `selectedModel` in the message POST body, and drop `selectedModel` from the send-input type.
4. **Remove `GET /api/conversations/models`** route, and the now-unused `pickConversationModels` + `publicModelOption` from `ai-model-settings.ts`. Remove the `ModelOption` type from `conversation/types.ts` if nothing else references it after the above.
5. **Server untouched** — `resolveRequestedModelConfig` already returns the `is_default` conversation setting when no override is supplied and clamps stray model ids; with the UI no longer sending `selectedModel`, the resolved model is the admin default (currently Claude Opus 4.7). The clamp stays as a defensive backstop.

## In scope / Out of scope

- **In:** the 5 modified files + the removed route.
- **Out:** model activation state, admin panel, server resolution logic, image/marketing model paths.

## Verification

- The generate landing renders the chat input with **no MODEL dropdown**, and send works without selecting a model.
- A sent chat message includes **no `selectedModel`** in the request body and returns a normal reply served by the default model.
- `grep` finds **no remaining references** to `/api/conversations/models`, `pickConversationModels`, `publicModelOption`, or `ModelOption` (outside archived specs).
- `npm test`, `npm run typecheck`, and `npm run lint` pass with no dangling imports, props, or unused symbols.
