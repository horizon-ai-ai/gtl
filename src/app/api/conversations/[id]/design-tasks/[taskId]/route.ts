import { NextRequest } from "next/server";

import { ApiError, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  activateDesignTask,
  getOwnedConversation,
  parseDesignTaskStatus,
  parseExecutionStrategy,
  requireSessionUser,
  shapeDesignTask,
  toInputJson,
} from "@/lib/conversation/api";

async function getOwnedDesignTask(conversationId: string, taskId: string, userId: string) {
  const task = await prisma.designTask.findFirst({
    where: { id: taskId, conversation_id: conversationId, user_id: userId },
  });
  if (!task) throw new ApiError("RESOURCE_NOT_FOUND", "Design task not found");
  return task;
}

export async function GET(
  _: NextRequest,
  { params }: { params: { id: string; taskId: string } },
) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);
    const task = await getOwnedDesignTask(params.id, params.taskId, user.id);
    return ok(shapeDesignTask(task));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; taskId: string } },
) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);
    await getOwnedDesignTask(params.id, params.taskId, user.id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = parseDesignTaskStatus(body.status);
    const executionStrategy = parseExecutionStrategy(body.executionStrategy);

    const updated = await prisma.designTask.update({
      where: { id: params.taskId },
      data: {
        ...(typeof body.title === "string" && body.title.trim()
          ? { title: body.title.trim() }
          : {}),
        ...(status ? { status } : {}),
        ...(executionStrategy ? { execution_strategy: executionStrategy } : {}),
        ...(typeof body.preferredModel === "string"
          ? { preferred_model: body.preferredModel.trim() || null }
          : {}),
        ...(typeof body.summary === "string" || body.summary === null
          ? { summary: body.summary }
          : {}),
        ...(body.collectedData !== undefined
          ? { collected_data: toInputJson(body.collectedData) }
          : {}),
        ...(body.resolvedRequirements !== undefined
          ? { resolved_requirements: toInputJson(body.resolvedRequirements) }
          : {}),
        ...(body.missingRequirements !== undefined
          ? { missing_requirements: toInputJson(body.missingRequirements) }
          : {}),
        ...(body.currentClarificationGoal !== undefined
          ? { current_clarification_goal: toInputJson(body.currentClarificationGoal) }
          : {}),
        ...(Number.isFinite(Number(body.priority)) ? { priority: Number(body.priority) } : {}),
        ...(Number.isFinite(Number(body.outputCount))
          ? { output_count: Math.min(Math.max(Math.floor(Number(body.outputCount)), 1), 10) }
          : {}),
        ...(Number.isFinite(Number(body.clarificationCount))
          ? { clarification_count: Math.max(Math.floor(Number(body.clarificationCount)), 0) }
          : {}),
        last_activity_at: new Date(),
      },
    });

    if (body.makeActive === true) {
      await activateDesignTask(params.id, params.taskId);
      const activeTask = await prisma.designTask.findUniqueOrThrow({ where: { id: params.taskId } });
      return ok(shapeDesignTask(activeTask));
    }

    return ok(shapeDesignTask(updated));
  } catch (err) {
    return handleError(err);
  }
}
