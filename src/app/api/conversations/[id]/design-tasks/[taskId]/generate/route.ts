import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { DesignTaskStatus, MessageRole, MessageType } from "@prisma/client";

import { ApiError, handleError, ok } from "@/lib/api";
import { resolveRequestedModelConfig } from "@/lib/ai-model-settings";
import { assertCreditsAvailable, consumeCredits } from "@/lib/credits";
import { prisma } from "@/lib/db";
import { flexionStream, pickModel, rawToCredits, type FlexionRequest } from "@/lib/flexion";
import { generateSiteSchema, slugifySiteName } from "@/lib/site-builder";
import { dispatchImageGeneration, imageCreditCost } from "@/lib/conversation/generation-dispatcher";
import { dispatchTextGeneration } from "@/lib/conversation/dispatch/text-generation";
import { resolveSiblingParentMessageId } from "@/lib/conversation/active-path";
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

function textFromGenerationGroups(groups: unknown[], sourceVersionNumber?: number | null) {
  const candidates = groups
    .map((group) => (group && typeof group === "object" && !Array.isArray(group) ? (group as Record<string, unknown>) : null))
    .filter((group): group is Record<string, unknown> => Boolean(group))
    .filter((group) => {
      if (!sourceVersionNumber) return true;
      return Number(group.versionNumber) === sourceVersionNumber;
    });
  const group = candidates[candidates.length - 1];
  const items = Array.isArray(group?.items) ? group.items : [];
  const text = items
    .map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      return typeof record.content === "string" ? record.content : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return text.length > 6000 ? `${text.slice(0, 6000)}\n\n（前版內容已截斷，請保留其餘未被要求修改的結構與語氣。）` : text;
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

function outputGroupVersion(group: unknown) {
  const record = objectValue(group);
  const version = Number(record.versionNumber);
  return Number.isFinite(version) ? version : 0;
}

async function findGenerationResultMessage(conversationId: string, taskId: string) {
  return prisma.message.findFirst({
    where: {
      conversation_id: conversationId,
      design_task_id: taskId,
      message_type: MessageType.generation_result,
    },
    orderBy: { created_at: "asc" },
  });
}

function nextVersionFromMetadata(metadata: unknown) {
  const record = objectValue(metadata);
  const groups = Array.isArray(record.outputGroups) ? record.outputGroups : [];
  return Math.max(0, Number(record.versionNumber) || 0, ...groups.map(outputGroupVersion)) + 1;
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
        select: { id: true, metadata: true, parent_message_id: true },
      })
    : await prisma.message.findFirst({
        where: {
          conversation_id: params.conversationId,
          design_task_id: params.taskId,
          message_type: MessageType.generation_result,
        },
        orderBy: { created_at: "desc" },
        select: { id: true, metadata: true, parent_message_id: true },
      });

  if (!source) {
    const sourceUserOrAssistant = params.sourceMessageId
      ? await prisma.message.findFirst({
          where: {
            id: params.sourceMessageId,
            conversation_id: params.conversationId,
          },
          select: { id: true },
        })
      : null;
    if (sourceUserOrAssistant) {
      return {
        sourceMessageId: sourceUserOrAssistant.id,
        parentMessageId: sourceUserOrAssistant.id,
        rootMessageId: sourceUserOrAssistant.id,
        generationThreadId: randomUUID(),
        regenerated: false,
        parentVersionNumber: null,
      };
    }
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
  const siblingParentMessageId =
    source.parent_message_id ?? await resolveSiblingParentMessageId(params.conversationId, source.id);
  return {
    sourceMessageId: source.id,
    parentMessageId: siblingParentMessageId,
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

    // Resolve the conversation model lazily: only the text-delivery branch
    // actually consumes a text model, so the image branch never resolves
    // (and is never blocked by AI_MODEL_NOT_CONFIGURED), and the web branch
    // resolves defensively (see below).
    const resolveConversationModel = async () => {
      const subscription = await prisma.subscription.findUnique({
        where: { user_id: user.id },
        include: { plan: true },
      });
      const planCode = subscription?.plan.code ?? "free";
      const requestedModel =
        task.preferred_model ||
        conversation.ai_model ||
        pickModel({
          plan: planCode,
          taskHint: executionStrategy === "structured_text" ? "complex" : "normal",
        });
      return resolveRequestedModelConfig(planCode, requestedModel);
    };

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
    const sourceVersionNumber = Number(body.sourceVersionNumber);
    const normalizedSourceVersionNumber =
      Number.isFinite(sourceVersionNumber) && sourceVersionNumber > 0 ? sourceVersionNumber : null;

    if (domain === "web") {
      const sourceMessageForParent = sourceMessageId
        ? await prisma.message.findFirst({
            where: { id: sourceMessageId, conversation_id: params.id },
            select: { id: true, message_type: true },
          })
        : null;
      const generationParentMessageId =
        sourceMessageForParent?.message_type === MessageType.generation_result
          ? await resolveSiblingParentMessageId(params.id, sourceMessageForParent.id)
          : sourceMessageForParent?.id ?? null;
      const siteName = stringValue(
        mergedData,
        ["businessName", "brandName", "companyName", "siteName", "title"],
        task.title,
      );
      const productImageUrls = [
        ...stringArrayValue(mergedData.productImageUrls),
        ...stringArrayValue(mergedData.imageUrls),
      ].slice(0, 8);
      // Site/web generation does not depend on the conversation text model:
      // a missing model degrades to FALLBACK_SCHEMA rather than a 422. Resolve
      // the provider config defensively so generateSiteSchema uses DB config
      // when present, and swallow AI_MODEL_NOT_CONFIGURED otherwise.
      let siteProviderConfig: FlexionRequest["providerConfig"] | undefined;
      try {
        siteProviderConfig = (await resolveConversationModel()).providerConfig;
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== "AI_MODEL_NOT_CONFIGURED") throw err;
      }
      const siteSchema = await generateSiteSchema({
        business_name: siteName,
        description: stringValue(mergedData, ["description", "brandDescription", "mainContent"], task.summary ?? ""),
        industry: stringValue(mergedData, ["industry", "category"]),
        audience: stringValue(mergedData, ["targetAudience", "audience"]),
        goal: stringValue(mergedData, ["goal", "purpose"], instruction),
        product_notes: stringValue(mergedData, ["productNotes", "productInfo", "serviceInfo"], instruction),
        product_image_urls: productImageUrls,
        providerConfig: siteProviderConfig,
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
            parent_message_id: generationParentMessageId,
          },
        }),
        prisma.conversation.update({
          where: { id: params.id },
          data: { last_message_at: new Date(), active_design_task_id: task.id },
        }),
      ]);
      await prisma.conversation.update({
        where: { id: params.id },
        data: { active_leaf_message_id: message.id },
      });

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
        sourceVersionNumber: normalizedSourceVersionNumber,
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

    if (domain === "text") {
      const resolvedModel = await resolveConversationModel();
      const model = resolvedModel.model;
      const dispatched = await dispatchTextGeneration({
        conversationId: params.id,
        task,
        model,
        providerConfig: resolvedModel.providerConfig,
        creditMultiplier: resolvedModel.creditMultiplier,
        instruction,
        sourceMessageId,
        sourceVersionNumber: normalizedSourceVersionNumber,
        source: "design-task.generate",
      });
      if (!dispatched) throw new ApiError("BUSINESS_RULE_VIOLATION", "This task is not a text generation task");
      await consumeCredits(user.id, dispatched.credits);

      return ok({
        task: shapeDesignTask(dispatched.task),
        message: shapeMessage(dispatched.message),
        usage: dispatched.usage,
        credits: Number(dispatched.credits),
      });
    }

    // Legacy inline path retained for any non-image / non-text domain that
    // still reaches this route. Web is handled above; this is only a safety
    // net for domains added in the future.
    const existingMessage = await findGenerationResultMessage(params.id, task.id);
    const existingMetadata = objectValue(existingMessage?.metadata);
    const existingGroups = Array.isArray(existingMetadata.outputGroups) ? existingMetadata.outputGroups : [];
    const sourceText = domain === "text" && existingGroups.length > 0
      ? textFromGenerationGroups(existingGroups, normalizedSourceVersionNumber)
      : "";

    // Text delivery actually consumes a text model: resolve here so the
    // AI_MODEL_NOT_CONFIGURED (422) gate applies only to this branch.
    const resolvedModel = await resolveConversationModel();
    const model = resolvedModel.model;

    const prompt = [
      `任務：${task.title}`,
      `任務類型：${task.task_type}`,
      `模板：${schema.displayName}`,
      `交付策略：${executionStrategy}`,
      `需求資料：${jsonSummary(task.collected_data)}`,
      `已解析需求：${jsonSummary(task.resolved_requirements)}`,
      `缺少需求：${jsonSummary(task.missing_requirements)}`,
      normalizedSourceVersionNumber ? `本輪是針對第 ${normalizedSourceVersionNumber} 版做修改。` : "",
      sourceText ? `被修改的前版內容：\n${sourceText}` : "",
      instruction ? `補充指令：${instruction}` : "",
      isImageTask
        ? "請輸出可交給影像生成模型或設計師使用的完整影像 brief，包含主提示詞、構圖、文字內容、風格、色彩、尺寸/用途、避免事項。不要聲稱已產生圖片。"
        : sourceText
          ? "請輸出修正版文字成果。必須保留前版中使用者沒有要求修改的結構、語氣、段落與重點，只套用本輪指令要求的變更。"
          : "請輸出完整、具體、可直接交付或編輯的第一版文字成果。若仍缺關鍵資訊，請列出合理假設後繼續產出。",
    ]
      .filter(Boolean)
      .join("\n\n");

    const versionNumber = existingMessage ? nextVersionFromMetadata(existingMessage.metadata) : await nextGenerationVersion(params.id, task.id);
    const lineage = await generationLineage({
      conversationId: params.id,
      taskId: task.id,
      sourceMessageId,
    });
    const generationId = randomUUID();
    const buildOutputGroup = (content: string) => ({
      kind: "text",
      title: `第 ${versionNumber} 版內容`,
      versionNumber,
      generationId,
      items: [
        {
          id: `${generationId}-text-1`,
          label: task.title,
          content,
        },
      ],
    });
    let assembled = "";
    let usage = { input_tokens: 0, output_tokens: 0 };
    let completionModel = model;
    let lastPublishedAt = 0;
    const baseContent = {
      type: isImageTask ? "image_brief" : "text_document",
      status: "streaming",
      taskId: task.id,
      taskType: task.task_type,
      executionStrategy,
      domain: isImageTask ? "image" : "text",
      text: "",
    };
    const baseMetadata = {
      ...existingMetadata,
      type: "generation_result",
      source: "design-task.generate",
      domain: isImageTask ? "image" : "text",
      generationId,
      taskId: task.id,
      taskType: task.task_type,
      templateKey: task.template_key || task.task_type,
      templateLabel: task.template_label || task.title,
      executionStrategy,
      status: "streaming",
      versionNumber,
      ...lineage,
      outputGroups: [...existingGroups, buildOutputGroup("")],
      expectedOutputCount: 1,
      receivedOutputCount: 0,
      pendingOutputs: 1,
    };

    let message = await prisma.message.create({
      data: {
        conversation_id: params.id,
        role: MessageRole.assistant,
        message_type: MessageType.generation_result,
        design_task_id: task.id,
        content: baseContent,
        metadata: baseMetadata,
        tokens_input: 0,
        tokens_output: 0,
        credits_used: BigInt(0),
        model,
        parent_message_id: lineage.parentMessageId,
      },
    });
    await prisma.conversation.update({
      where: { id: params.id },
      data: { active_leaf_message_id: message.id },
    });
    publishConversationEvent(params.id, "message.created", shapeMessage(message));

    const publishStreamingResult = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastPublishedAt < 320) return;
      lastPublishedAt = now;
      message = await prisma.message.update({
        where: { id: message.id },
        data: {
          content: {
            ...baseContent,
            text: assembled,
          },
          metadata: {
            ...baseMetadata,
            outputGroups: [...existingGroups, buildOutputGroup(assembled)],
          },
        },
      });
      publishConversationEvent(params.id, "message.updated", shapeMessage(message));
      publishConversationEvent(params.id, "generation.result.updated", {
        messageId: message.id,
        taskId: task.id,
        status: "streaming",
      });
    };

    for await (const evt of flexionStream({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: domain === "text" ? 5200 : 2200,
      providerConfig: resolvedModel.providerConfig,
    })) {
      if (evt.type === "token") {
        assembled += evt.delta;
        await publishStreamingResult(false);
      } else if (evt.type === "done") {
        usage = evt.usage;
        completionModel = evt.model;
      }
    }
    await publishStreamingResult(true);
    const credits = rawToCredits(completionModel, usage, resolvedModel.creditMultiplier);
    const outputGroup = buildOutputGroup(assembled);

    const [updatedTask, completedMessage] = await prisma.$transaction([
      prisma.designTask.update({
        where: { id: task.id },
        data: {
          execution_strategy: executionStrategy,
          status: DesignTaskStatus.completed,
          summary: cleanTaskSummary(task.summary) || null,
          last_activity_at: new Date(),
        },
      }),
      prisma.message.update({
            where: { id: message.id },
            data: {
              content: {
                type: isImageTask ? "image_brief" : "text_document",
                status: "completed",
                taskId: task.id,
                taskType: task.task_type,
                executionStrategy,
                domain: isImageTask ? "image" : "text",
                text: assembled,
              },
              metadata: {
                ...existingMetadata,
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
                outputGroups: [...existingGroups, outputGroup],
                expectedOutputCount: 1,
                receivedOutputCount: 1,
                pendingOutputs: 0,
                quickActions: [
                  // {
                  //   type: "regenerate_design",
                  //   label: "再生一版",
                  //   value: "再生一版，方向調整為：",
                  //   action: "proceed_generate",
                  //   taskId: task.id,
                  //   sourceMessageId: message.id,
                  // },
                  // {
                  //   type: "quick_reply",
                  //   label: "調整內容",
                  //   value: "我想調整內容：",
                  //   action: "provide_core_info",
                  //   taskId: task.id,
                  //   sourceMessageId: message.id,
                  // },
                ],
              },
              tokens_input: usage.input_tokens,
              tokens_output: usage.output_tokens,
              credits_used: credits,
              model: completionModel,
            },
          }),
      prisma.conversation.update({
        where: { id: params.id },
        data: {
          last_message_at: new Date(),
          active_design_task_id: task.id,
          active_leaf_message_id: message.id,
        },
      }),
    ]);

    await consumeCredits(user.id, credits);
    publishConversationEvent(params.id, "message.completed", shapeMessage(completedMessage));
    publishConversationEvent(params.id, "generation.result.completed", {
      messageId: completedMessage.id,
      taskId: task.id,
      status: "completed",
    });

    return ok({
      task: shapeDesignTask(updatedTask),
      message: shapeMessage(completedMessage),
      usage,
      credits: Number(credits),
    });
  } catch (err) {
    return handleError(err);
  }
}
