import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { handleError, ok, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getOwnedConversation, requireSessionUser, shapeMessage } from "@/lib/conversation/api";
import { publishConversationEvent } from "@/lib/conversation/stream";

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; messageId: string } },
) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);
    const message = await prisma.message.findFirst({
      where: { id: params.messageId, conversation_id: params.id },
    });
    if (!message) throw new ApiError("RESOURCE_NOT_FOUND", "Message not found");

    const metadata = objectRecord(message.metadata);
    const status = typeof metadata.status === "string" ? metadata.status : "";
    // Settled states are no-ops — don't flip a completed message to cancelled.
    if (status === "completed" || status === "failed" || status === "cancelled") {
      return ok({ message: shapeMessage(message), alreadySettled: true });
    }

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...metadata,
          cancelRequested: true,
          cancelRequestedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    publishConversationEvent(params.id, "message.updated", shapeMessage(updated));
    publishConversationEvent(params.id, "generation.result.updated", {
      messageId: updated.id,
      taskId: message.design_task_id,
      status: "cancelling",
    });
    return ok({ message: shapeMessage(updated), alreadySettled: false });
  } catch (err) {
    return handleError(err);
  }
}
