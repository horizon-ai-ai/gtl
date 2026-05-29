import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const result = await prisma.session.updateMany({
      where: {
        id: params.id,
        user_id: session.user.id,
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });

    if (result.count === 0) {
      return fail("RESOURCE_NOT_FOUND", "Session not found");
    }

    return ok({});
  } catch (err) {
    return handleError(err);
  }
}
