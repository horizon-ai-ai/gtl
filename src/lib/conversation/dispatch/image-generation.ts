import { randomUUID } from "crypto";
import { DesignTaskStatus, MessageType, type DesignTask, type Prisma } from "@prisma/client";

import { generateBananaImages } from "@/lib/banana-image";
import { prisma } from "@/lib/db";
import { resolveDefaultExecutionStrategy, resolveTaskDomain } from "@/lib/conversation/schema-registry";
import { publishConversationEvent } from "@/lib/conversation/stream";
import { shapeMessage } from "@/lib/conversation/api";
import { cleanTaskSummary } from "@/lib/project-brief";

import {
  createGenerationPlaceholder,
  isCancelRequested,
  nextGenerationVersion,
  objectRecord,
  resolveGenerationLineage,
  stringValue,
  updateGenerationMessage,
} from "./shared";

export type DispatchImageGenerationParams = {
  conversationId: string;
  userId: string;
  task: DesignTask;
  instruction?: string;
  sourceMessageId?: string | null;
  sourceVersionNumber?: number | null;
};

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

function collectImageUrlsFromMessage(message: { metadata: Prisma.JsonValue }, versionNumber?: number | null) {
  const metadata = objectRecord(message.metadata);
  const urls: string[] = [];

  const outputGroups = Array.isArray(metadata.outputGroups) ? metadata.outputGroups : [];
  for (const groupValue of outputGroups) {
    const group = objectRecord(groupValue);
    if (versionNumber && Number(group.versionNumber) !== versionNumber) continue;
    const items = Array.isArray(group.items) ? group.items : [group];
    for (const itemValue of items) {
      const item = objectRecord(itemValue);
      const url = stringValue(item, ["url", "imageUrl"]);
      if (url.startsWith("http") || url.startsWith("data:image")) urls.push(url);
    }
  }

  if (urls.length > 0 || versionNumber) return urls;

  const generatedImages = Array.isArray(metadata.generatedImages) ? metadata.generatedImages : [];
  for (const value of generatedImages) {
    const image = objectRecord(value);
    const url = stringValue(image, ["url"]);
    if (url.startsWith("http") || url.startsWith("data:image")) urls.push(url);
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

async function resolveImageSourceGeneration(params: {
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

function isGenericRegenerationInstruction(instruction = "") {
  const text = instruction.trim();
  if (!text) return false;
  const genericSignals = ["再生一版", "重新產生一版", "重生", "再試一次"];
  const editSignals = ["調整", "修改", "改成", "換成", "替換", "修正", "保留", "不要", "改字", "改色", "字體", "色彩", "構圖"];
  return genericSignals.some((signal) => text.includes(signal)) &&
    !editSignals.some((signal) => text.includes(signal));
}

function buildBananaPrompt(
  task: DesignTask,
  instruction = "",
  sourceVersionNumber?: number | null,
  options?: { genericRegeneration?: boolean },
) {
  const collected = objectRecord(task.collected_data);
  const resolved = objectRecord(task.resolved_requirements);
  const merged = { ...collected, ...resolved };
  const genericRegeneration = options?.genericRegeneration === true;
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
    sourceVersionNumber
      ? genericRegeneration
        ? `This is a new alternative version after version ${sourceVersionNumber}. Keep the same brand requirements, but do not trace or copy the previous draft.`
        : `This is a revision of version ${sourceVersionNumber}. Use the supplied reference image from that version as the parent draft.`
      : "",
    instruction ? `User instruction: ${instruction}.` : "",
    genericRegeneration
      ? "For this regeneration, create a visibly different alternative concept. Change the symbol idea, layout rhythm, typography treatment, and composition enough that it is clearly a new option, while keeping the same brand name, industry, constraints, and overall quality bar."
      : "If reference images are provided, treat them as the previous draft or visual reference. Preserve all parts the user did not ask to change, especially palette, typography, composition, subject identity, and brand feel.",
    genericRegeneration
      ? "Do not make a near-identical copy of the previous generated logo. Use references only for requirements and brand context."
      : "Apply the user's edit semantically. If they ask to change wording, brand name, color, typography, layout, icon, or style, change only that scope and keep the rest consistent with the parent draft.",
    "For logo tasks: generate a finished logo concept image with readable brand lettering when appropriate, strong silhouette, clean vector-like composition, commercial branding quality, centered layout, white or transparent-looking background.",
    "Avoid mockup pages, long explanations, UI screenshots, tables, and placeholder text.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function imageCreditCost(count: number) {
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

export async function dispatchImageGeneration(params: DispatchImageGenerationParams) {
  const domain = resolveTaskDomain(params.task.task_type);
  if (domain !== "image") return null;

  const inFlight = await findInFlightGeneration(params.conversationId, params.task.id);
  if (inFlight) return { message: inFlight, task: params.task, credits: BigInt(0), reused: true };

  const executionStrategy =
    params.task.execution_strategy ||
    resolveDefaultExecutionStrategy(params.task.task_type);
  const versionNumber = await nextGenerationVersion(params.conversationId, params.task.id);
  const sourceGeneration = await resolveImageSourceGeneration({
    conversationId: params.conversationId,
    taskId: params.task.id,
    sourceMessageId: params.sourceMessageId,
  });
  const genericRegeneration = isGenericRegenerationInstruction(params.instruction);
  const previousDraftReferences = genericRegeneration
    ? []
    : [
        ...(sourceGeneration ? collectImageUrlsFromMessage(sourceGeneration, params.sourceVersionNumber) : []),
        ...(await collectPreviousGeneratedImages(params.conversationId, params.task.id)),
      ];
  const referenceImages = [
    ...collectReferenceImages(params.task),
    ...previousDraftReferences,
  ].slice(0, 8);
  const lineage = await resolveGenerationLineage({
    conversationId: params.conversationId,
    taskId: params.task.id,
    sourceMessageId: params.sourceMessageId,
  });
  const generationId = randomUUID();
  const expectedOutputCount = Math.max(1, params.task.output_count || 1);

  const placeholder = await createGenerationPlaceholder({
    conversationId: params.conversationId,
    taskId: params.task.id,
    taskType: params.task.task_type,
    templateKey: params.task.template_key,
    templateLabel: params.task.template_label || params.task.title,
    executionStrategy,
    domain: "image",
    versionNumber,
    expectedOutputCount,
    lineage,
    generationId,
    initialContent: {
      type: "image_generation",
      status: "queued",
      taskId: params.task.id,
      taskType: params.task.task_type,
      executionStrategy,
      domain: "image",
      text: `已建立第 ${versionNumber} 版生成任務。`,
      images: [],
    } as Prisma.InputJsonValue,
    initialStatus: "queued",
    initialMetadataExtras: { source: "conversation.generation-dispatcher" },
  });

  if (placeholder.reused) {
    return { task: params.task, message: placeholder.message, credits: BigInt(0), reused: true };
  }

  let message = placeholder.message;

  try {
    if (await isCancelRequested(message.id)) {
      const cancelled = await updateGenerationMessage(params.conversationId, message, {
        content: {
          type: "image_generation",
          status: "cancelled",
          taskId: params.task.id,
          taskType: params.task.task_type,
          executionStrategy,
          domain: "image",
          text: "生成已取消。",
          images: [],
        } as Prisma.InputJsonValue,
        metadataMerge: { status: "cancelled", lastStatusAt: new Date().toISOString() },
      });
      publishConversationEvent(params.conversationId, "generation.result.failed", {
        messageId: cancelled.id,
        taskId: params.task.id,
        status: "cancelled",
      });
      return { task: params.task, message: cancelled, credits: BigInt(0), reused: false };
    }

    message = await updateGenerationMessage(params.conversationId, message, {
      metadataMerge: { status: "processing", lastStatusAt: new Date().toISOString() },
    });
    publishConversationEvent(params.conversationId, "generation.result.updated", {
      messageId: message.id,
      taskId: params.task.id,
      status: "processing",
    });

    const images = await generateBananaImages({
      prompt: buildBananaPrompt(params.task, params.instruction, params.sourceVersionNumber, {
        genericRegeneration,
      }),
      aspectRatio: stringValue(objectRecord(params.task.collected_data), ["aspectRatio"], "1:1"),
      referenceImages,
      count: params.task.output_count || 1,
      preferPro: referenceImages.length > 0,
    });

    // Late cancel: provider already returned, but user pressed pause while we
    // waited. Mark cancelled and discard the result (don't write images/credits).
    if (await isCancelRequested(message.id)) {
      const cancelled = await updateGenerationMessage(params.conversationId, message, {
        content: {
          type: "image_generation",
          status: "cancelled",
          taskId: params.task.id,
          taskType: params.task.task_type,
          executionStrategy,
          domain: "image",
          text: "生成已取消，本次結果未保留。",
          images: [],
        } as Prisma.InputJsonValue,
        metadataMerge: { status: "cancelled", lastStatusAt: new Date().toISOString() },
      });
      publishConversationEvent(params.conversationId, "generation.result.failed", {
        messageId: cancelled.id,
        taskId: params.task.id,
        status: "cancelled",
      });
      return { task: params.task, message: cancelled, credits: BigInt(0), reused: false };
    }

    const credits = imageCreditCost(images.length);
    const modelLabel = images[0]?.model === "gemini-3-pro-image-preview" ? "Banana Pro" : "Banana 2";
    const text = `已用 ${modelLabel} 產生第 ${versionNumber} 版圖像。你可以直接看圖，接著告訴我要調整字體、色彩、構圖或品牌感。`;
    const outputGroup = {
      kind: "image",
      title: `第 ${versionNumber} 版圖像`,
      versionNumber,
      generationId,
      items: images.map((image, index) => ({
        id: `${generationId}-${index + 1}`,
        label: `圖像 ${index + 1}`,
        imageUrl: image.url,
        url: image.url,
        model: image.model,
      })),
    };

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
        where: { id: message.id },
        data: {
          content: {
            type: "image_generation",
            status: "completed",
            taskId: params.task.id,
            taskType: params.task.task_type,
            executionStrategy,
            domain: "image",
            text,
            images,
          },
          metadata: {
            ...objectRecord(message.metadata),
            status: "completed",
            lastStatusAt: new Date().toISOString(),
            generatedImages: images,
            outputGroups: [outputGroup],
            receivedOutputCount: images.length,
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
              //   label: "調整方向",
              //   value: "我想調整方向：",
              //   action: "provide_core_info",
              //   taskId: params.task.id,
              //   sourceMessageId: message.id,
              // },
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
      outputGroups: [outputGroup],
      receivedOutputCount: images.length,
      pendingOutputs: 0,
    });

    return { task: updatedTask, message: updatedMessage, credits, reused: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "generation dispatch failed";
    const failedMessage = await updateGenerationMessage(params.conversationId, message, {
      content: {
        type: "image_generation",
        status: "failed",
        taskId: params.task.id,
        taskType: params.task.task_type,
        executionStrategy,
        domain: "image",
        text: `生成失敗：${errorMessage}`,
        images: [],
      } as Prisma.InputJsonValue,
      metadataMerge: {
        status: "failed",
        lastStatusAt: new Date().toISOString(),
        errorMessage,
        outputGroups: [],
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
      messageId: failedMessage.id,
      taskId: params.task.id,
      status: "failed",
      errorMessage,
    });
    return { task: params.task, message: failedMessage, credits: BigInt(0), reused: false };
  }
}
