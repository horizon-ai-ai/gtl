import { handleError, ok } from "@/lib/api";
import { requireSessionUser } from "@/lib/conversation/api";
import { listServiceStarters } from "@/lib/conversation/schema-registry";

export async function GET() {
  try {
    await requireSessionUser();
    return ok({ starters: await listServiceStarters() });
  } catch (err) {
    return handleError(err);
  }
}
