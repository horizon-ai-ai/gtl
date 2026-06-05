import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail } from "@/lib/api";
import { detectRecommendedActions, extractSuggestedItems } from "@/lib/chat-handoff";
import { flexionStream, pickModel, rawToCredits } from "@/lib/flexion";
import { assertCreditsAvailable, consumeCredits } from "@/lib/credits";
import {
  DesignTaskStatus,
  MessageRole,
  MessageType,
  type DesignTask,
  type Message,
  type Prisma,
} from "@prisma/client";
import {
  activateDesignTask,
  getTaskTitle,
  resolveRequestedModel,
  resolveTaskCreateInput,
  toInputJson,
} from "@/lib/conversation/api";
import { getSchema } from "@/lib/conversation/schema-registry";
import { marketingIntelligence, type MarketingIntelligencePack } from "@/lib/conversation/marketing-intelligence";

const SYSTEM_PROMPT =
  [
    "你是 GTL 的設計與行銷顧問助理，請以繁體中文回覆，語氣像正在和客戶一起把作品做出來。",
    "最重要：不要把任務 schema 當問卷列出。每一輪最多問 1 個主要問題，必要時可附 1 個很短的補充問題。",
    "使用者剛開始一個設計任務時，先接住需求，說明你會怎麼推進，然後只問最影響第一版的資料。",
    "Logo/品牌任務開場優先問：品牌名稱或暫用名稱、產業/產品是什麼。不要一開始就問理念、個性、客群、場景、喜歡風格等完整清單。",
    "如果使用者說沒想法、你決定、給建議，請先用你的判斷提出一個推薦方向與理由，再問下一個最小缺口。",
    "如果資訊已足夠做合理第一版，請整理 brief 並建議可以產生，不要繼續訪談。",
    "若你判斷對話已進入成交、報價、付款、交期、客製化需求確認等階段，才建議『建立訂單草稿』或『轉人工處理』。",
  ].join("\n");

type ChatMessageBody = {
  conversation_id?: string;
  content: string;
  design_task_id?: string;
  model?: string;
  selectedModel?: string;
  preferredModel?: string;
  taskType?: string;
  templateKey?: string;
  title?: string;
  collectedData?: unknown;
  metadata?: Record<string, unknown>;
};

function messageContentToText(message: Message) {
  const content = message.content as { text?: unknown; type?: string } | string;
  if (typeof content === "string") return content;
  if (typeof content?.text === "string") return content.text;
  return JSON.stringify(content);
}

