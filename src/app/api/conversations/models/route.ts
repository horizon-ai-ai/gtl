import { fail, handleError, ok } from "@/lib/api";
import { pickConversationModels } from "@/lib/ai-model-settings";
import { requireSessionUser } from "@/lib/conversation/api";

export async function GET() {
  try {
    await requireSessionUser();

    return ok({
      models: await pickConversationModels(),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return fail("UNAUTHORIZED", "Not signed in");
    }
    return handleError(err);
  }
}
