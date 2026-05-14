import { auth } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const insights = await prisma.analyticsInsight.findMany({
      where: { user_id: session.user.id },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    return ok(insights);
  } catch (err) {
    return handleError(err);
  }
}
