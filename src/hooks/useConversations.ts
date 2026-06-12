"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  Conversation,
  ConversationMessage,
  DesignTask,
  DesignTaskStarter,
  QuickAction,
  SendMessageResponse,
  MessageAttachment,
} from "@/types/conversation";

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
type RawMessage = ConversationMessage & {
  conversation_id?: string | null;
  message_type?: string | null;
  design_task_id?: string | null;
  created_at?: string | null;
};
type TextContent = { type?: string; text?: unknown };

type SendMessageInput = {
  content: string;
  metadata?: Record<string, unknown>;
  designTaskIds?: string[];
  files?: File[];
};

type GenerateDesignTaskInput = {
  sourceMessageId?: string | null;
  sourceVersionNumber?: number | null;
  instruction?: string;
  executionStrategy?: string;
  showInstructionBubble?: boolean;
};

type GenerateDesignTaskResponse = {
  task?: DesignTask;
  message?: ConversationMessage;
  usage?: { input_tokens?: number; output_tokens?: number };
  credits?: number;
  status?: string;
};

type ActiveBranchResponse = {
  activeLeafMessageId?: string | null;
  messages?: RawMessage[];
};

function normalizeConversation(raw: Conversation): Conversation {
  return {
    ...raw,
    aiModel: raw.aiModel ?? raw.ai_model ?? null,
    activeDesignTaskId: raw.activeDesignTaskId ?? raw.active_design_task_id ?? null,
    activeLeafMessageId: raw.activeLeafMessageId ?? raw.active_leaf_message_id ?? null,
    lastMessageAt: raw.lastMessageAt ?? raw.last_message_at ?? null,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
}

function normalizeMessage(raw: RawMessage): ChatMessage {
  const metadata = raw.metadata || null;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
    : Array.isArray(metadata?.attachments)
      ? (metadata.attachments as MessageAttachment[])
      : [];
  const rawContent = raw.content as unknown;
  const content =
    rawContent &&
    typeof rawContent === "object" &&
    (rawContent as TextContent).type === "text" &&
    typeof (rawContent as TextContent).text === "string"
      ? ((rawContent as TextContent).text as string)
      : rawContent &&
          typeof rawContent === "object" &&
          typeof (rawContent as TextContent).text === "string"
        ? ((rawContent as TextContent).text as string)
      : typeof rawContent === "string"
        ? rawContent
        : "";
  const quickActions = Array.isArray(raw.quickActions)
    ? raw.quickActions
    : Array.isArray(metadata?.quickActions)
      ? (metadata.quickActions as QuickAction[])
      : [];

  return {
    ...raw,
    conversationId: raw.conversationId ?? raw.conversation ?? raw.conversation_id ?? null,
    messageType: raw.messageType ?? (raw.message_type as ChatMessage["messageType"]) ?? "ai",
    content,
    attachments,
    quickActions,
    marketingIntelligence:
      raw.marketingIntelligence ||
      ((metadata?.marketingIntelligence as ChatMessage["marketingIntelligence"]) ?? null),
    stepDecision:
      raw.stepDecision || ((metadata?.stepDecision as ChatMessage["stepDecision"]) ?? null),
    designTaskId: raw.designTaskId ?? raw.design_task_id ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? undefined,
    isStreaming: (raw as ChatMessage).isStreaming || metadata?.status === "streaming",
  };
}

function isLocalMessage(message: ChatMessage) {
  return message.id.startsWith("local-");
}

function messageRoleRank(message: ChatMessage) {
  if (message.role === "user") return 0;
  if (message.role === "assistant") return 1;
  return 2;
}

function messageCreatedTime(message: ChatMessage) {
  if (!message.createdAt) return 0;
  const time = new Date(message.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareMessages(a: ChatMessage, b: ChatMessage) {
  const aTime = messageCreatedTime(a);
  const bTime = messageCreatedTime(b);
  if (aTime !== bTime) return aTime - bTime;
  const roleDiff = messageRoleRank(a) - messageRoleRank(b);
  if (roleDiff !== 0) return roleDiff;
  return a.id.localeCompare(b.id);
}

function mergeLoadedMessages(current: ChatMessage[], loaded: ChatMessage[]) {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const loadedIds = new Set(loaded.map((message) => message.id));
  const loadedUserTexts = new Set(
    loaded
      .filter((message) => message.role === "user")
      .map((message) => `${message.conversationId || ""}:${message.content}`),
  );
  const localPending = current.filter((message) => {
    if (!isLocalMessage(message) || loadedIds.has(message.id)) return false;
    if (message.role === "user" && loadedUserTexts.has(`${message.conversationId || ""}:${message.content}`)) return false;
    return true;
  });
  const mergedLoaded = loaded.map((message) => {
    const existing = currentById.get(message.id);
    if (!existing) return message;
    const status = messageStatus(message);
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return {
        ...message,
        isStreaming: false,
      };
    }
    return {
      ...message,
      isStreaming: existing.isStreaming || message.isStreaming,
    };
  });
  return [...mergedLoaded, ...localPending].sort(compareMessages);
}

function quickReplyAction(metadata?: Record<string, unknown>) {
  const quickReply = metadata?.quickReply;
  if (!quickReply || typeof quickReply !== "object") return "";
  const action = (quickReply as Record<string, unknown>).action;
  return typeof action === "string" ? action : "";
}

function messageStatus(message: Pick<ChatMessage, "metadata">) {
  const metadata = message.metadata;
  if (!metadata || typeof metadata !== "object") return "";
  const status = (metadata as Record<string, unknown>).status;
  return typeof status === "string" ? status : "";
}

// Client-side task-domain resolver. Kept in sync with the server-side
// resolveTaskDomain in src/lib/conversation/schema-registry.ts — we only need
// it as a hint for the optimistic placeholder, so a small static set is
// cheaper than importing the full schema registry into the client bundle.
const TEXT_TASK_TYPES = new Set([
  "social_copy",
  "seo_article",
  "ads_strategy",
  "annual_marketing_strategy",
  "website_audit",
]);
const WEB_TASK_TYPES = new Set([
  "brand_website",
  "landing_page",
  "ecommerce_website",
]);

function clientResolveTaskDomain(taskType: string | null | undefined): "image" | "text" | "web" | null {
  if (!taskType) return null;
  if (WEB_TASK_TYPES.has(taskType)) return "web";
  if (TEXT_TASK_TYPES.has(taskType)) return "text";
  return "image";
}

function quickReplyTaskId(metadata?: Record<string, unknown>) {
  const quickReply = metadata?.quickReply;
  if (!quickReply || typeof quickReply !== "object") return null;
  const taskId = (quickReply as Record<string, unknown>).taskId;
  return typeof taskId === "string" && taskId.trim() ? taskId.trim() : null;
}

function quickReplySourceMessageId(metadata?: Record<string, unknown>) {
  const quickReply = metadata?.quickReply;
  if (!quickReply || typeof quickReply !== "object") return null;
  const sourceMessageId = (quickReply as Record<string, unknown>).sourceMessageId;
  return typeof sourceMessageId === "string" && sourceMessageId.trim() ? sourceMessageId.trim() : null;
}

function isRecommendationAction(action: string) {
  return action === "ask_ai_recommendation" || action === "use_placeholder";
}

function pendingAssistantMessage(params: {
  id: string;
  conversationId: string;
  createdAt: string;
  action: string;
  taskId: string | null;
  taskDomain?: "image" | "text" | "web" | null;
  sourceMessageId?: string | null;
}) {
  const isGenerationRequest = params.action === "proceed_generate" || params.action === "website_generate";
  const isRecommendationRequest = isRecommendationAction(params.action);
  const stageLabel = isGenerationRequest
    ? "準備生成"
    : isRecommendationRequest
      ? "整理建議"
      : "整理上下文";
  const stageDescription = isGenerationRequest
    ? "正在整理 brief、參考資料與生成任務"
    : isRecommendationRequest
      ? "先整理目前資料，再補參考方向"
      : "正在對齊目前任務與最近對話";
  // The panel uses `domain` to pick its placeholder layout (image grid vs
  // text shell). Without this hint a text-task placeholder briefly renders
  // empty image slots — the "ghost image" issue.
  const domain = params.taskDomain ?? null;

  return {
    id: params.id,
    conversationId: params.conversationId,
    role: "assistant" as const,
    messageType: isGenerationRequest ? ("generation_result" as const) : ("ai" as const),
    content: "",
    metadata: {
      source: "client.optimistic-progress",
      status: isGenerationRequest ? "queued" : "streaming",
      phase: "progress",
      taskId: params.taskId,
      ...(isGenerationRequest
        ? {
            type: "generation_result",
            domain,
            taskType: null,
            sourceMessageId: params.sourceMessageId ?? null,
            versionNumber: 1,
            expectedOutputCount: 1,
            receivedOutputCount: 0,
            pendingOutputs: 1,
            outputGroups: [],
          }
        : {}),
      stepDecision: {
        phase: "processing",
        action: "progress",
        mode: "progress",
        stageLabel,
        stageDescription,
        stageIndex: isGenerationRequest ? 4 : null,
        totalStages: 5,
        needsUserInput: false,
        canGenerate: isGenerationRequest,
        nextActions: [],
        shouldShowProgress: true,
        updatedAt: new Date().toISOString(),
      },
    },
    designTaskId: params.taskId,
    createdAt: params.createdAt,
    isStreaming: !isGenerationRequest,
  } satisfies ChatMessage;
}

function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort(compareMessages);
}

function pendingProgressStages(action: string) {
  if (action === "proceed_generate" || action === "website_generate") {
    return [
      { delay: 900, stageLabel: "整理 brief", stageDescription: "對齊需求、素材與版本設定" },
      { delay: 2200, stageLabel: "建立生成任務", stageDescription: "準備送出生成請求" },
      { delay: 4200, stageLabel: "等待生成結果", stageDescription: "模型正在處理第一版內容" },
    ];
  }
  if (isRecommendationAction(action)) {
    return [
      { delay: 900, stageLabel: "整理目前資料", stageDescription: "先把已知資訊收斂成方向" },
      { delay: 2200, stageLabel: "查找參考", stageDescription: "補案例、靈感與可引用來源" },
      { delay: 4200, stageLabel: "輸出建議", stageDescription: "整理成可選擇的方向" },
    ];
  }
  return [
    { delay: 900, stageLabel: "對齊任務", stageDescription: "確認目前任務與最近對話" },
    { delay: 2200, stageLabel: "整理回覆", stageDescription: "收斂下一步要問或要給的內容" },
    { delay: 4200, stageLabel: "輸出回覆", stageDescription: "準備顯示正式內容" },
  ];
}

function updatePendingProgress(message: ChatMessage, stageLabel: string, stageDescription: string) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const stepDecision = metadata.stepDecision && typeof metadata.stepDecision === "object"
    ? (metadata.stepDecision as Record<string, unknown>)
    : {};
  return {
    ...message,
    metadata: {
      ...metadata,
      stepDecision: {
        ...stepDecision,
        stageLabel,
        stageDescription,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

function mergeIncomingMessage(current: ChatMessage[], incoming: ChatMessage) {
  const withoutDuplicates = current.filter((message) => {
    if (message.id === incoming.id) return false;
    if (incoming.role === "assistant" && isLocalMessage(message) && message.role === "assistant") return false;
    if (
      incoming.role === "user" &&
      isLocalMessage(message) &&
      message.role === "user" &&
      message.content === incoming.content
    ) {
      return false;
    }
    return true;
  });
  return sortMessages([...withoutDuplicates, incoming]);
}

function upsertIncomingMessage(current: ChatMessage[], incoming: ChatMessage) {
  const existing = current.find((message) => message.id === incoming.id);
  if (!existing) return mergeIncomingMessage(current, incoming);
  const status = messageStatus(incoming);
  const isGenerationResult =
    incoming.messageType === "generation_result" || existing.messageType === "generation_result";
  const nextMessage = {
    ...existing,
    ...incoming,
    metadata: incoming.metadata ?? existing.metadata,
    quickActions: isGenerationResult
      ? incoming.quickActions ?? []
      : incoming.quickActions?.length
        ? incoming.quickActions
        : existing.quickActions,
    isStreaming:
      status === "completed" || status === "failed" || status === "cancelled"
        ? false
        : incoming.isStreaming,
  };
  return sortMessages(current.map((message) => (message.id === incoming.id ? nextMessage : message)));
}

/**
 * Pending-cancel handshake for early stops. When the user stops a send while
 * the assistant message is still a `local-` placeholder, the server cancel
 * cannot be issued yet — the server message id is unknown. The tracker
 * records the intent per conversation; `claim` returns true exactly once
 * when the server-assigned assistant id arrives (send response or SSE
 * `message.created`), and `clear` discards the intent when a send fails
 * without ever producing a server id.
 */
export function createPendingCancelTracker() {
  const pending = new Set<string>();
  return {
    recordEarlyStop(conversationId: string) {
      pending.add(conversationId);
    },
    clear(conversationId: string) {
      pending.delete(conversationId);
    },
    claim(
      conversationId: string | null | undefined,
      message: { id: string; role?: string | null },
    ) {
      if (!conversationId || !pending.has(conversationId)) return false;
      if (message.role !== "assistant") return false;
      if (!message.id || message.id.startsWith("local-")) return false;
      pending.delete(conversationId);
      return true;
    },
  };
}

export function streamMessageFromEvent(event: MessageEvent, eventName: string) {
  try {
    const envelope = JSON.parse(event.data) as { data?: unknown };
    const data = envelope.data;
    if (!data || typeof data !== "object" || !("id" in data)) return null;
    const normalized = normalizeMessage(data as RawMessage);
    return {
      ...normalized,
      // Keep completed SSE replies in the local typewriter path. If we flip
      // this to false immediately, React renders the full final content at
      // once and the user sees a long answer suddenly appear after waiting.
      isStreaming:
        eventName === "message.completed" &&
        normalized.role === "assistant" &&
        normalized.messageType === "ai" &&
        messageStatus(normalized) === "completed"
          ? true
          : normalized.isStreaming,
    };
  } catch {
    return null;
  }
}

function mergeMessageDelta(current: ChatMessage[], event: MessageEvent) {
  try {
    const envelope = JSON.parse(event.data) as { data?: Record<string, unknown> };
    const data = envelope.data;
    if (!data || typeof data.id !== "string") return current;
    const content = typeof data.content === "string" ? data.content : "";
    const existing = current.find((message) => message.id === data.id);
    if (existing) {
      return sortMessages(current.map((message) =>
        message.id === data.id
          ? {
              ...message,
              content,
              metadata:
                data.metadata && typeof data.metadata === "object"
                  ? (data.metadata as ChatMessage["metadata"])
                  : message.metadata,
              isStreaming: true,
            }
          : message,
      ));
    }
    return mergeIncomingMessage(current, {
      id: data.id,
      conversationId: typeof data.conversationId === "string" ? data.conversationId : null,
      role: "assistant",
      messageType:
        data.messageType === "generation_result" || data.messageType === "ai"
          ? data.messageType
          : "ai",
      content,
      metadata:
        data.metadata && typeof data.metadata === "object"
          ? (data.metadata as ChatMessage["metadata"])
          : { status: "streaming" },
      designTaskId: typeof data.designTaskId === "string" ? data.designTaskId : null,
      createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
      isStreaming: true,
    } as ChatMessage);
  } catch {
    return current;
  }
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T> | T;
  if (!res.ok) {
    const maybeEnvelope = json as ApiEnvelope<T>;
    throw new Error(maybeEnvelope.error?.message || "Request failed");
  }
  return "data" in (json as ApiEnvelope<T>) ? ((json as ApiEnvelope<T>).data as T) : (json as T);
}

async function apiForm<T>(url: string, formData: FormData): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T> | T;
  if (!res.ok) {
    const maybeEnvelope = json as ApiEnvelope<T>;
    throw new Error(maybeEnvelope.error?.message || "Request failed");
  }
  return "data" in (json as ApiEnvelope<T>) ? ((json as ApiEnvelope<T>).data as T) : (json as T);
}

async function uploadAttachments(
  conversationId: string,
  files: File[],
  metadata?: Record<string, unknown>,
) {
  const formData = new FormData();
  const upload = metadata && typeof metadata.upload === "object"
    ? (metadata.upload as Record<string, unknown>)
    : {};
  if (typeof upload.assetKind === "string") formData.append("assetKind", upload.assetKind);
  if (typeof upload.field === "string") formData.append("field", upload.field);
  files.slice(0, 8).forEach((file) => formData.append("files", file));
  const data = await apiForm<{ attachments: MessageAttachment[] }>(
    `/api/conversations/${conversationId}/attachments/upload`,
    formData,
  );
  return data.attachments ?? [];
}

export function useConversations(activeConversationId?: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [activeDesignTask, setActiveDesignTask] = useState<DesignTask | null>(null);
  const [designTaskStarters, setDesignTaskStarters] = useState<DesignTaskStarter[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingConversationIdRef = useRef<string | null>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeLocalMessageIdsRef = useRef<string[]>([]);
  const pendingCancelRef = useRef(createPendingCancelTracker());

  const listConversations = useCallback(async () => {
    const data = await apiJson<Conversation[]>("/api/conversations");
    const normalized = data.map(normalizeConversation);
    setConversations(normalized);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("gtl:conversations-refresh"));
    }
    return normalized;
  }, []);

  const loadConversation = useCallback(async (conversationId: string) => {
    setIsLoadingMessages(true);
    try {
      const data = await apiJson<Conversation & { messages?: RawMessage[]; activeDesignTask?: DesignTask | null }>(
        `/api/conversations/${conversationId}`,
      );
      const conversation = normalizeConversation(data);
      setActiveConversation(conversation);
      setActiveDesignTask(data.activeDesignTask ?? null);
      const loadedMessages = (data.messages ?? []).map(normalizeMessage);
      setMessages((current) => mergeLoadedMessages(current, loadedMessages));
      return conversation;
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const createConversation = useCallback(async (title?: string, aiModel?: string) => {
    const conversation = await apiJson<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title, aiModel }),
    });
    const normalized = normalizeConversation(conversation);
    setActiveConversation(normalized);
    await listConversations();
    return normalized;
  }, [listConversations]);

  const updateConversation = useCallback(async (conversationId: string, patch: { title?: string; aiModel?: string | null }) => {
    const conversation = await apiJson<Conversation>(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    const normalized = normalizeConversation(conversation);
    setActiveConversation(normalized);
    await listConversations();
    return normalized;
  }, [listConversations]);

  const createDesignTask = useCallback(async (conversationId: string, input: { templateKey?: string; taskType?: string; title?: string }) => {
    const task = await apiJson<DesignTask>(`/api/conversations/${conversationId}/design-tasks`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    setActiveDesignTask(task);
    return task;
  }, []);

  const cancelMessage = useCallback(async (conversationId: string, messageId: string) => {
    try {
      await apiJson<{ alreadySettled: boolean }>(`/api/conversations/${conversationId}/messages/${messageId}/cancel`, {
        method: "POST",
      });
      // Optimistically flip the local message status so the panel button
      // updates immediately; the SSE message.updated will follow shortly.
      setMessages((current) =>
        sortMessages(
          current.map((message) => {
            if (message.id !== messageId) return message;
            const metadata =
              message.metadata && typeof message.metadata === "object"
                ? (message.metadata as Record<string, unknown>)
                : {};
            return {
              ...message,
              isStreaming: false,
              metadata: {
                ...metadata,
                cancelRequested: true,
                status: "cancelling",
              } as ChatMessage["metadata"],
            };
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    }
  }, []);

  const stopActiveMessage = useCallback(async (conversationId?: string | null, messageId?: string | null) => {
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    const localIds = activeLocalMessageIdsRef.current;
    activeLocalMessageIdsRef.current = [];
    if (localIds.length > 0) {
      setMessages((current) => sortMessages(current.filter((message) => !localIds.includes(message.id))));
    }
    setIsSending(false);

    if (conversationId && messageId) {
      if (messageId.startsWith("local-")) {
        // Early stop: the server message id is not known yet. Record a
        // pending cancel; it fires as soon as the id arrives (send response
        // or SSE message.created), so the generation ends as cancelled
        // instead of completing and billing.
        pendingCancelRef.current.recordEarlyStop(conversationId);
      } else {
        await cancelMessage(conversationId, messageId);
      }
    }
  }, [cancelMessage]);

  const generateDesignTask = useCallback(async (
    conversationId: string,
    taskId: string,
    input?: GenerateDesignTaskInput,
  ) => {
    setIsSending(true);
    setError(null);
    sendingConversationIdRef.current = conversationId;
    const optimisticUserId = `local-user-${Date.now()}`;
    const pendingAssistantId = `local-generation-${Date.now()}`;
    const userCreatedAt = new Date().toISOString();
    const assistantCreatedAt = new Date(Date.now() + 1).toISOString();
    const taskDomain =
      activeDesignTask?.id === taskId ? clientResolveTaskDomain(activeDesignTask.taskType) : null;
    const userInstruction = typeof input?.instruction === "string" ? input.instruction.trim() : "";
    const shouldShowUserBubble = input?.showInstructionBubble === true && userInstruction.length > 0;
    const requestInput = { ...(input ?? {}) };
    delete requestInput.showInstructionBubble;
    activeLocalMessageIdsRef.current = shouldShowUserBubble
      ? [optimisticUserId, pendingAssistantId]
      : [pendingAssistantId];
    setMessages((current) =>
      sortMessages([
        ...current,
        ...(shouldShowUserBubble
          ? [
              {
                id: optimisticUserId,
                conversationId,
                role: "user" as const,
                messageType: "ai" as const,
                content: userInstruction,
                metadata: null,
                createdAt: userCreatedAt,
              },
            ]
          : []),
        pendingAssistantMessage({
          id: pendingAssistantId,
          conversationId,
          createdAt: assistantCreatedAt,
          action: "proceed_generate",
          taskId,
          taskDomain,
          sourceMessageId: input?.sourceMessageId ?? null,
        }),
      ]),
    );
    try {
      const result = await apiJson<GenerateDesignTaskResponse>(
        `/api/conversations/${conversationId}/design-tasks/${taskId}/generate`,
        {
          method: "POST",
          body: JSON.stringify(requestInput),
        },
      );
      if (result.task) setActiveDesignTask(result.task);
      if (result.message) {
        const normalized = normalizeMessage(result.message as RawMessage);
        setMessages((current) =>
          sortMessages([
            ...current.filter((message) => message.id !== normalized.id && message.id !== pendingAssistantId),
            normalized,
          ]),
        );
      }
      await loadConversation(conversationId);
      await listConversations();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start generation";
      setError(message);
      setMessages((current) => sortMessages(current.filter((item) => item.id !== pendingAssistantId)));
      return null;
    } finally {
      sendingConversationIdRef.current = null;
      if (activeLocalMessageIdsRef.current.includes(pendingAssistantId)) {
        activeLocalMessageIdsRef.current = [];
      }
      setIsSending(false);
    }
  }, [activeDesignTask?.id, activeDesignTask?.taskType, listConversations, loadConversation]);


  const sendMessage = useCallback(async (conversationId: string, input: SendMessageInput) => {
    const content = input.content.trim();
    if (!content) return null;
    // Anchor optimistic timestamps inside setMessages so we can read the latest
    // snapshot. Client wall-clock alone can drift ahead of server timestamps,
    // which would push the user bubble below the server-stamped assistant reply.
    let userCreatedAt = "";
    let assistantCreatedAt = "";
    const optimisticUserId = `local-user-${Date.now()}`;
    const pendingAssistantId = `local-assistant-${Date.now()}`;
    const action = quickReplyAction(input.metadata);
    const pendingTaskId = quickReplyTaskId(input.metadata) || input.designTaskIds?.[0] || null;
    const progressTimers: number[] = [];
    const abortController = new AbortController();
    const isGenerationRequest = action === "proceed_generate" || action === "website_generate";

    setIsSending(true);
    setError(null);
    sendingConversationIdRef.current = conversationId;
    activeAbortControllerRef.current = abortController;
    activeLocalMessageIdsRef.current = isGenerationRequest
      ? [optimisticUserId, pendingAssistantId]
      : [optimisticUserId, pendingAssistantId];
    setMessages((current) => {
      const latestExistingTime = current.reduce(
        (acc, message) => Math.max(acc, messageCreatedTime(message)),
        0,
      );
      const anchor = Math.max(Date.now(), latestExistingTime + 1);
      userCreatedAt = new Date(anchor).toISOString();
      assistantCreatedAt = new Date(anchor + 1).toISOString();
      return sortMessages([
        ...current,
        {
          id: optimisticUserId,
          conversationId,
          role: "user" as const,
          messageType: "ai" as const,
          content,
          metadata: input.metadata ?? null,
          createdAt: userCreatedAt,
        },
        pendingAssistantMessage({
          id: pendingAssistantId,
          conversationId,
          createdAt: assistantCreatedAt,
          action,
          taskId: pendingTaskId,
          taskDomain: clientResolveTaskDomain(activeDesignTask?.taskType ?? null),
          sourceMessageId: quickReplySourceMessageId(input.metadata),
        }),
      ]);
    });
    if (typeof window !== "undefined") {
      for (const stage of pendingProgressStages(action)) {
        progressTimers.push(window.setTimeout(() => {
          setMessages((current) =>
            sortMessages(
              current.map((message) =>
                message.id === pendingAssistantId
                  ? updatePendingProgress(message, stage.stageLabel, stage.stageDescription)
                  : message,
              ),
            ),
          );
        }, stage.delay));
      }
    }
    try {
      const attachments = input.files?.length
        ? await uploadAttachments(conversationId, input.files, input.metadata)
        : [];
      const metadata = attachments.length > 0
        ? {
            ...(input.metadata ?? {}),
            attachments,
          }
        : input.metadata;
      const result = await apiJson<SendMessageResponse>(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            signal: abortController.signal,
            body: JSON.stringify({
              content,
              metadata,
              attachments,
              designTaskIds: input.designTaskIds,
            }),
          });

      setMessages((current) => {
        const userMessage = result.userMessage ? normalizeMessage(result.userMessage) : null;
        const assistantMessage = result.assistantMessage
          ? (() => {
              const normalized = normalizeMessage(result.assistantMessage);
              const status = messageStatus(normalized);
              // Force assistant timestamp to be strictly after its user message
              // so they never flip order during render (server clocks can give
              // assistant an earlier created_at than the user turn).
              const userTime = userMessage ? messageCreatedTime(userMessage) : 0;
              const assistantTime = messageCreatedTime(normalized);
              const safeCreatedAt =
                userTime > 0 && assistantTime <= userTime
                  ? new Date(userTime + 1).toISOString()
                  : normalized.createdAt;
              return {
                ...normalized,
                createdAt: safeCreatedAt,
                isStreaming:
                  normalized.messageType === "ai" &&
                  normalized.role === "assistant" &&
                  status === "completed",
              };
            })()
          : null;
        const resultIds = new Set(
          [userMessage?.id, assistantMessage?.id].filter((id): id is string => Boolean(id)),
        );
        const kept = current.filter(
          (message) =>
            message.id !== optimisticUserId &&
            message.id !== pendingAssistantId &&
            !resultIds.has(message.id),
        );
        return sortMessages([
          ...kept,
          ...(userMessage ? [userMessage] : []),
          ...(assistantMessage ? [assistantMessage] : []),
        ]);
      });
      const settledAssistant = result.assistantMessage ? normalizeMessage(result.assistantMessage) : null;
      if (settledAssistant && pendingCancelRef.current.claim(conversationId, settledAssistant)) {
        await cancelMessage(conversationId, settledAssistant.id);
      }
      await loadConversation(conversationId);
      await listConversations();
      return result;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Stop was pressed: the fetch is gone but the server keeps processing
        // the request, so a pending cancel recorded by stopActiveMessage must
        // survive — the SSE message.created event will claim it and issue the
        // server-side cancel as soon as the assistant message id is known.
        setMessages((current) => sortMessages(current.filter((item) => item.id !== pendingAssistantId && item.id !== optimisticUserId)));
        return null;
      }
      // Genuine failure: the server never acknowledged the send, so no
      // assistant id will ever arrive. Drop any pending cancel to avoid an
      // orphaned cancel call against a future message.
      pendingCancelRef.current.clear(conversationId);
      const message = err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      setMessages((current) => sortMessages(current.filter((item) => item.id !== pendingAssistantId)));
      return null;
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
      sendingConversationIdRef.current = null;
      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null;
        activeLocalMessageIdsRef.current = [];
      }
      setIsSending(false);
    }
  }, [activeDesignTask?.taskType, cancelMessage, listConversations, loadConversation]);

  const getDesignTaskStarters = useCallback(async () => {
    const data = await apiJson<{ starters: DesignTaskStarter[] }>("/api/conversations/design-task-starters");
    setDesignTaskStarters(data.starters ?? []);
    return data.starters ?? [];
  }, []);

  const switchActiveBranch = useCallback(async (conversationId: string, messageId: string) => {
    const data = await apiJson<ActiveBranchResponse>(`/api/conversations/${conversationId}/active-branch`, {
      method: "POST",
      body: JSON.stringify({ messageId }),
    });
    const loadedMessages = (data.messages ?? []).map(normalizeMessage);
    setMessages((current) => mergeLoadedMessages(current, loadedMessages));
    setActiveConversation((current) =>
      current && current.id === conversationId
        ? { ...current, activeLeafMessageId: data.activeLeafMessageId ?? current.activeLeafMessageId ?? null }
        : current,
    );
    return loadedMessages;
  }, []);
  useEffect(() => {
    void listConversations().catch((err) => setError(err instanceof Error ? err.message : "Failed to load conversations"));
    void getDesignTaskStarters().catch(() => undefined);
  }, [getDesignTaskStarters, listConversations]);

  useEffect(() => {
    if (activeConversationId) {
      if (sendingConversationIdRef.current === activeConversationId) return;
      void loadConversation(activeConversationId).catch((err) => setError(err instanceof Error ? err.message : "Failed to load messages"));
    } else {
      setActiveConversation(null);
      setActiveDesignTask(null);
      setMessages([]);
    }
  }, [activeConversationId, loadConversation]);

  useEffect(() => {
    if (!activeConversationId || typeof window === "undefined") return;
    let reloadTimer: number | null = null;
    const stream = new EventSource(`/api/conversations/${activeConversationId}/stream`);
    const scheduleReload = () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        void loadConversation(activeConversationId).catch((err) =>
          setError(err instanceof Error ? err.message : "Failed to load messages"),
        );
      }, 120);
    };
    const relevantEvents = [
      "message.created",
      "message.delta",
      "message.deleted",
      "message.updated",
      "message.completed",
      "generation.result.updated",
      "generation.result.completed",
      "generation.result.failed",
      "design-task.updated",
      "marketing.intelligence.ready",
      "active_branch.changed",
    ];
    for (const eventName of relevantEvents) {
      stream.addEventListener(eventName, (event) => {
        if (eventName === "active_branch.changed") {
          try {
            const envelope = JSON.parse((event as MessageEvent).data) as { data?: ActiveBranchResponse };
            const loadedMessages = (envelope.data?.messages ?? []).map(normalizeMessage);
            if (loadedMessages.length > 0) {
              setMessages((current) => mergeLoadedMessages(current, loadedMessages));
            } else {
              scheduleReload();
            }
          } catch {
            scheduleReload();
          }
          return;
        }
        if (eventName === "message.delta") {
          setMessages((current) => mergeMessageDelta(current, event as MessageEvent));
          return;
        }
        if (eventName === "message.deleted") {
          try {
            const envelope = JSON.parse((event as MessageEvent).data) as { data?: Record<string, unknown> };
            const id = envelope.data?.id;
            if (typeof id === "string") {
              setMessages((current) => current.filter((message) => message.id !== id));
            }
          } catch {
            // ignore malformed payload
          }
          return;
        }
        if (eventName === "message.created" || eventName === "message.updated" || eventName === "message.completed") {
          const incoming = streamMessageFromEvent(event as MessageEvent, eventName);
          if (incoming) {
            if (
              eventName === "message.created" &&
              pendingCancelRef.current.claim(incoming.conversationId ?? activeConversationId, incoming)
            ) {
              // An early stop was recorded before the server message id was
              // known; issue the server-side cancel now that it arrived.
              void cancelMessage(incoming.conversationId ?? activeConversationId, incoming.id);
            }
            setMessages((current) => upsertIncomingMessage(current, incoming));
          }
          return;
        }
        if (
          eventName === "generation.result.updated" ||
          eventName === "generation.result.completed" ||
          eventName === "generation.result.failed"
        ) {
          scheduleReload();
          return;
        }
        if (eventName === "design-task.updated") {
          scheduleReload();
          return;
        }
        if (eventName === "marketing.intelligence.ready") {
          try {
            const envelope = JSON.parse((event as MessageEvent).data) as { data?: Record<string, unknown> };
            const data = envelope.data;
            if (!data || typeof data.messageId !== "string") return;
            const messageId = data.messageId;
            const intelligence = data.marketingIntelligence;
            setMessages((current) =>
              sortMessages(
                current.map((message) => {
                  if (message.id !== messageId) return message;
                  const metadata =
                    message.metadata && typeof message.metadata === "object"
                      ? (message.metadata as Record<string, unknown>)
                      : {};
                  return {
                    ...message,
                    marketingIntelligence: intelligence as ChatMessage["marketingIntelligence"],
                    metadata: {
                      ...metadata,
                      marketingIntelligence: intelligence,
                    } as ChatMessage["metadata"],
                  };
                }),
              ),
            );
          } catch {
            // ignore malformed payload
          }
        }
      });
    }
    stream.onerror = () => undefined;
    return () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      stream.close();
    };
  }, [activeConversationId, cancelMessage, loadConversation]);

  return useMemo(
    () => ({
      conversations,
      messages,
      activeConversation,
      activeDesignTask,
      designTaskStarters,
      isSending,
      isLoadingMessages,
      error,
      listConversations,
      loadConversation,
      createConversation,
      updateConversation,
      createDesignTask,
      generateDesignTask,
      sendMessage,
      switchActiveBranch,
      cancelMessage,
      stopActiveMessage,
      getDesignTaskStarters,
    }),
    [
      conversations,
      messages,
      activeConversation,
      activeDesignTask,
      designTaskStarters,
      isSending,
      isLoadingMessages,
      error,
      listConversations,
      loadConversation,
      createConversation,
      updateConversation,
      createDesignTask,
      generateDesignTask,
      sendMessage,
      switchActiveBranch,
      cancelMessage,
      stopActiveMessage,
      getDesignTaskStarters,
    ],
  );
}
