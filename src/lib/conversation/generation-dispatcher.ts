import { randomUUID } from "crypto";
import { DesignTaskStatus, MessageRole, MessageType, type DesignTask, type Prisma } from "@prisma/client";

import { generateBananaImages } from "@/lib/banana-image";
import { prisma } from "@/lib/db";
import { resolveDefaultExecutionStrategy, resolveTaskDomain } from "@/lib/conversation/schema-registry";
import { shapeMessage } from "@/lib/conversation/api";
import { publishConversationEvent } from "@/lib/conversation/stream";
import { cleanTaskSummary } from "@/lib/project-brief";

type DispatchParams = {
  conversationId: string;
  userId: string;
  task: DesignTask;
  instruction?: string;
  sourceMessageId?: string | null;
};

function objectRecord(value: unknown): Record<string, unknown> {
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

function collectReferenceImages(task: DesignTask) {
  const collected = objectRecord(task.collected_data);
  const resolved = objectRecord(task.resolved_requirements);
  return [
    ...stringArrayValue(collected.referenceImages),
    ...stringArrayValue(collected.visual_references),
    ...stringArrayValue(collected.imageUrls),
    ...stringArrayValue(collected.images),
    ...stringArrayValue(resolved.referenceImages),
    ...stringArrayValue(resolved.visual_references),
    ...stringArrayValue(resolved.imageUrls),
    ...stringArrayValue(resolved.images),
  ]
    .filter((url) => url.startsWith("http"))
    .slice(0, 8);
}

function collectImageUrlsFromMessage(message: { metadata: Prisma.JsonValue }) {
  const metadata = objectRecord(message.metadata);
  const urls: string[] = [];
  const generatedImages = Array.isArray(metadata.generatedImages) ? metadata.generatedImages : [];
  for (const value of generatedImages) {
    const image = objectRecord(value);
    const url = stringValue(image, ["url"]);
    if (url.startsWith("http") || url.startsWith("data:image")) urls.push(url);
  }

  const outputGroups = Array.isArray(metadata.outputGroups) ? metadata.outputGroups : [];
  for (const groupValue of outputGroups) {
    const group = objectRecord(groupValue);
    const items = Array.isArray(group.items) ? group.items : [group];
    for (const itemValue of items) {
      const item = objectRecord(itemValue);
      const url = stringValue(item, ["url", "imageUrl"]);
      if (url.startsWith("http") || url.startsWith("data:image")) urls.push(url);
    }
  }

  return urls;
}

async function collectPreviousGeneratedImages(conversationId: string, taskId: string) {
  const messages = await prisma.message.findMany({
    where: {
      conversation_id: conversationId,
      design_task_id: taskId,
      message_type: MessageType.generation_result,
    },
    orderBy: { created_at: "desc" },
    take: 6,
    select: { metadata: true },
  });

  const urls: string[] = [];
  for (const message of messages) {
    const metadata = objectRecord(message.metadata);
    if (metadata.status !== "completed") continue;
    for (const url of collectImageUrlsFromMessage(message)) {
      if (!urls.includes(url)) urls.push(url);
      if (urls.length >= 2) return urls;
    }
  }
  return urls;
}

async function resolveSourceGeneration(params: {
  conversationId: string;
  taskId: string;
  sourceMessageId?: string | null;
}) {
  if (params.sourceMessageId) {
    const source = await prisma.message.findFirst({
      where: {
        id: params.sourceMessageId,
        conversation_id: params.conversationId,
        design_task_id: params.taskId,
        message_type: MessageType.generation_result,
      },
      select: { id: true, metadata: true },
    });
    if (source) return source;
  }

  return prisma.message.findFirst({
    where: {
      conversation_id: params.conversationId,
      design_task_id: params.taskId,
      message_type: MessageType.generation_result,
    },
    orderBy: { created_at: "desc" },
    select: { id: true, metadata: true },
  });
}

function lineageMetadata(source: { id: string; metadata: Prisma.JsonValue } | null) {
  if (!source) {
    const generationThreadId = randomUUID();
    return {
      sourceMessageId: null,
      parentMessageId: null,
      rootMessageId: null,
      generationThreadId,
      regenerated: false,
      parentVersionNumber: null,
    };
  }

  const sourceMeta = objectRecord(source.metadata);
  const rootMessageId = stringValue(sourceMeta, ["rootMessageId"], source.id);
  return {
    sourceMessageId: source.id,
    parentMessageId: source.id,
    rootMessageId,
    generationThreadId: stringValue(sourceMeta, ["generationThreadId"], rootMessageId),
    regenerated: true,
    parentVersionNumber: Number.isFinite(Number(sourceMeta.versionNumber))
      ? Number(sourceMeta.versionNumber)
      : null,
  };
}

function buildBananaPrompt(task: DesignTask, instruction = "") {
  const collected = objectRecord(task.collected_data);
  const resolved = objectRecord(task.resolved_requirements);
  const merged = { ...collected, ...resolved };
  const brandName = stringValue(
    merged,
    ["brandName", "businessName", "companyName", "name"],
    task.title,
  );
  const industry = stringValue(merged, ["industry", "category", "productType"]);
  const style = stringValue(
    merged,
    ["style", "visualStyle", "tone", "brandPersonality"],
    "modern, professional, clean, memorable",
  );
  const colors = stringValue(merged, ["colors", "colorPalette", "preferredColors"]);

  return [
    "Create the actual first-version image for this design task, not a text proposal.",
    `Task type: ${task.task_type}.`,
    `Brand or subject: ${brandName}.`,
    industry ? `Industry or product: ${industry}.` : "",
    `Visual direction: ${style}.`,
    colors ? `Color preference: ${colors}.` : "",
    instruction ? `User instruction: ${instruction}.` : "",
    "If reference images are provided, treat them as the previous draft or visual reference. Preserve the requested palette/style when the user asks to keep it, while applying the requested edits.",
    "For logo tasks: generate a finished logo concept image with readable brand lettering when appropriate, strong silhouette, clean vector-like composition, commercial branding quality, centered layout, white or transparent-looking background.",
    "Avoid mockup pages, long explanations, UI screenshots, tables, and placeholder text.",
  ]
    .filter(Boolean)
    .join("\n");
}

function imageCreditCost(count: number) {
  const configured = Number(process.env.BANANA_IMAGE_CREDIT_COST || "20000");
  const safe = Number.isFinite(configured) && configured > 0 ? configured : 20000;
  return BigInt(safe * Math.max(1, count));
}

async function findInFlightGeneration(conversationId: string, taskId: string) {
  const recent = await prisma.message.findMany({
    where: {
      conversation_id: conversationId,
      design_task_id: taskId,
      message_type: MessageType.generation_result,
    },
    orderBy: { created_at: "desc" },
    take: 10,
  });

  return recent.find((message) => {
    const metadata = objectRecord(message.metadata);
    return metadata.status === "queued" || metadata.status === "processing";
  }) ?? null;
}

async function nextVersion(conversationId: string, taskId: string) {
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
    const version = Number(objectRecord(message.metadata).versionNumber);
    if (Number.isFinite(version)) maxVersion = Math.max(maxVersion, version);
  }
  return maxVersion + 1;
}

