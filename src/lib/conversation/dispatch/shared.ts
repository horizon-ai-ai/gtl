import { createHash, randomUUID } from "crypto";
import { MessageRole, MessageType, type Message, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { shapeMessage } from "@/lib/conversation/api";
import { appendMessage, resolveSiblingParentMessageId } from "@/lib/conversation/active-path";
import { publishConversationEvent } from "@/lib/conversation/stream";

export type GenerationLineage = {
  sourceMessageId: string | null;
  parentMessageId: string | null;
  rootMessageId: string | null;
  generationThreadId: string;
  regenerated: boolean;
  parentVersionNumber: number | null;
};

export function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(record: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

export function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

export function generationMarkerId(conversationId: string, taskId: string, versionNumber: number) {
  // Deterministic UUID-shaped id so concurrent dispatches collide on the
  // primary key. Only one create wins; the other reuses the existing row.
  const hash = createHash("sha256")
    .update(`generation:${conversationId}:${taskId}:v${versionNumber}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export async function nextGenerationVersion(conversationId: string, taskId: string) {
  const messages = await prisma.message.findMany({
    where: {
      conversation_id: conversationId,
      design_task_id: taskId,
      message_type: MessageType.generation_result,
    },
    select: { metadata: true },
    take: 200,
  });
  let maxVersion = 0;
  for (const message of messages) {
    const version = Number(objectRecord(message.metadata).versionNumber);
    if (Number.isFinite(version)) maxVersion = Math.max(maxVersion, version);
  }
  return maxVersion + 1;
}

export async function resolveGenerationLineage(params: {
  conversationId: string;
  taskId: string;
  sourceMessageId?: string | null;
}): Promise<GenerationLineage> {
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
      const generationThreadId = randomUUID();
      return {
        sourceMessageId: sourceUserOrAssistant.id,
        parentMessageId: sourceUserOrAssistant.id,
        rootMessageId: sourceUserOrAssistant.id,
        generationThreadId,
        regenerated: false,
        parentVersionNumber: null,
      };
    }
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

  const metadata = objectRecord(source.metadata);
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

export type CreateGenerationPlaceholderParams = {
  conversationId: string;
  taskId: string;
  taskType: string;
  templateKey: string | null;
  templateLabel: string | null;
  executionStrategy: string;
  domain: "image" | "text" | "web";
  versionNumber: number;
  expectedOutputCount: number;
  lineage: GenerationLineage;
  generationId: string;
  initialContent: Prisma.InputJsonValue;
  initialMetadataExtras?: Record<string, unknown>;
  initialStatus?: "queued" | "streaming";
  model?: string;
};

/**
 * Append-only placeholder: every dispatch creates a NEW generation_result
 * message. Concurrent dispatchers race on the deterministic marker id so only
 * one row wins; the other reuses the winner instead of double-billing.
 */
export async function createGenerationPlaceholder(params: CreateGenerationPlaceholderParams) {
  const markerId = generationMarkerId(params.conversationId, params.taskId, params.versionNumber);
  const metadata = {
    type: "generation_result",
    source: "conversation.dispatcher",
    domain: params.domain,
    generationId: params.generationId,
    taskId: params.taskId,
    taskType: params.taskType,
    templateKey: params.templateKey || params.taskType,
    templateLabel: params.templateLabel || params.taskType,
    executionStrategy: params.executionStrategy,
    status: params.initialStatus ?? "queued",
    versionNumber: params.versionNumber,
    sourceMessageId: params.lineage.sourceMessageId,
    parentMessageId: params.lineage.parentMessageId,
    rootMessageId: params.lineage.rootMessageId,
    generationThreadId: params.lineage.generationThreadId,
    regenerated: params.lineage.regenerated,
    parentVersionNumber: params.lineage.parentVersionNumber,
    expectedOutputCount: params.expectedOutputCount,
    receivedOutputCount: 0,
    pendingOutputs: params.expectedOutputCount,
    outputGroups: [],
    ...(params.initialMetadataExtras ?? {}),
  } satisfies Record<string, unknown>;

  try {
    const message = await appendMessage(
      params.conversationId,
      {
        id: markerId,
        role: MessageRole.assistant,
        message_type: MessageType.generation_result,
        design_task_id: params.taskId,
        content: params.initialContent,
        metadata: metadata as Prisma.InputJsonValue,
        model: params.model,
      },
      // Null lineage parent (no source message) falls back to the default
      // append rules so the placeholder always joins the active path.
      { parentMessageId: params.lineage.parentMessageId ?? undefined },
    );
    publishConversationEvent(params.conversationId, "message.created", shapeMessage(message));
    publishConversationEvent(params.conversationId, "generation.result.updated", {
      messageId: message.id,
      taskId: params.taskId,
      status: metadata.status,
    });
    return { message, reused: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await prisma.message.findUnique({ where: { id: markerId } });
      if (existing) return { message: existing, reused: true };
    }
    throw error;
  }
}

export async function updateGenerationMessage(
  conversationId: string,
  message: Message,
  data: {
    content?: Prisma.InputJsonValue;
    metadataMerge?: Record<string, unknown>;
    tokens_input?: number;
    tokens_output?: number;
    credits_used?: bigint;
    model?: string;
  },
  options?: { publish?: boolean; eventType?: "message.updated" | "message.completed" },
) {
  const existingMetadata = objectRecord(message.metadata);
  // Merge-safe against a concurrent cancel: the in-memory snapshot may predate
  // the cancel route's metadata write, and writing the snapshot back would
  // silently erase the cancelRequested flag mid-stream. Re-read the current
  // row and preserve the cancellation fields over both the snapshot and the
  // caller's merge.
  const currentRow = await prisma.message.findUnique({
    where: { id: message.id },
    select: { metadata: true },
  });
  const currentMetadata = objectRecord(currentRow?.metadata);
  const cancellationFields: Record<string, unknown> = {};
  if (currentMetadata.cancelRequested === true) {
    cancellationFields.cancelRequested = true;
    if (currentMetadata.cancelRequestedAt !== undefined) {
      cancellationFields.cancelRequestedAt = currentMetadata.cancelRequestedAt;
    }
  }
  const nextMetadata = {
    ...existingMetadata,
    ...(data.metadataMerge ?? {}),
    ...cancellationFields,
  };
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      ...(data.content ? { content: data.content } : {}),
      metadata: nextMetadata as Prisma.InputJsonValue,
      ...(data.tokens_input !== undefined ? { tokens_input: data.tokens_input } : {}),
      ...(data.tokens_output !== undefined ? { tokens_output: data.tokens_output } : {}),
      ...(data.credits_used !== undefined ? { credits_used: data.credits_used } : {}),
      ...(data.model ? { model: data.model } : {}),
    },
  });
  if (options?.publish !== false) {
    publishConversationEvent(conversationId, options?.eventType ?? "message.updated", shapeMessage(updated));
  }
  return updated;
}

/**
 * Single-shot cancel check. Re-reads the message metadata.cancelRequested
 * flag. The streaming loop should call this every N tokens, NOT after every
 * single token (DB cost). N=16 is a good middle ground.
 */
export async function isCancelRequested(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { metadata: true },
  });
  if (!message) return false;
  return objectRecord(message.metadata).cancelRequested === true;
}
