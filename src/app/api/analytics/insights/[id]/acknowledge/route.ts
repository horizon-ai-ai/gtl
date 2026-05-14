import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const insight = await prisma.analyticsInsight.findFirst({
      where: { id: params.id, user_id: session.user.id },
    });
    if (!insight) {
      throw new ApiError("RESOURCE_NOT_FOUND", "Analytics insight not found");
    }

    const updated = await prisma.analyticsInsight.update({
      where: { id: params.id },
      data: { acknowledged_at: new Date() },
    });

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
