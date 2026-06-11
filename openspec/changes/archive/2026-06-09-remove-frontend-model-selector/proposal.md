## Why

The chat input exposes a "MODEL" dropdown that lets end users pick the conversation model. The team has decided model choice is an **admin-only** concern: which model serves conversations is set in the admin panel by marking an `AiModelSetting` as default (`is_default`). The front-end selector contradicts that policy and lets users override the admin's choice, so it should be removed.

## What Changes

- Remove the model picker UI from the chat input (`modelOptions` / `selectedModel` / `onModelChange` props, the `<select>`, and the `requireModel` "尚未設定模型" gating).
- Stop the generate landing from sourcing, holding, and passing a selected model into the input.
- Stop the conversations hook from fetching the model list, holding `models`/`selectedModel` state, and sending `selectedModel` in the message POST body.
- Remove the now-unused `GET /api/conversations/models` endpoint and the `pickConversationModels` / `publicModelOption` helpers that only fed the picker.
- **No server resolution change:** `resolveRequestedModelConfig` already falls back to the active `is_default` conversation setting when no override is supplied, and still clamps (ignores) any client-supplied model id. With no override sent, the resolved model is the admin's default (currently **Claude Opus 4.7**).

## Non-Goals

- **Not** deactivating the other active conversation models (Gemini 3.1 Pro, GPT-5.4). Per team decision they stay `active`; they simply become unreachable from the UI (only the `is_default` row is used). Tidying them is out of scope.
- No change to how admins manage models in `/admin/models` (the **預設** / `is_default` toggle remains the selection mechanism).
- No change to the server-side clamp/resolution contract or to image/marketing model resolution.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-model-resolution`: add a requirement that the end-user UI does not expose a model selector and requests carry no user-chosen model — the conversation model is the active `is_default` setting, with the server clamp retained as a defensive backstop.

## Impact

- Affected specs: `ai-model-resolution`
- Affected code:
  - Modified:
    - src/components/ui/ai-chat-input.tsx
    - src/app/(app)/generate/page.tsx
    - src/hooks/useConversations.ts
    - src/types/conversation.ts
    - src/lib/ai-model-settings.ts
    - src/app/admin/models/page.tsx
    - src/app/api/conversations/[id]/messages/route.test.ts
  - Removed:
    - src/app/api/conversations/models/route.ts
  - New: (none)
