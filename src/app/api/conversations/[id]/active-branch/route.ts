import { NextRequest } from "next/server";

import { ApiError, handleError, ok } from "@/lib/api";
import { getOwnedConversation, requireSessionUser, shapeMessageWithSiblings } from "@/lib/conversation/api";
import { loadActivePathMessages, resolveDeepestLeaf } from "@/lib/conversation/active-path";
import { prisma } from "@/lib/db";
import { publishConversationEvent } from "@/lib/conversation/stream";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);
    const body = (await req.json()) as { messageId?: string };
    const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
    if (!messageId) throw new ApiError("VALIDATION_ERROR", "messageId is required");

    const message = await prisma.message.findFirst({
      where: { id: messageId, conversation_id: params.id },
      select: { id: true },
    });
    if (!message) throw new ApiError("RESOURCE_NOT_FOUND", "Message not found");

    const leafId = await resolveDeepestLeaf(params.id, message.id);
    await prisma.conversation.update({
      where: { id: params.id },
      data: { active_leaf_message_id: leafId },
    });

    const activePath = await loadActivePathMessages(params.id);
    const messages = activePath.messages.map((item) =>
      shapeMessageWithSiblings(
        item,
        activePath.metaById.get(item.id) ?? { count: 1, index: 0, ids: [item.id] },
      ),
    );

    publishConversationEvent(params.id, "active_branch.changed", {
      conversationId: params.id,
      activeLeafMessageId: leafId,
      messages,
    });

    return ok({ activeLeafMessageId: leafId, messages });
  } catch (err) {
    return handleError(err);
  }
}
