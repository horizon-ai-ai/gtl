import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { pickConversationModels, requireSessionUser } from "@/lib/conversation/api";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const subscription = await prisma.subscription.findUnique({
      where: { user_id: user.id },
      include: { plan: true },
    });

    return ok({
      models: pickConversationModels(subscription?.plan.code ?? "free"),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Not signed in");
    }
    return handleError(err);
  }
}
