import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { reindexKnowledgeDoc } from "@/lib/kb";

const schema = z.object({
  doc_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = schema.parse(await req.json().catch(() => ({})));
    if (body.doc_id) {
      const doc = await reindexKnowledgeDoc(body.doc_id);
      return ok({ count: doc ? 1 : 0 });
    }

    const docs = await prisma.knowledgeDoc.findMany({ select: { id: true } });
    for (const doc of docs) {
      await reindexKnowledgeDoc(doc.id);
    }
    return ok({ count: docs.length });
  } catch (err) {
    return handleError(err);
  }
}
