import { handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/conversation/api";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const existing = await prisma.conversation.findFirst({
      where: {
        user_id: user.id,
        deleted_at: null,
        archived: false,
      },
      orderBy: [{ last_message_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
    });

    if (existing) return ok(existing);

    const conversation = await prisma.conversation.create({
      data: {
        user_id: user.id,
        title: "AI 助理",
        last_message_at: new Date(),
      },
    });

    return ok(conversation);
  } catch (err) {
    return handleError(err);
  }
}
