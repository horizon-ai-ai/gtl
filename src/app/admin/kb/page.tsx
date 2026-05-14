import { revalidatePath } from "next/cache";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reindexKnowledgeDoc } from "@/lib/kb";

async function createDoc(formData: FormData) {
  "use server";
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const source = String(formData.get("source") ?? "manual").trim() || "manual";
  const url = String(formData.get("url") ?? "").trim();
  if (!title || !content) return;

  const doc = await prisma.knowledgeDoc.create({
    data: {
      source,
      tenant_scope: "global",
      title,
      content,
      url: url || undefined,
    },
  });
  await reindexKnowledgeDoc(doc.id);
  revalidatePath("/admin/kb");
}

async function reindexDoc(formData: FormData) {
  "use server";
  await requireAdmin();
  const docId = String(formData.get("doc_id") ?? "");
  if (!docId) return;
  await reindexKnowledgeDoc(docId);
  revalidatePath("/admin/kb");
}

export default async function AdminKbPage() {
  await requireAdmin();
  const docs = await prisma.knowledgeDoc.findMany({
    orderBy: { updated_at: "desc" },
    take: 100,
    include: { chunks: true },
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">知識庫</h1>
        <p className="text-sm text-neutral-500 mt-1">管理 RAG support 使用的文件與索引。</p>
        <div className="mt-3">
          <Link href="/admin/kb/debug" className="text-sm underline text-neutral-600 hover:text-neutral-900">
            打開 Retrieval Debug
          </Link>
        </div>
      </div>

      <Card className="p-4">
        <form action={createDoc} className="grid gap-3">
          <input name="title" placeholder="文件標題" className="rounded border px-3 py-2 text-sm" />
          <div className="grid md:grid-cols-2 gap-3">
            <input name="source" defaultValue="manual" placeholder="來源" className="rounded border px-3 py-2 text-sm" />
            <input name="url" placeholder="原始 URL（選填）" className="rounded border px-3 py-2 text-sm" />
          </div>
          <textarea name="content" placeholder="文件內容" className="min-h-40 rounded border px-3 py-2 text-sm" />
          <div>
            <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
              新增並建立索引
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="text-left p-3">標題</th>
              <th className="text-left p-3">來源</th>
              <th className="text-left p-3">Chunk 數</th>
              <th className="text-left p-3">Indexed At</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} className="border-b last:border-0">
                <td className="p-3">
                  <div className="font-medium">{doc.title}</div>
                  <div className="text-xs text-neutral-500">{doc.url ?? ""}</div>
                </td>
                <td className="p-3">{doc.source}</td>
                <td className="p-3">{doc.chunks.length}</td>
                <td className="p-3 text-neutral-500">
                  {doc.indexed_at ? new Date(doc.indexed_at).toLocaleString() : "未建立"}
                </td>
                <td className="p-3">
                  <form action={reindexDoc}>
                    <input type="hidden" name="doc_id" value={doc.id} />
                    <button type="submit" className="rounded border px-3 py-1 text-xs hover:bg-neutral-50">
                      重建索引
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
