import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ok, handleError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { reindexKnowledgeDoc } from "@/lib/kb";

const createSchema = z.object({
  source: z.string().default("manual"),
  tenant_scope: z.string().default("global"),
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  url: z.string().url().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const docs = await prisma.knowledgeDoc.findMany({
      orderBy: { updated_at: "desc" },
      take: 100,
      include: { chunks: true },
    });
    return ok(docs);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = createSchema.parse(await req.json());
    const doc = await prisma.knowledgeDoc.create({
      data: body,
    });
    const indexed = await reindexKnowledgeDoc(doc.id);
    return ok(indexed ?? doc);
  } catch (err) {
    return handleError(err);
  }
}
