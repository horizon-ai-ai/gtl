import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireSessionUser } from "@/lib/conversation/api";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const items = await prisma.conversation.findMany({
      where: { user_id: user.id, deleted_at: null },
      orderBy: { last_message_at: { sort: "desc", nulls: "last" } },
      take: 100,
      select: {
        id: true,
        title: true,
        category: true,
        pinned: true,
        archived: true,
        ai_model: true,
        active_design_task_id: true,
        last_message_at: true,
        created_at: true,
        updated_at: true,
        _count: { select: { messages: true, design_tasks: true } },
      },
    });
    return ok(items);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSessionUser();
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : undefined;
    const aiModel = typeof body.aiModel === "string" && body.aiModel.trim()
      ? body.aiModel.trim()
      : undefined;

    const c = await prisma.conversation.create({
      data: {
        user_id: user.id,
        ...(title ? { title } : {}),
        ...(aiModel ? { ai_model: aiModel } : {}),
        last_message_at: new Date(),
      },
    });
    return ok(c);
  } catch (err) {
    return handleError(err);
  }
}
