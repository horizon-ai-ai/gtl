import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const c = await prisma.conversation.findFirst({
      where: { id: params.id, user_id: session.user.id, deleted_at: null },
      include: {
        messages: { orderBy: { created_at: "asc" } },
      },
    });
    if (!c) return fail("RESOURCE_NOT_FOUND", "Conversation not found");
    return ok(c);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = (await req.json()) as { title?: string; pinned?: boolean };
    const c = await prisma.conversation.update({
      where: { id: params.id },
      data: body,
    });
    return ok(c);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await prisma.conversation.update({
      where: { id: params.id },
      data: { deleted_at: new Date() },
    });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
