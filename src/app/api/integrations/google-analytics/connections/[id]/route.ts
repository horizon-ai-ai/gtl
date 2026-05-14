import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const connection = await prisma.googleAnalyticsConnection.findFirst({
      where: { id: params.id, user_id: session.user.id },
    });
    if (!connection) {
      throw new ApiError("RESOURCE_NOT_FOUND", "Analytics connection not found");
    }

    await prisma.googleAnalyticsConnection.update({
      where: { id: params.id },
      data: {
        status: "revoked",
        access_token: null,
        access_token_expires_at: null,
      },
    });

    return ok({
      revoked: true,
      snapshot_delete_after: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    return handleError(err);
  }
}
