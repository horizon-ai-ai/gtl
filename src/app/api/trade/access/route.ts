import { auth } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { canAccessTradeModule } from "@/lib/trade";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const allowed = await canAccessTradeModule(session.user.id);
    return ok({ allowed });
  } catch (err) {
    return handleError(err);
  }
}
