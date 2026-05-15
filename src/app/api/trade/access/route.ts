import { auth } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { getTradeAccessState } from "@/lib/trade";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const access = await getTradeAccessState(session.user.id);
    return ok(access);
  } catch (err) {
    return handleError(err);
  }
}