async function buildDesignTaskSystemContext(task: DesignTask | null) {
  if (!task) return "";

  const schema = await getSchema(task.task_type);
  const requiredQuestions = (schema.requirements ?? [])
    .filter((requirement) => requirement.required !== false)
    .slice(0, 6)
    .map((requirement) => `- ${requirement.label}: ${requirement.question}`)
    .join("\n");

  return [
    "目前這段對話正在處理一個設計/行銷任務。請優先協助使用者補齊任務需求，必要時用自然語氣詢問缺少資訊；當需求足夠時，可以建議使用者產生第一版成果。",
    "不要把下列欄位一次全部列給使用者；它們只是你的內部檢查清單。請根據上下文挑最重要的一項推進。",
    `任務 ID：${task.id}`,
    `任務類型：${schema.displayName} (${task.task_type})`,
    `任務標題：${task.title}`,
    task.summary ? `任務摘要：${task.summary}` : "",
    task.collected_data ? `已收集資料：${JSON.stringify(task.collected_data)}` : "",
    requiredQuestions ? `內部需求欄位參考：\n${requiredQuestions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildMarketingIntelligenceSystemContext(pack: MarketingIntelligencePack | null) {
  const context = marketingIntelligence.buildPromptContext(pack);
  return context ? `# 已搜尋的最新市場資訊\n${context}` : "";
}

function buildRecentTurns(history: Message[]) {
  return history
    .filter((message) => message.role === MessageRole.user || message.role === MessageRole.assistant)
    .slice(-12)
    .map((message) => ({
      role: message.role === MessageRole.user ? ("user" as const) : ("assistant" as const),
      content: messageContentToText(message),
    }));
}

async function resolveActiveDesignTask(params: {
  conversationId: string;
  userId: string;
  body: ChatMessageBody;
}) {
  if (params.body.design_task_id) {
    const task = await prisma.designTask.findFirst({
      where: {
        id: params.body.design_task_id,
        conversation_id: params.conversationId,
        user_id: params.userId,
      },
    });
    if (task) {
      await activateDesignTask(params.conversationId, task.id);
      return task;
    }
  }

  if (params.body.taskType || params.body.templateKey) {
    const resolved = await resolveTaskCreateInput(params.body as Record<string, unknown>);
    const task = await prisma.designTask.create({
      data: {
        conversation_id: params.conversationId,
        user_id: params.userId,
        task_type: resolved.taskType,
        template_key: resolved.templateKey,
        template_label: resolved.templateLabel,
        execution_strategy: resolved.executionStrategy,
        title: getTaskTitle(resolved.taskType, params.body.title),
        status: DesignTaskStatus.active,
        collected_data: toInputJson(params.body.collectedData),
        last_activity_at: new Date(),
      },
    });
    await activateDesignTask(params.conversationId, task.id);
    return task;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { active_design_task_id: true },
  });
  if (!conversation?.active_design_task_id) return null;

  return prisma.designTask.findFirst({
    where: {
      id: conversation.active_design_task_id,
      conversation_id: params.conversationId,
      user_id: params.userId,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

  let body: ChatMessageBody;
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR", "Invalid JSON");
  }
  if (!body.content?.trim()) return fail("VALIDATION_ERROR", "Empty message");

  try {
    await assertCreditsAvailable(session.user.id);
  } catch {
    return fail("QUOTA_EXCEEDED", "Token credits exhausted");
  }

  let conversationId = body.conversation_id;
  if (!conversationId) {
    const c = await prisma.conversation.create({
      data: { user_id: session.user.id, last_message_at: new Date() },
    });
    conversationId = c.id;
  } else {
    const c = await prisma.conversation.findFirst({
      where: { id: conversationId, user_id: session.user.id, deleted_at: null },
    });
    if (!c) return fail("RESOURCE_NOT_FOUND", "Conversation not found");
  }

  let activeTask: DesignTask | null = null;
  try {
    activeTask = await resolveActiveDesignTask({
      conversationId,
      userId: session.user.id,
      body,
    });
  } catch (err) {
    return fail("VALIDATION_ERROR", (err as Error).message);
  }

  await prisma.message.create({
    data: {
      conversation_id: conversationId,
      role: MessageRole.user,
      message_type: MessageType.ai,
      content: { type: "text", text: body.content },
      metadata: {
        ...(body.metadata ?? {}),
        source: "chat.messages",
        activeDesignTaskId: activeTask?.id ?? null,
      } as Prisma.InputJsonValue,
      design_task_id: activeTask?.id,
    },
  });

  const history = await prisma.message.findMany({
    where: { conversation_id: conversationId },
    orderBy: { created_at: "asc" },
    take: 50,
  });

  const sub = await prisma.subscription.findUnique({
    where: { user_id: session.user.id },
    include: { plan: true },
  });
  const planCode = sub?.plan.code ?? "free";
  const requestedModel =
    body.preferredModel?.trim() || body.selectedModel?.trim() || body.model?.trim() || "";
  // Never forward the raw client value: validate against the plan allowlist
  // and clamp to the plan default on a miss.
  const model = resolveRequestedModel(planCode, requestedModel || activeTask?.preferred_model);
  const taskContext = await buildDesignTaskSystemContext(activeTask);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("conversation", { id: conversationId });
      if (activeTask) {
        send("design_task", {
          id: activeTask.id,
          taskType: activeTask.task_type,
          templateKey: activeTask.template_key,
          templateLabel: activeTask.template_label,
          executionStrategy: activeTask.execution_strategy,
          title: activeTask.title,
          status: activeTask.status,
          summary: activeTask.summary,
          collectedData: activeTask.collected_data,
          lastActivityAt: activeTask.last_activity_at,
        });
      }

      let intelligence: MarketingIntelligencePack | null = null;
      if (marketingIntelligence.isAvailable()) {
        try {
          send("search_status", { status: "started", label: "正在判斷是否需要搜尋" });
          intelligence = await marketingIntelligence.maybeResearch({
            userMessage: body.content,
            task: activeTask,
            recentTurns: buildRecentTurns(history),
          });
          if (intelligence) {
            send("references", {
              query: intelligence.query,
              sources: intelligence.sources,
              visualReferences: intelligence.visualReferences,
              groundedMode: intelligence.groundedMode,
            });
          } else {
            send("search_status", { status: "skipped", label: "這輪不需要搜尋" });
          }
        } catch (err) {
          console.warn("[chat/messages] marketing intelligence skipped:", err);
          send("search_status", { status: "skipped", label: "搜尋暫時不可用" });
        }
      }

      const intelligenceContext = buildMarketingIntelligenceSystemContext(intelligence);
      const systemContent = [SYSTEM_PROMPT, taskContext, intelligenceContext].filter(Boolean).join("\n\n");
      const messages = [
        {
          role: "system" as const,
          content: systemContent,
        },
        ...history.map((m) => {
          return {
            role: m.role as "user" | "assistant" | "system" | "tool",
            content: messageContentToText(m),
          };
        }),
      ];

      let assembled = "";
      let usage = { input_tokens: 0, output_tokens: 0 };
      try {
        for await (const evt of flexionStream({ model, messages, stream: true })) {
          if (evt.type === "token") {
            assembled += evt.delta;
            send("token", { delta: evt.delta });
          } else if (evt.type === "done") {
            usage = evt.usage;
          }
        }
      } catch (err) {
        send("error", { message: (err as Error).message });
      }

      const credits = rawToCredits(model, usage);
      const recommendedActions = detectRecommendedActions(assembled);
      const suggestedItems = extractSuggestedItems(assembled);
      await prisma.message.create({
        data: {
          conversation_id: conversationId!,
          role: MessageRole.assistant,
          message_type: MessageType.ai,
          content: { type: "text", text: assembled },
          metadata: {
            source: "chat.messages",
            activeDesignTaskId: activeTask?.id ?? null,
            recommendedActions,
            suggestedItems,
            marketingIntelligence: intelligence
              ? {
                  query: intelligence.query,
                  searchModel: intelligence.searchModel,
                  sources: intelligence.sources,
                  visualReferences: intelligence.visualReferences,
                  groundedMode: intelligence.groundedMode,
                  createdAt: intelligence.createdAt,
                }
              : null,
          },
          design_task_id: activeTask?.id,
          tokens_input: usage.input_tokens,
          tokens_output: usage.output_tokens,
          credits_used: credits,
          model,
        },
      });
      await prisma.conversation.update({
        where: { id: conversationId! },
        data: {
          last_message_at: new Date(),
          ...(activeTask ? { active_design_task_id: activeTask.id } : {}),
          ...(history.length <= 1 && assembled
            ? { title: assembled.slice(0, 20).replace(/\n/g, " ") }
            : {}),
        },
      });
      await consumeCredits(session.user.id, credits);

      if (recommendedActions.length > 0) {
        send("recommendation", {
          actions: recommendedActions,
          suggested_items: suggestedItems,
        });
      }
      send("done", { usage, credits: Number(credits) });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
