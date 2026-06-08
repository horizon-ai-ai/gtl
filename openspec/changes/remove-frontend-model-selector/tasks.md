

## 1. Remove the picker from the chat input

- [x] 1.1 In `src/components/ui/ai-chat-input.tsx`, remove the `modelOptions`, `selectedModel`, `onModelChange`, and `requireModel` props from the component's props type and signature.
- [x] 1.2 Remove the model `<select>` render block and the `modelMissing` logic plus the "尚未設定模型，請先到後台新增模型" message; make send-button enablement depend only on input content/attachments and `loading` (not on a model being present).

## 2. Stop the generate landing from passing a model

- [x] 2.1 In `src/app/(app)/generate/page.tsx`, remove the `selectedModel` state (`modelValue` / `setSelectedModel`) and the `modelOptions` / `selectedModel` / `onModelChange` / `requireModel` props passed to `AIChatInput` (both placements).
- [x] 2.2 Remove `models` from the `useConversations(...)` destructuring and any other now-unused model references on the page.

## 3. Stop the hook from fetching/sending a model

- [x] 3.1 In `src/hooks/useConversations.ts`, remove the `models` state, the `GET /api/conversations/models` fetch that sets it, and `models` from the hook's returned object.
- [x] 3.2 Stop including `selectedModel` in the message POST body, and remove `selectedModel` from the send-input type. (The server still resolves the default model when none is sent.)

## 4. Remove the now-unused endpoint, helpers, and type

- [x] 4.1 Delete `src/app/api/conversations/models/route.ts` (its only consumer was the removed hook fetch).
- [x] 4.2 Remove `pickConversationModels` and `publicModelOption` from `src/lib/ai-model-settings.ts` (they only fed the deleted endpoint); confirm via grep that nothing else imports them.
- [x] 4.3 Remove the `ModelOption` type from `src/lib/conversation/types.ts` if no references remain after tasks 1–3 (grep to confirm before deleting).

## 5. Verify

- [x] 5.1 `grep` the codebase (excluding `openspec/changes/archive`) for `conversations/models`, `pickConversationModels`, `publicModelOption`, and `ModelOption` — confirm zero remaining references.
- [x] 5.2 `npm run typecheck` and `npm run lint` pass with no dangling imports/props/unused symbols.
- [x] 5.3 `npm test` passes; update any test that asserted the model selector or sent `selectedModel` (e.g. the chat/messages route tests that pass `selectedModel`) so they reflect no-override → default resolution.
- [x] 5.4 Manual: the generate landing shows the chat input with **no MODEL dropdown**, sending a message works without selecting a model, and the request body contains no `selectedModel`.
- [x] 5.5 Confirm the **Conversation model selection is admin-only** requirement holds end-to-end: the default conversation model serves the reply and any stray client model id is ignored.
