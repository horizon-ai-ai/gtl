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
  instruction?: string;
  executionStrategy?: string;
};

type GenerateDesignTaskResponse = {
  task?: DesignTask;
  message?: ConversationMessage;
  usage?: { input_tokens?: number; output_tokens?: number };
  credits?: number;
  status?: string;
};

function normalizeConversation(raw: Conversation): Conversation {
  return {
    ...raw,
    aiModel: raw.aiModel ?? raw.ai_model ?? null,
    activeDesignTaskId: raw.activeDesignTaskId ?? raw.active_design_task_id ?? null,
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

function compareMessages(a: ChatMessage, b: ChatMessage) {
  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
  const hasLoadedAssistant = loaded.some((message) => message.role === "assistant");
  const localPending = current.filter((message) => {
    if (!isLocalMessage(message) || loadedIds.has(message.id)) return false;
    if (message.role === "user" && loadedUserTexts.has(`${message.conversationId || ""}:${message.content}`)) return false;
    if (message.role === "assistant" && hasLoadedAssistant) return false;
    return true;
  });
  const mergedLoaded = loaded.map((message) => {
    const existing = currentById.get(message.id);
    if (!existing) return message;
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

function quickReplyTaskId(metadata?: Record<string, unknown>) {
  const quickReply = metadata?.quickReply;
  if (!quickReply || typeof quickReply !== "object") return null;
  const taskId = (quickReply as Record<string, unknown>).taskId;
  return typeof taskId === "string" && taskId.trim() ? taskId.trim() : null;
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

export function streamMessageFromEvent(event: MessageEvent, eventName: string) {
  try {
    const envelope = JSON.parse(event.data) as { data?: unknown };
    const data = envelope.data;
    if (!data || typeof data !== "object" || !("id" in data)) return null;
    const normalized = normalizeMessage(data as RawMessage);
    return {
      ...normalized,
      // A completed assistant reply must render settled, not typing.
      isStreaming:
        eventName === "message.completed" &&
        normalized.role === "assistant" &&
        normalized.messageType === "ai"
          ? false
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
      messageType: "ai",
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

  const listConversations = useCallback(async () => {
    const data = await apiJson<Conversation[]>("/api/conversations");
    const normalized = data.map(normalizeConversation);
    setConversations(normalized);
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

  const generateDesignTask = useCallback(async (
    conversationId: string,
    taskId: string,
    input?: GenerateDesignTaskInput,
  ) => {
    const localGenerationId = `local-generation-${Date.now()}`;
    const createdAt = new Date().toISOString();
    setIsSending(true);
    setError(null);
    sendingConversationIdRef.current = conversationId;
    setMessages((current) => [
      ...current,
      {
        id: localGenerationId,
        conversationId,
        role: "assistant",
        messageType: "generation_result",
        content: "已送出生成任務，正在建立新版結果。",
        metadata: {
          type: "generation_result",
          source: "client.optimistic-generation",
          taskId,
          status: "queued",
          versionNumber: 1,
          expectedOutputCount: 1,
          receivedOutputCount: 0,
          pendingOutputs: 1,
          outputGroups: [],
        },
        designTaskId: taskId,
        createdAt,
      },
    ]);
    try {
      const result = await apiJson<GenerateDesignTaskResponse>(
        `/api/conversations/${conversationId}/design-tasks/${taskId}/generate`,
        {
          method: "POST",
          body: JSON.stringify(input ?? {}),
        },
      );
      if (result.task) setActiveDesignTask(result.task);
      if (result.message) {
        const normalized = normalizeMessage(result.message as RawMessage);
        setMessages((current) => [
          ...current.filter((message) => message.id !== normalized.id && message.id !== localGenerationId),
          normalized,
        ]);
      } else {
        setMessages((current) => current.filter((message) => message.id !== localGenerationId));
      }
      await listConversations();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start generation";
      setError(message);
      setMessages((current) => current.filter((item) => item.id !== localGenerationId));
      return null;
    } finally {
      sendingConversationIdRef.current = null;
      setIsSending(false);
    }
  }, [listConversations]);


  const sendMessage = useCallback(async (conversationId: string, input: SendMessageInput) => {
    const content = input.content.trim();
    if (!content) return null;
    const now = Date.now();
    const userCreatedAt = new Date(now).toISOString();
    const assistantCreatedAt = new Date(now + 1).toISOString();
    const optimisticUserId = `local-user-${Date.now()}`;
    const pendingAssistantId = `local-assistant-${Date.now()}`;
    const action = quickReplyAction(input.metadata);
    const pendingTaskId = quickReplyTaskId(input.metadata) || input.designTaskIds?.[0] || null;
    const progressTimers: number[] = [];

    setIsSending(true);
    setError(null);
    sendingConversationIdRef.current = conversationId;
    setMessages((current) => [
      ...current,
      {
        id: optimisticUserId,
        conversationId,
        role: "user",
        messageType: "ai",
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
      }),
    ]);
    if (typeof window !== "undefined") {
      for (const stage of pendingProgressStages(action)) {
        progressTimers.push(window.setTimeout(() => {
          setMessages((current) =>
            current.map((message) =>
              message.id === pendingAssistantId
                ? updatePendingProgress(message, stage.stageLabel, stage.stageDescription)
                : message,
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
            body: JSON.stringify({
              content,
              metadata,
              attachments,
              designTaskIds: input.designTaskIds,
            }),
          });

      setMessages((current) => {
        const kept = current.filter((message) => message.id !== optimisticUserId && message.id !== pendingAssistantId);
        const assistantMessage = result.assistantMessage
          ? { ...normalizeMessage(result.assistantMessage), isStreaming: true }
          : null;
        return [
          ...kept,
          ...(result.userMessage ? [normalizeMessage(result.userMessage)] : []),
          ...(assistantMessage ? [assistantMessage] : []),
        ];
      });
      await listConversations();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setError(message);
      setMessages((current) => current.filter((item) => item.id !== pendingAssistantId));
      return null;
    } finally {
      progressTimers.forEach((timer) => window.clearTimeout(timer));
      sendingConversationIdRef.current = null;
      setIsSending(false);
    }
  }, [listConversations]);

  const getDesignTaskStarters = useCallback(async () => {
    const data = await apiJson<{ starters: DesignTaskStarter[] }>("/api/conversations/design-task-starters");
    setDesignTaskStarters(data.starters ?? []);
    return data.starters ?? [];
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
      "message.updated",
      "message.completed",
      "generation.result.updated",
      "generation.result.completed",
      "generation.result.failed",
      "design-task.updated",
    ];
    for (const eventName of relevantEvents) {
      stream.addEventListener(eventName, (event) => {
        if (eventName === "message.delta") {
          setMessages((current) => mergeMessageDelta(current, event as MessageEvent));
          return;
        }
        if (eventName === "message.created" || eventName === "message.updated" || eventName === "message.completed") {
          const incoming = streamMessageFromEvent(event as MessageEvent, eventName);
          if (incoming) {
            setMessages((current) => mergeIncomingMessage(current, incoming));
          }
        }
        scheduleReload();
      });
    }
    stream.onerror = () => undefined;
    return () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      stream.close();
    };
  }, [activeConversationId, loadConversation]);

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
      getDesignTaskStarters,
    ],
  );
}
