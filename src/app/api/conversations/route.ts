import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const items = await prisma.conversation.findMany({
      where: { user_id: session.user.id, deleted_at: null },
      orderBy: { last_message_at: { sort: "desc", nulls: "last" } },
      take: 100,
      select: {
        id: true,
        title: true,
        category: true,
        pinned: true,
        last_message_at: true,
        created_at: true,
      },
    });
    return ok(items);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const c = await prisma.conversation.create({
      data: { user_id: session.user.id },
    });
    return ok({ id: c.id, title: c.title });
  } catch (err) {
    return handleError(err);
  }
}