export async function dispatchImageGeneration(params: DispatchParams) {
  const domain = resolveTaskDomain(params.task.task_type);
  if (domain !== "image") return null;

  const inFlight = await findInFlightGeneration(params.conversationId, params.task.id);
  if (inFlight) return { message: inFlight, task: params.task, credits: BigInt(0), reused: true };

  const executionStrategy =
    params.task.execution_strategy ||
    resolveDefaultExecutionStrategy(params.task.task_type);
  const referenceImages = [
    ...collectReferenceImages(params.task),
    ...(await collectPreviousGeneratedImages(params.conversationId, params.task.id)),
  ].slice(0, 8);
  const versionNumber = await nextVersion(params.conversationId, params.task.id);
  const sourceGeneration = await resolveSourceGeneration({
    conversationId: params.conversationId,
    taskId: params.task.id,
    sourceMessageId: params.sourceMessageId,
  });
  const lineage = lineageMetadata(sourceGeneration);
  const generationId = randomUUID();

  const generationMessage = await prisma.message.create({
    data: {
      conversation_id: params.conversationId,
      role: MessageRole.assistant,
      message_type: MessageType.generation_result,
      design_task_id: params.task.id,
      content: {
        type: "image_generation",
        status: "queued",
        taskId: params.task.id,
        taskType: params.task.task_type,
        executionStrategy,
        domain,
        text: "已建立生成任務，準備使用 Banana 產生第一版圖像。",
        images: [],
      },
      metadata: {
        type: "generation_result",
        source: "conversation.generation-dispatcher",
        generationId,
        taskId: params.task.id,
        taskType: params.task.task_type,
        templateKey: params.task.template_key || params.task.task_type,
        templateLabel: params.task.template_label || params.task.title,
        executionStrategy,
        status: "queued",
        versionNumber,
        ...lineage,
        expectedOutputCount: Math.max(1, params.task.output_count || 1),
        receivedOutputCount: 0,
        pendingOutputs: Math.max(1, params.task.output_count || 1),
        outputGroups: [],
      } as Prisma.InputJsonValue,
    },
  });
  publishConversationEvent(params.conversationId, "message.created", shapeMessage(generationMessage));
  publishConversationEvent(params.conversationId, "generation.result.updated", {
    messageId: generationMessage.id,
    taskId: params.task.id,
    status: "queued",
  });

  try {
    const processingMessage = await prisma.message.update({
      where: { id: generationMessage.id },
      data: {
        metadata: {
          ...objectRecord(generationMessage.metadata),
          status: "processing",
          lastStatusAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    publishConversationEvent(params.conversationId, "message.updated", shapeMessage(processingMessage));
    publishConversationEvent(params.conversationId, "generation.result.updated", {
      messageId: processingMessage.id,
      taskId: params.task.id,
      status: "processing",
    });

    const images = await generateBananaImages({
      prompt: buildBananaPrompt(params.task, params.instruction),
      aspectRatio: stringValue(objectRecord(params.task.collected_data), ["aspectRatio"], "1:1"),
      referenceImages,
      count: params.task.output_count || 1,
      preferPro: referenceImages.length > 0,
    });
    const credits = imageCreditCost(images.length);
    const modelLabel = images[0]?.model === "gemini-3-pro-image-preview" ? "Banana Pro" : "Banana 2";
    const text = `已用 ${modelLabel} 產生第 ${versionNumber} 版圖像。你可以直接看圖，接著告訴我要調整字體、色彩、構圖或品牌感。`;
    const outputGroups = [
      {
        kind: "image",
        title: `第 ${versionNumber} 版圖像`,
        items: images.map((image, index) => ({
          id: `${generationId}-${index + 1}`,
          label: `圖像 ${index + 1}`,
          imageUrl: image.url,
          url: image.url,
          model: image.model,
        })),
      },
    ];

    const [updatedTask, updatedMessage] = await prisma.$transaction([
      prisma.designTask.update({
        where: { id: params.task.id },
        data: {
          execution_strategy: executionStrategy,
          preferred_model: images[0]?.model ?? params.task.preferred_model,
          status: DesignTaskStatus.completed,
          summary: cleanTaskSummary(params.task.summary) || null,
          last_activity_at: new Date(),
        },
      }),
      prisma.message.update({
        where: { id: generationMessage.id },
        data: {
          content: {
            type: "image_generation",
            status: "completed",
            taskId: params.task.id,
            taskType: params.task.task_type,
            executionStrategy,
            domain,
            text,
            images,
          },
          metadata: {
            ...objectRecord(generationMessage.metadata),
            status: "completed",
            lastStatusAt: new Date().toISOString(),
            generatedImages: images,
            outputGroups,
            receivedOutputCount: images.length,
            pendingOutputs: 0,
            quickActions: [
              {
                type: "regenerate_design",
                label: "再生一版",
                value: "再生一版，方向調整為：",
                action: "proceed_generate",
                taskId: params.task.id,
                sourceMessageId: generationMessage.id,
              },
              {
                type: "quick_reply",
                label: "調整方向",
                value: "我想調整方向：",
                action: "provide_core_info",
                taskId: params.task.id,
                sourceMessageId: generationMessage.id,
              },
            ],
          } as Prisma.InputJsonValue,
          credits_used: credits,
          model: images[0]?.model ?? "banana-image",
        },
      }),
      prisma.conversation.update({
        where: { id: params.conversationId },
        data: { last_message_at: new Date(), active_design_task_id: params.task.id },
      }),
    ]);
    publishConversationEvent(params.conversationId, "message.completed", shapeMessage(updatedMessage));
    publishConversationEvent(params.conversationId, "generation.result.completed", {
      messageId: updatedMessage.id,
      taskId: params.task.id,
      status: "completed",
      outputGroups,
      receivedOutputCount: images.length,
      pendingOutputs: 0,
    });

    return { task: updatedTask, message: updatedMessage, credits, reused: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation dispatch failed";
    const failedMessage = await prisma.message.update({
      where: { id: generationMessage.id },
      data: {
        content: {
          type: "image_generation",
          status: "failed",
          taskId: params.task.id,
          taskType: params.task.task_type,
          executionStrategy,
          domain,
          text: `生成失敗：${message}`,
          images: [],
        },
        metadata: {
          ...objectRecord(generationMessage.metadata),
          status: "failed",
          lastStatusAt: new Date().toISOString(),
          errorMessage: message,
          outputGroups: [],
          quickActions: [
            {
              type: "regenerate_design",
              label: "再試一次",
              value: params.instruction || "再試一次",
              action: "proceed_generate",
              taskId: params.task.id,
              sourceMessageId: generationMessage.id,
            },
          ],
        } as Prisma.InputJsonValue,
      },
    });
    publishConversationEvent(params.conversationId, "message.updated", shapeMessage(failedMessage));
    publishConversationEvent(params.conversationId, "generation.result.failed", {
      messageId: failedMessage.id,
      taskId: params.task.id,
      status: "failed",
      errorMessage: message,
    });
    return { task: params.task, message: failedMessage, credits: BigInt(0), reused: false };
  }
}
