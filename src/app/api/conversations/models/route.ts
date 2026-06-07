import { fail, handleError, ok } from "@/lib/api";
import { pickConversationModels } from "@/lib/ai-model-settings";
import { prisma } from "@/lib/db";
import { requireSessionUser } from "@/lib/conversation/api";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const subscription = await prisma.subscription.findUnique({
      where: { user_id: user.id },
      include: { plan: true },
    });

    return ok({
      models: await pickConversationModels(subscription?.plan.code ?? "free"),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Not signed in");
    }
    return handleError(err);
  }
}
