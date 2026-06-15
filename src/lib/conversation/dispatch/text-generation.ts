import { randomUUID } from "crypto";
import { DesignTaskStatus, type DesignTask, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { flexionComplete, flexionStream, rawToCredits, type FlexionRequest } from "@/lib/flexion";
import { getSchema, resolveDefaultExecutionStrategy, resolveTaskDomain } from "@/lib/conversation/schema-registry";
import { publishConversationEvent } from "@/lib/conversation/stream";
import { shapeMessage } from "@/lib/conversation/api";
import { cleanTaskSummary } from "@/lib/project-brief";

import {
  createGenerationPlaceholder,
  isCancelRequested,
  nextGenerationVersion,
  objectRecord,
  resolveGenerationLineage,
  updateGenerationMessage,
  type GenerationLineage,
} from "./shared";

export type DispatchTextGenerationParams = {
  conversationId: string;
  task: DesignTask;
  model: string;
  providerConfig?: FlexionRequest["providerConfig"];
  creditMultiplier?: number;
  instruction: string;
  sourceMessageId?: string | null;
  sourceVersionNumber?: number | null;
  systemPrompt?: string;
  source?: string;
};

const DEFAULT_SYSTEM_PROMPT =
  "你是 GTL 的設計交付引擎。使用者已確認產生第一版時，必須直接交付完整成品，不可回覆無法生成、轉交他人、需求整理、brief、架構或下一步建議。";

function jsonSummary(value: unknown) {
  if (!value) return "無";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function textDeliverableInstruction(taskType: string) {
  switch (taskType) {
    case "seo_article":
      return [
        "交付物必須是完整 SEO 文章正文，不是 SEO brief、文章架構、需求整理或寫手指示。",
        "請直接輸出可貼到網站或部落格的文章成品，至少包含：H1 標題、Meta Title、Meta Description、開場段、4 到 6 個 H2 章節、每個章節的實際段落內容、FAQ、CTA 或結語。",
        "如果品牌、產品、地區或關鍵字不足，請用合理假設自然帶入正文；可以在開頭用一句話標註假設，但不可要求使用者再提供主題才能開始。",
        "禁止輸出「SEO 文章設計 brief」、「第一版執行 brief」、「下一步怎麼做」、「請給我主題」、「之後把某某換掉」、「適合交給寫手」這類規劃語句。",
      ].join("\n");
    case "social_copy":
      return [
        "交付物必須是可直接發布的社群文案組，不是文案 brief 或方向建議。",
        "請輸出多則完整貼文文案、標題、CTA、hashtag 與可搭配的視覺建議；缺資料時用合理假設補齊。",
      ].join("\n");
    case "marketing_plan":
    case "marketing_strategy":
      return [
        "交付物必須是可執行的行銷方案，不是需求整理或下一步建議。",
        "請輸出目標、策略、執行步驟、渠道配置、素材方向、衡量指標與時程；缺資料時用合理假設補齊。",
      ].join("\n");
    default:
      return [
        "交付物必須是可直接使用的完整第一版成品，不是 brief、需求整理、大綱或下一步建議。",
        "缺資料時用合理假設補齊並直接完成，不要把問題丟回給使用者。",
      ].join("\n");
  }
}

export function sourceTextFromPriorVersion(params: {
  conversationId: string;
  taskId: string;
  sourceMessageId?: string | null;
  sourceVersionNumber?: number | null;
}) {
  return (async () => {
    // Only a generation_result may serve as the prior version. A user
    // message id supplied as the source must never be injected as
    // 被修改的前版內容 — with no qualifying result the dispatcher builds
    // the creation prompt instead.
    const sourceMessage = params.sourceMessageId
      ? await prisma.message.findFirst({
          where: {
            id: params.sourceMessageId,
            conversation_id: params.conversationId,
            design_task_id: params.taskId,
            message_type: "generation_result",
          },
          select: { metadata: true, content: true },
        })
      : await prisma.message.findFirst({
          where: {
            conversation_id: params.conversationId,
            design_task_id: params.taskId,
            message_type: "generation_result",
          },
          orderBy: { created_at: "desc" },
          select: { metadata: true, content: true },
        });
    if (!sourceMessage) return "";
    const metadata = objectRecord(sourceMessage.metadata);
    const groups = Array.isArray(metadata.outputGroups) ? metadata.outputGroups : [];
    const candidate = groups
      .map((group) => (group && typeof group === "object" && !Array.isArray(group) ? (group as Record<string, unknown>) : null))
      .filter((group): group is Record<string, unknown> => Boolean(group))
      .filter((group) => {
        if (!params.sourceVersionNumber) return true;
        return Number(group.versionNumber) === params.sourceVersionNumber;
      })[0];
    const items = candidate && Array.isArray(candidate.items) ? candidate.items : [];
    const text = items
      .map((item) => {
        const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
        return typeof record.content === "string" ? record.content : "";
      })
      .filter(Boolean)
      .join("\n\n");
    if (text) {
      return text.length > 6000
        ? `${text.slice(0, 6000)}\n\n（前版內容已截斷，請保留其餘未被要求修改的結構與語氣。）`
        : text;
    }
    const content = sourceMessage.content as unknown;
    if (content && typeof content === "object" && "text" in (content as Record<string, unknown>)) {
      const value = (content as Record<string, unknown>).text;
      return typeof value === "string" ? value : "";
    }
    return "";
  })();
}

/**
 * Pure prompt builder. With an empty `sourceText` (no qualifying
 * generation_result), the creation prompt is built: no 被修改的前版內容
 * block and no revision instructions.
 */
export function buildTextGenerationPrompt(params: {
  task: Pick<DesignTask, "title" | "task_type" | "collected_data" | "resolved_requirements" | "missing_requirements">;
  schemaDisplayName: string;
  executionStrategy: string;
  sourceText: string;
  sourceVersionNumber?: number | null;
  instruction: string;
}) {
  return [
    `任務：${params.task.title}`,
    `任務類型：${params.task.task_type}`,
    `模板：${params.schemaDisplayName}`,
    `交付策略：${params.executionStrategy}`,
    `需求資料：${jsonSummary(params.task.collected_data)}`,
    `已解析需求：${jsonSummary(params.task.resolved_requirements)}`,
    `缺少需求：${jsonSummary(params.task.missing_requirements)}`,
    params.sourceText && params.sourceVersionNumber
      ? `本輪是針對第 ${params.sourceVersionNumber} 版做修改。`
      : "",
    params.sourceText ? `被修改的前版內容：\n${params.sourceText}` : "",
    params.instruction ? `使用者本輪指令：${params.instruction}` : "",
    `交付物規則：\n${textDeliverableInstruction(params.task.task_type)}`,
    params.sourceText
      ? "請輸出修正版完整成品。必須保留前版中使用者沒有要求修改的結構、語氣、段落與重點，只套用本輪指令要求的變更；不可改寫成 brief 或重新規劃。"
      : "請直接輸出第一版完整成品，不要反問。資訊不足時用合理假設補齊，並清楚標註假設；不可輸出 brief、架構、大綱或下一步建議。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function dispatchTextGeneration(params: DispatchTextGenerationParams) {
  const domain = resolveTaskDomain(params.task.task_type);
  if (domain !== "text") return null;

  const schema = await getSchema(params.task.task_type);
  const executionStrategy =
    params.task.execution_strategy || resolveDefaultExecutionStrategy(params.task.task_type);
  const versionNumber = await nextGenerationVersion(params.conversationId, params.task.id);
  const lineage: GenerationLineage = await resolveGenerationLineage({
    conversationId: params.conversationId,
    taskId: params.task.id,
    sourceMessageId: params.sourceMessageId,
  });
  const generationId = randomUUID();
  const sourceText = await sourceTextFromPriorVersion({
    conversationId: params.conversationId,
    taskId: params.task.id,
    sourceMessageId: params.sourceMessageId,
    sourceVersionNumber: params.sourceVersionNumber,
  });

  const baseContent = {
    type: "text_document",
    status: "streaming",
    taskId: params.task.id,
    taskType: params.task.task_type,
    executionStrategy,
    domain,
    text: "",
  };

  const placeholder = await createGenerationPlaceholder({
    conversationId: params.conversationId,
    taskId: params.task.id,
    taskType: params.task.task_type,
    templateKey: params.task.template_key,
    templateLabel: params.task.template_label || params.task.title,
    executionStrategy,
    domain,
    versionNumber,
    expectedOutputCount: 1,
    lineage,
    generationId,
    initialContent: baseContent as Prisma.InputJsonValue,
    initialStatus: "streaming",
    initialMetadataExtras: { source: params.source ?? "conversation.dispatcher" },
    model: params.model,
  });

  if (placeholder.reused) {
    return {
      task: params.task,
      message: placeholder.message,
      usage: { input_tokens: 0, output_tokens: 0 },
      credits: BigInt(0),
      reused: true,
    };
  }

  const prompt = buildTextGenerationPrompt({
    task: params.task,
    schemaDisplayName: schema.displayName,
    executionStrategy,
    sourceText,
    sourceVersionNumber: params.sourceVersionNumber,
    instruction: params.instruction,
  });

  const buildOutputGroup = (content: string) => ({
    kind: "text",
    title: `第 ${versionNumber} 版內容`,
    versionNumber,
    generationId,
    items: [
      {
        id: `${generationId}-text-1`,
        label: params.task.title,
        content,
      },
    ],
  });

  let assembled = "";
  let usage = { input_tokens: 0, output_tokens: 0 };
  let completionModel = params.model;
  let lastPublishedAt = 0;
  let cancelled = false;
  let tokenCounter = 0;
  let message = placeholder.message;

  const publishStreamingResult = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastPublishedAt < 320) return;
    lastPublishedAt = now;
    message = await updateGenerationMessage(params.conversationId, message, {
      content: { ...baseContent, text: assembled } as Prisma.InputJsonValue,
      metadataMerge: { outputGroups: [buildOutputGroup(assembled)] },
    });
    publishConversationEvent(params.conversationId, "message.delta", {
      id: message.id,
      conversation: params.conversationId,
      conversationId: params.conversationId,
      role: message.role,
      messageType: message.message_type,
      content: assembled,
      metadata: message.metadata,
      designTaskId: params.task.id,
      createdAt: message.created_at,
    });
    publishConversationEvent(params.conversationId, "generation.result.updated", {
      messageId: message.id,
      taskId: params.task.id,
      status: "streaming",
    });
  };

  try {
    for await (const evt of flexionStream({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.55,
      max_tokens: 5200,
      providerConfig: params.providerConfig,
    })) {
      if (evt.type === "token") {
        assembled += evt.delta;
        tokenCounter += 1;
        if (tokenCounter % 16 === 0 && (await isCancelRequested(message.id))) {
          cancelled = true;
          break;
        }
        await publishStreamingResult(false);
      } else if (evt.type === "done") {
        usage = evt.usage;
        completionModel = evt.model;
      }
    }
  } catch (error) {
    // Streaming failed mid-flight — fall back to a non-streaming completion
    // so we still produce a deliverable rather than leaving a half-message.
    console.warn("[dispatchTextGeneration] streaming failed, falling back:", error);
    try {
      const completion = await flexionComplete({
        model: params.model,
        messages: [
          { role: "system", content: params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.55,
        providerConfig: params.providerConfig,
      });
      assembled = completion.text;
      usage = completion.usage;
      completionModel = completion.model;
    } catch (innerError) {
      const failed = await updateGenerationMessage(params.conversationId, message, {
        content: {
          ...baseContent,
          status: "failed",
          text: `生成失敗：${innerError instanceof Error ? innerError.message : "unknown"}`,
        } as Prisma.InputJsonValue,
        metadataMerge: {
          status: "failed",
          lastStatusAt: new Date().toISOString(),
          errorMessage: innerError instanceof Error ? innerError.message : "text generation failed",
          outputGroups: [],
        },
      });
      publishConversationEvent(params.conversationId, "generation.result.failed", {
        messageId: failed.id,
        taskId: params.task.id,
        status: "failed",
        errorMessage: innerError instanceof Error ? innerError.message : "text generation failed",
      });
      return {
        task: params.task,
        message: failed,
        usage,
        credits: BigInt(0),
        reused: false,
      };
    }
  }

  if (cancelled) {
    const cancelledMessage = await updateGenerationMessage(params.conversationId, message, {
      content: {
        ...baseContent,
        status: "cancelled",
        text: assembled,
      } as Prisma.InputJsonValue,
      metadataMerge: {
        status: "cancelled",
        lastStatusAt: new Date().toISOString(),
        outputGroups: assembled ? [buildOutputGroup(assembled)] : [],
        receivedOutputCount: assembled ? 1 : 0,
        pendingOutputs: 0,
        quickActions: [
          {
            type: "regenerate_design",
            label: "再試一次",
            value: params.instruction || "再試一次",
            action: "proceed_generate",
            taskId: params.task.id,
            sourceMessageId: message.id,
          },
        ],
      },
    });
    publishConversationEvent(params.conversationId, "generation.result.failed", {
      messageId: cancelledMessage.id,
      taskId: params.task.id,
      status: "cancelled",
    });
    return {
      task: params.task,
      message: cancelledMessage,
      usage,
      credits: BigInt(0),
      reused: false,
    };
  }

  await publishStreamingResult(true);
  const credits = rawToCredits(completionModel, usage, params.creditMultiplier);
  const outputGroup = buildOutputGroup(assembled);

  const [updatedTask, completedMessage] = await prisma.$transaction([
    prisma.designTask.update({
      where: { id: params.task.id },
      data: {
        execution_strategy: executionStrategy,
        status: DesignTaskStatus.completed,
        summary: cleanTaskSummary(params.task.summary) || null,
        last_activity_at: new Date(),
      },
    }),
    prisma.message.update({
      where: { id: message.id },
      data: {
        content: {
          type: "text_document",
          status: "completed",
          taskId: params.task.id,
          taskType: params.task.task_type,
          executionStrategy,
          domain,
          text: assembled,
        },
        metadata: {
          ...objectRecord(message.metadata),
          status: "completed",
          lastStatusAt: new Date().toISOString(),
          outputGroups: [outputGroup],
          expectedOutputCount: 1,
          receivedOutputCount: 1,
          pendingOutputs: 0,
          quickActions: [
            // {
            //   type: "regenerate_design",
            //   label: "再生一版",
            //   value: "再生一版，方向調整為：",
            //   action: "proceed_generate",
            //   taskId: params.task.id,
            //   sourceMessageId: message.id,
            // },
            // {
            //   type: "quick_reply",
            //   label: "調整內容",
            //   value: "我想調整內容：",
            //   action: "provide_core_info",
            //   taskId: params.task.id,
            //   sourceMessageId: message.id,
            // },
          ],
        } as Prisma.InputJsonValue,
        tokens_input: usage.input_tokens,
        tokens_output: usage.output_tokens,
        credits_used: credits,
        model: completionModel,
      },
    }),
    prisma.conversation.update({
      where: { id: params.conversationId },
      data: { last_message_at: new Date(), active_design_task_id: params.task.id },
    }),
  ]);

  publishConversationEvent(params.conversationId, "message.completed", shapeMessage(completedMessage));
  publishConversationEvent(params.conversationId, "generation.result.completed", {
    messageId: completedMessage.id,
    taskId: params.task.id,
    status: "completed",
    outputGroups: [outputGroup],
    receivedOutputCount: 1,
    pendingOutputs: 0,
  });

  return {
    task: updatedTask,
    message: completedMessage,
    usage,
    credits,
    reused: false,
  };
}
