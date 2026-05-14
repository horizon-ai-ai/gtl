import { auth } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { getAnalyticsDashboard } from "@/lib/analytics/dashboard";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const url = new URL(req.url);
    const connectionId = url.searchParams.get("connection_id");
    if (!connectionId) return fail("VALIDATION_ERROR", "Missing connection_id");

    const dashboard = await getAnalyticsDashboard(connectionId, session.user.id);
    if (!dashboard) return fail("RESOURCE_NOT_FOUND", "Analytics connection not found");

    return ok(dashboard);
  } catch (err) {
    return handleError(err);
  }
}
