import { NextRequest } from "next/server";
import { DesignTaskStatus } from "@prisma/client";

import { handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  activateDesignTask,
  getOwnedConversation,
  getTaskTitle,
  parseDesignTaskStatus,
  requireSessionUser,
  resolveTaskCreateInput,
  shapeDesignTask,
  toInputJson,
} from "@/lib/conversation/api";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);

    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), 200)
      : 100;

    const tasks = await prisma.designTask.findMany({
      where: { conversation_id: params.id, user_id: user.id },
      orderBy: [{ last_activity_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
      take: limit,
    });

    return ok({ docs: tasks.map(shapeDesignTask), totalDocs: tasks.length, limit });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const resolved = await resolveTaskCreateInput(body);
    const status = parseDesignTaskStatus(body.status) || DesignTaskStatus.active;
    const now = new Date();

    const task = await prisma.designTask.create({
      data: {
        conversation_id: params.id,
        user_id: user.id,
        task_type: resolved.taskType,
        template_key: resolved.templateKey,
        template_label: resolved.templateLabel,
        execution_strategy: resolved.executionStrategy,
        preferred_model:
          typeof body.preferredModel === "string" && body.preferredModel.trim()
            ? body.preferredModel.trim()
            : undefined,
        title: getTaskTitle(resolved.taskType, body.title),
        status,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
        output_count: Number.isFinite(Number(body.outputCount))
          ? Math.min(Math.max(Math.floor(Number(body.outputCount)), 1), 10)
          : 1,
        summary: typeof body.summary === "string" ? body.summary : undefined,
        collected_data: toInputJson(body.collectedData),
        resolved_requirements: toInputJson(body.resolvedRequirements),
        missing_requirements: toInputJson(body.missingRequirements),
        current_clarification_goal: toInputJson(body.currentClarificationGoal),
        clarification_count: Number.isFinite(Number(body.clarificationCount))
          ? Math.max(Math.floor(Number(body.clarificationCount)), 0)
          : 0,
        last_activity_at: now,
      },
    });

    if (status === DesignTaskStatus.active) {
      await activateDesignTask(params.id, task.id);
      const activeTask = await prisma.designTask.findUniqueOrThrow({ where: { id: task.id } });
      return ok(shapeDesignTask(activeTask));
    }

    return ok(shapeDesignTask(task));
  } catch (err) {
    return handleError(err);
  }
}
