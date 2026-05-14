import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

type CopilotPayload = {
  query?: string;
  planner_model?: string | null;
  answer_model?: string | null;
  plan?: Array<{ name?: string; reason?: string }>;
  cards?: Array<{ tool?: string; title?: string; summary?: string; item_count?: number }>;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  status?: string;
  error_message?: string | null;
  answer_excerpt?: string | null;
};

type SearchParams = {
  q?: string;
  status?: string;
  admin?: string;
  tool?: string;
};

function includesText(haystack: string | null | undefined, needle: string) {
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

export default async function AdminCopilotHistoryPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const q = searchParams?.q?.trim() ?? "";
  const status = searchParams?.status?.trim() ?? "";
  const adminFilter = searchParams?.admin?.trim() ?? "";
  const tool = searchParams?.tool?.trim() ?? "";

  const runs = await prisma.adminAction.findMany({
    where: {
      action: "admin_copilot_run",
      target_type: "admin_copilot",
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  const adminIds = Array.from(new Set(runs.map((run) => run.admin_id)));
  const admins = adminIds.length
    ? await prisma.user.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, email: true, display_name: true },
      })
    : [];
  const adminMap = new Map(admins.map((admin) => [admin.id, admin]));
  const filteredRuns = runs.filter((run) => {
    const payload = (run.payload ?? {}) as CopilotPayload;
    const admin = adminMap.get(run.admin_id);

    if (status && payload.status !== status) return false;
    if (adminFilter && run.admin_id !== adminFilter) return false;
    if (
      tool &&
      !(payload.plan ?? []).some((item) => includesText(item.name, tool)) &&
      !(payload.cards ?? []).some((item) => includesText(item.tool, tool) || includesText(item.title, tool))
    ) {
      return false;
    }
    if (
      q &&
      !includesText(payload.query, q) &&
      !includesText(run.reason, q) &&
      !includesText(payload.answer_excerpt, q) &&
      !includesText(admin?.email, q) &&
      !includesText(admin?.display_name, q)
    ) {
      return false;
    }

    return true;
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin Copilot History</h1>
          <p className="mt-1 text-sm text-neutral-500">
            回看每次 Copilot run 的 query、工具計畫、模型與回答摘要。
          </p>
        </div>
        <Link href="/admin/copilot" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
          回到 Copilot
        </Link>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="搜尋 query / admin / 回答摘要"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <select name="status" defaultValue={status} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">全部狀態</option>
            <option value="success">success</option>
            <option value="error">error</option>
          </select>
          <select name="admin" defaultValue={adminFilter} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">全部 admin</option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.display_name ?? admin.email}
              </option>
            ))}
          </select>
          <input
            name="tool"
            defaultValue={tool}
            placeholder="工具名，例如 analytics / support"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <div className="md:col-span-4 flex gap-2">
            <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
              篩選
            </button>
            <Link href="/admin/copilot/history" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
              清除
            </Link>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        {filteredRuns.length === 0 ? (
          <Card className="p-8 text-center text-sm text-neutral-500">找不到符合條件的 Copilot run。</Card>
        ) : null}
        {filteredRuns.map((run) => {
          const payload = (run.payload ?? {}) as CopilotPayload;
          const admin = adminMap.get(run.admin_id);
          return (
            <Card key={run.id} className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-neutral-500">
                    {new Date(run.created_at).toLocaleString()} · {admin?.display_name ?? admin?.email ?? run.admin_id}
                  </div>
                  <div className="mt-1 text-lg font-semibold">{payload.query ?? run.reason ?? "未命名查詢"}</div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs ${
                    payload.status === "success"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {payload.status ?? "unknown"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/copilot?q=${encodeURIComponent(payload.query ?? "")}&autorun=1`}
                  className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  重新執行這個 query
                </Link>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded border bg-neutral-50 p-4 text-sm">
                  <div className="font-medium">Models</div>
                  <div className="mt-2 text-neutral-600">planner: {payload.planner_model ?? "fallback"}</div>
                  <div className="text-neutral-600">answer: {payload.answer_model ?? "—"}</div>
                  {payload.usage ? (
                    <div className="mt-2 text-neutral-600">
                      usage: in {payload.usage.input_tokens ?? 0} / out {payload.usage.output_tokens ?? 0}
                    </div>
                  ) : null}
                </div>

                <div className="rounded border bg-neutral-50 p-4 text-sm">
                  <div className="font-medium">Tool Plan</div>
                  <div className="mt-2 space-y-2">
                    {(payload.plan ?? []).length === 0 ? (
                      <div className="text-neutral-500">無工具計畫</div>
                    ) : (
                      (payload.plan ?? []).map((item, index) => (
                        <div key={`${run.id}-plan-${index}`}>
                          <div className="font-medium">{item.name ?? "unknown"}</div>
                          <div className="text-neutral-600">{item.reason ?? "—"}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded border bg-neutral-50 p-4 text-sm">
                  <div className="font-medium">Tool Results</div>
                  <div className="mt-2 space-y-2">
                    {(payload.cards ?? []).length === 0 ? (
                      <div className="text-neutral-500">無卡片摘要</div>
                    ) : (
                      (payload.cards ?? []).map((card, index) => (
                        <div key={`${run.id}-card-${index}`}>
                          <div className="font-medium">{card.title ?? card.tool ?? "unknown"}</div>
                          <div className="text-neutral-600">
                            {card.summary ?? "—"} {typeof card.item_count === "number" ? `· ${card.item_count} items` : ""}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {payload.answer_excerpt ? (
                <div className="rounded border p-4 text-sm leading-6 whitespace-pre-wrap">
                  {payload.answer_excerpt}
                </div>
              ) : null}

              {payload.error_message ? (
                <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {payload.error_message}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
