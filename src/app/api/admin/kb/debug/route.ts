import { requireAdmin } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { retrieveKnowledgeDebug } from "@/lib/kb";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const query = url.searchParams.get("query")?.trim() ?? "";
    const userId = url.searchParams.get("user_id")?.trim() || null;
    const limit = Number(url.searchParams.get("limit") ?? 8);

    if (!query) {
      return ok({
        query: "",
        items: [],
      });
    }

    const items = await retrieveKnowledgeDebug(query, userId, Math.min(Math.max(limit, 1), 20));
    return ok({
      query,
      user_id: userId,
      items,
      retrieval_mode: "pgvector_hybrid",
    });
  } catch (err) {
    return handleError(err);
  }
}
