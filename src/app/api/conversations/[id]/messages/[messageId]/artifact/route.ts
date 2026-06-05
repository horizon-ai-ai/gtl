import { NextRequest } from "next/server";

import { ApiError, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getOwnedConversation, requireSessionUser } from "@/lib/conversation/api";

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string; messageId: string } },
) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);

    const message = await prisma.message.findFirst({
      where: {
        id: params.messageId,
        conversation_id: params.id,
      },
      include: {
        design_task: true,
      },
    });
    if (!message) throw new ApiError("RESOURCE_NOT_FOUND", "Message not found");

    const content = message.content as Record<string, unknown> | string;
    const artifact =
      typeof content === "object" && content?.type === "generation_result"
        ? content
        : {
            type: "message",
            text:
              typeof content === "string"
                ? content
                : typeof content?.text === "string"
                  ? content.text
                  : JSON.stringify(content),
          };

    return ok({
      messageId: message.id,
      conversationId: message.conversation_id,
      designTaskId: message.design_task_id,
      task: message.design_task,
      artifact,
      metadata: message.metadata,
      createdAt: message.created_at,
    });
  } catch (err) {
    return handleError(err);
  }
}
