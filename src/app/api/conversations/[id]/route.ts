import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ApiError, ok, handleError } from "@/lib/api";
import {
  getOwnedConversation,
  requireSessionUser,
  shapeDesignTask,
  shapeMessageWithSiblings,
} from "@/lib/conversation/api";
import { loadActivePathMessages } from "@/lib/conversation/active-path";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    const c = await prisma.conversation.findFirst({
      where: { id: params.id, user_id: user.id, deleted_at: null },
      include: {
        design_tasks: { orderBy: [{ last_activity_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }] },
      },
    });
    if (!c) throw new ApiError("RESOURCE_NOT_FOUND", "Conversation not found");
    const activePath = await loadActivePathMessages(params.id);
    const activeTask =
      c.design_tasks.find((task) => task.id === c.active_design_task_id) ?? null;
    return ok({
      id: c.id,
      title: c.title,
      category: c.category,
      pinned: c.pinned,
      archived: c.archived,
      aiModel: c.ai_model,
      activeDesignTaskId: c.active_design_task_id,
      activeLeafMessageId: c.active_leaf_message_id,
      lastMessageAt: c.last_message_at,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      messages: activePath.messages.map((message) =>
        shapeMessageWithSiblings(
          message,
          activePath.metaById.get(message.id) ?? { count: 1, index: 0, ids: [message.id] },
        ),
      ),
      designTasks: c.design_tasks.map(shapeDesignTask),
      activeDesignTask: activeTask ? shapeDesignTask(activeTask) : null,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);
    const body = (await req.json()) as {
      title?: string;
      pinned?: boolean;
      archived?: boolean;
      aiModel?: string | null;
      activeDesignTaskId?: string | null;
      activeLeafMessageId?: string | null;
    };
    const data = {
      ...(typeof body.title === "string" ? { title: body.title.trim() || "新對話" } : {}),
      ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}),
      ...(typeof body.archived === "boolean" ? { archived: body.archived } : {}),
      ...(body.aiModel !== undefined
        ? { ai_model: typeof body.aiModel === "string" && body.aiModel.trim() ? body.aiModel.trim() : null }
        : {}),
      ...(body.activeDesignTaskId !== undefined
        ? { active_design_task_id: body.activeDesignTaskId || null }
        : {}),
      ...(body.activeLeafMessageId !== undefined
        ? { active_leaf_message_id: body.activeLeafMessageId || null }
        : {}),
    };
    const c = await prisma.conversation.update({
      where: { id: params.id },
      data,
    });
    return ok(c);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);
    await prisma.conversation.update({
      where: { id: params.id },
      data: { deleted_at: new Date() },
    });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
