import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { retrieveKnowledgeDebug } from "@/lib/kb";

type SearchParams = {
  query?: string;
  user_id?: string;
};

export default async function AdminKbDebugPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const query = searchParams?.query?.trim() ?? "";
  const userId = searchParams?.user_id?.trim() ?? "";
  const results = query ? await retrieveKnowledgeDebug(query, userId || null, 12) : [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">RAG Retrieval Debug</h1>
          <p className="mt-1 text-sm text-neutral-500">
            檢查 pgvector + lexical hybrid retrieval 的候選 chunks、分數與 tenant scope。
          </p>
        </div>
        <Link href="/admin/kb" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
          回到知識庫
        </Link>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-[2fr,1fr,auto]">
          <input
            name="query"
            defaultValue={query}
            placeholder="輸入要 debug 的問題，例如：如何取消訂單？"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <input
            name="user_id"
            defaultValue={userId}
            placeholder="user_id（選填）"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
            執行檢索
          </button>
        </form>
      </Card>

      <div className="space-y-4">
        {!query ? (
          <Card className="p-6 text-sm text-neutral-500">先輸入一個問題，再看 retrieval candidates。</Card>
        ) : null}

        {query && results.length === 0 ? (
          <Card className="p-6 text-sm text-neutral-500">沒有找到可用 chunks。</Card>
        ) : null}

        {results.map((item) => (
          <Card key={item.chunk_id} className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">{item.title}</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {item.source} · chunk #{item.chunk_index + 1} · {item.tenant_scope}
                  {item.user_id ? ` · user ${item.user_id}` : ""}
                </div>
              </div>
              <div className="text-right text-xs text-neutral-500">
                <div>final {item.score.toFixed(4)}</div>
                <div>vector {item.vector_score.toFixed(4)}</div>
                <div>lexical {item.lexical_score.toFixed(4)}</div>
              </div>
            </div>

            <div className="rounded border bg-neutral-50 p-4 text-sm leading-6">
              {item.snippet}
            </div>

            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="text-sm underline">
                打開原始來源
              </a>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
