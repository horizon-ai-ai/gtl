import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { DesignTaskStatus, MessageRole, MessageType } from "@prisma/client";

import { ApiError, handleError, ok } from "@/lib/api";
import { assertCreditsAvailable, consumeCredits } from "@/lib/credits";
import { prisma } from "@/lib/db";
import { flexionComplete, pickModel, rawToCredits } from "@/lib/flexion";
import { generateSiteSchema, slugifySiteName } from "@/lib/site-builder";
import { dispatchImageGeneration, imageCreditCost } from "@/lib/conversation/generation-dispatcher";
import { publishConversationEvent } from "@/lib/conversation/stream";
import {
  getOwnedConversation,
  parseExecutionStrategy,
  requireSessionUser,
  shapeDesignTask,
  shapeMessage,
} from "@/lib/conversation/api";
import {
  getSchema,
  resolveDefaultExecutionStrategy,
  resolveTaskDomain,
} from "@/lib/conversation/schema-registry";
import { cleanTaskSummary } from "@/lib/project-brief";

const SYSTEM_PROMPT =
  "你是 Marketing AI Platform 的資深行銷與設計交付顧問。請使用繁體中文，根據任務資料產出可直接交付給客戶或設計師執行的內容。";

function jsonSummary(value: unknown) {
  if (!value) return "無";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(record: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

async function uniqueSiteSlug(name: string) {
  const baseSlug = slugifySiteName(name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.site.findUnique({ where: { slug } })) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
  return slug;
}

async function nextGenerationVersion(conversationId: string, taskId: string) {
  const messages = await prisma.message.findMany({
    where: {
      conversation_id: conversationId,
      design_task_id: taskId,
      message_type: MessageType.generation_result,
    },
    select: { metadata: true },
    take: 100,
  });
  let maxVersion = 0;
  for (const message of messages) {
    const metadata = objectValue(message.metadata);
    const version = Number(metadata.versionNumber);
    if (Number.isFinite(version)) maxVersion = Math.max(maxVersion, version);
  }
  return maxVersion + 1;
}

async function generationLineage(params: {
  conversationId: string;
  taskId: string;
  sourceMessageId?: string | null;
}) {
  const source = params.sourceMessageId
    ? await prisma.message.findFirst({
        where: {
          id: params.sourceMessageId,
          conversation_id: params.conversationId,
          design_task_id: params.taskId,
          message_type: MessageType.generation_result,
        },
        select: { id: true, metadata: true },
      })
    : await prisma.message.findFirst({
        where: {
          conversation_id: params.conversationId,
          design_task_id: params.taskId,
          message_type: MessageType.generation_result,
        },
        orderBy: { created_at: "desc" },
        select: { id: true, metadata: true },
      });

  if (!source) {
    return {
      sourceMessageId: null,
      parentMessageId: null,
      rootMessageId: null,
      generationThreadId: randomUUID(),
      regenerated: false,
      parentVersionNumber: null,
    };
  }

  const metadata = objectValue(source.metadata);
  const rootMessageId = stringValue(metadata, ["rootMessageId"], source.id);
  return {
    sourceMessageId: source.id,
    parentMessageId: source.id,
    rootMessageId,
    generationThreadId: stringValue(metadata, ["generationThreadId"], rootMessageId),
    regenerated: true,
    parentVersionNumber: Number.isFinite(Number(metadata.versionNumber))
      ? Number(metadata.versionNumber)
      : null,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; taskId: string } },
) {
  try {
    const user = await requireSessionUser();
    const conversation = await getOwnedConversation(params.id, user.id);
    const task = await prisma.designTask.findFirst({
      where: { id: params.taskId, conversation_id: params.id, user_id: user.id },
    });
    if (!task) throw new ApiError("RESOURCE_NOT_FOUND", "Design task not found");

    const domain = resolveTaskDomain(task.task_type);
    // Image generation has a fixed, known cost — require the full amount
    // before dispatching any paid work. Other domains keep the
    // positive-balance check (their cost is only known after the call).
    await assertCreditsAvailable(
      user.id,
      domain === "image" ? imageCreditCost(Math.max(1, task.output_count || 1)) : undefined,
    );

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedExecutionStrategy = parseExecutionStrategy(body.executionStrategy);
    const executionStrategy =
      requestedExecutionStrategy ||
      task.execution_strategy ||
      resolveDefaultExecutionStrategy(task.task_type);
    const schema = await getSchema(task.task_type);

    const subscription = await prisma.subscription.findUnique({
      where: { user_id: user.id },
      include: { plan: true },
    });
    const model =
      task.preferred_model ||
      conversation.ai_model ||
      pickModel({
        plan: subscription?.plan.code ?? "free",
        taskHint: executionStrategy === "structured_text" ? "complex" : "normal",
      });

    const collected = objectValue(task.collected_data);
    const resolved = objectValue(task.resolved_requirements);
    const mergedData = { ...collected, ...resolved };
    const instruction =
      typeof body.instruction === "string" && body.instruction.trim()
        ? body.instruction.trim()
        : "";
    const sourceMessageId =
      typeof body.sourceMessageId === "string" && body.sourceMessageId.trim()
        ? body.sourceMessageId.trim()
        : null;

    if (domain === "web") {
      const siteName = stringValue(
        mergedData,
        ["businessName", "brandName", "companyName", "siteName", "title"],
        task.title,
      );
      const productImageUrls = [
        ...stringArrayValue(mergedData.productImageUrls),
        ...stringArrayValue(mergedData.imageUrls),
      ].slice(0, 8);
      const siteSchema = await generateSiteSchema({
        business_name: siteName,
        description: stringValue(mergedData, ["description", "brandDescription", "mainContent"], task.summary ?? ""),
        industry: stringValue(mergedData, ["industry", "category"]),
        audience: stringValue(mergedData, ["targetAudience", "audience"]),
        goal: stringValue(mergedData, ["goal", "purpose"], instruction),
        product_notes: stringValue(mergedData, ["productNotes", "productInfo", "serviceInfo"], instruction),
        product_image_urls: productImageUrls,
      });

      let site:
        | {
            id: string;
            slug: string;
            name: string;
            current_version_id: string | null;
          }
        | null = null;

      if (body.createSite !== false) {
        const slug = await uniqueSiteSlug(siteName);
        const created = await prisma.site.create({
          data: {
            user_id: user.id,
            slug,
            name: siteName,
            description: siteSchema.tagline,
            theme: { primary_color: siteSchema.primary_color },
            versions: {
              create: {
                version: 1,
                schema: siteSchema,
              },
            },
          },
          include: { versions: true },
        });
        const version = created.versions[0];
        if (version) {
          const updated = await prisma.site.update({
            where: { id: created.id },
            data: { current_version_id: version.id },
          });
          site = {
            id: updated.id,
            slug: updated.slug,
            name: updated.name,
            current_version_id: updated.current_version_id,
          };
        }
      }

      const [updatedTask, message] = await prisma.$transaction([
        prisma.designTask.update({
          where: { id: task.id },
          data: {
            execution_strategy: executionStrategy,
            status: DesignTaskStatus.completed,
            summary: cleanTaskSummary(task.summary) || null,
            last_activity_at: new Date(),
          },
        }),
        prisma.message.create({
          data: {
            conversation_id: params.id,
            role: MessageRole.assistant,
            message_type: MessageType.generation_result,
            design_task_id: task.id,
            content: {
              type: "site_schema",
              status: "completed",
              taskId: task.id,
              taskType: task.task_type,
              executionStrategy,
              site,
              schema: siteSchema,
            },
            metadata: {
              source: "design-task.generate",
              domain: "web",
            },
            model: "site-builder",
          },
        }),
        prisma.conversation.update({
          where: { id: params.id },
          data: { last_message_at: new Date(), active_design_task_id: task.id },
        }),
      ]);

      return ok({
        task: shapeDesignTask(updatedTask),
        message: shapeMessage(message),
        site,
        usage: { input_tokens: 0, output_tokens: 0 },
        credits: 0,
      });
    }

    const isImageTask = domain === "image";
    if (isImageTask) {
      const dispatched = await dispatchImageGeneration({
        conversationId: params.id,
        userId: user.id,
        task,
        instruction,
        sourceMessageId,
      });
      if (!dispatched) throw new ApiError("BUSINESS_RULE_VIOLATION", "This task is not an image generation task");
      await consumeCredits(user.id, dispatched.credits);

      return ok({
        task: shapeDesignTask(dispatched.task),
        message: shapeMessage(dispatched.message),
        usage: { input_tokens: 0, output_tokens: 0 },
        credits: Number(dispatched.credits),
      });
    }
    const prompt = [
      `任務：${task.title}`,
      `任務類型：${task.task_type}`,
      `模板：${schema.displayName}`,
      `交付策略：${executionStrategy}`,
      `需求資料：${jsonSummary(task.collected_data)}`,
      `已解析需求：${jsonSummary(task.resolved_requirements)}`,
      `缺少需求：${jsonSummary(task.missing_requirements)}`,
      instruction ? `補充指令：${instruction}` : "",
      isImageTask
        ? "請輸出可交給影像生成模型或設計師使用的完整影像 brief，包含主提示詞、構圖、文字內容、風格、色彩、尺寸/用途、避免事項。不要聲稱已產生圖片。"
        : "請輸出完整、具體、可直接交付或編輯的第一版文字成果。若仍缺關鍵資訊，請列出合理假設後繼續產出。",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await flexionComplete({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1800,
    });
    const credits = rawToCredits(result.model, result.usage);
    const versionNumber = await nextGenerationVersion(params.id, task.id);
    const lineage = await generationLineage({
      conversationId: params.id,
      taskId: task.id,
      sourceMessageId,
    });
    const generationId = randomUUID();

    const [updatedTask, message] = await prisma.$transaction([
      prisma.designTask.update({
        where: { id: task.id },
        data: {
          execution_strategy: executionStrategy,
          status: DesignTaskStatus.completed,
          summary: cleanTaskSummary(task.summary) || null,
          last_activity_at: new Date(),
        },
      }),
      prisma.message.create({
        data: {
          conversation_id: params.id,
          role: MessageRole.assistant,
          message_type: MessageType.generation_result,
          design_task_id: task.id,
          content: {
            type: isImageTask ? "image_brief" : "text_document",
            status: "completed",
            taskId: task.id,
            taskType: task.task_type,
            executionStrategy,
            domain: isImageTask ? "image" : "text",
            text: result.text,
          },
          metadata: {
            type: "generation_result",
            source: "design-task.generate",
            domain: isImageTask ? "image" : "text",
            generationId,
            taskId: task.id,
            taskType: task.task_type,
            templateKey: task.template_key || task.task_type,
            templateLabel: task.template_label || task.title,
            executionStrategy,
            status: "completed",
            versionNumber,
            ...lineage,
            outputGroups: [
              {
                kind: "text",
                title: `第 ${versionNumber} 版內容`,
                items: [
                  {
                    id: `${generationId}-text-1`,
                    label: task.title,
                    content: result.text,
                  },
                ],
              },
            ],
            expectedOutputCount: 1,
            receivedOutputCount: 1,
            pendingOutputs: 0,
            quickActions: [
              {
                type: "regenerate_design",
                label: "再生一版",
                value: "再生一版，方向調整為：",
                action: "proceed_generate",
                taskId: task.id,
              },
              {
                type: "quick_reply",
                label: "調整內容",
                value: "我想調整內容：",
                action: "provide_core_info",
                taskId: task.id,
              },
            ],
          },
          tokens_input: result.usage.input_tokens,
          tokens_output: result.usage.output_tokens,
          credits_used: credits,
          model: result.model,
        },
      }),
      prisma.conversation.update({
        where: { id: params.id },
        data: { last_message_at: new Date(), active_design_task_id: task.id },
      }),
    ]);

    await consumeCredits(user.id, credits);
    publishConversationEvent(params.id, "message.completed", shapeMessage(message));
    publishConversationEvent(params.id, "generation.result.completed", {
      messageId: message.id,
      taskId: task.id,
      status: "completed",
    });

    return ok({
      task: shapeDesignTask(updatedTask),
      message: shapeMessage(message),
      usage: result.usage,
      credits: Number(credits),
    });
  } catch (err) {
    return handleError(err);
  }
}
