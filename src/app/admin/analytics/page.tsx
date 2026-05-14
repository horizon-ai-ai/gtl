import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildDashboardData } from "@/lib/analytics/ga4";

type SearchParams = {
  connection_id?: string;
};

function normalizeDashboardRows(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray((value as { rows?: unknown }).rows)
  ) {
    return (value as { rows: Array<Record<string, string | number>> }).rows;
  }

  return [] as Array<Record<string, string | number>>;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const connections = await prisma.googleAnalyticsConnection.findMany({
    where: { status: "active" },
    orderBy: [{ last_sync_at: "desc" }, { updated_at: "desc" }],
    include: {
      user: { select: { email: true, display_name: true } },
    },
    take: 50,
  });

  const selected =
    connections.find((connection) => connection.id === searchParams?.connection_id) ??
    connections[0] ??
    null;

  let dashboard: Awaited<ReturnType<typeof buildDashboardData>> | null = null;
  let dashboardError: string | null = null;
  if (selected) {
    try {
      dashboard = await buildDashboardData(selected);
    } catch (error) {
      dashboardError = error instanceof Error ? error.message : "Dashboard 載入失敗";
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Analytics</h1>
        <p className="mt-1 text-sm text-neutral-500">
          從 admin portal 檢視所有已連接的 GA Property 與 dashboard 摘要。
        </p>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium">GA Connections</div>
        {connections.length === 0 ? (
          <div className="mt-3 text-sm text-neutral-500">目前沒有 active 的 GA 連線。</div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {connections.map((connection) => (
              <Link
                key={connection.id}
                href={`/admin/analytics?connection_id=${connection.id}`}
                className={`rounded-md border px-3 py-2 text-sm ${
                  selected?.id === connection.id ? "border-neutral-900 bg-neutral-900 text-white" : "hover:bg-neutral-50"
                }`}
              >
                {connection.property_name}
                <span className="ml-2 text-xs opacity-80">
                  {connection.user.display_name ?? connection.user.email}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {selected ? (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="font-medium">{selected.property_name}</div>
            <div className="mt-1 text-sm text-neutral-500">
              {selected.user.display_name ?? selected.user.email} · last sync{" "}
              {selected.last_sync_at ? new Date(selected.last_sync_at).toLocaleString() : "—"}
            </div>
          </Card>

          {dashboardError ? (
            <Card className="p-4 text-sm text-red-700">{dashboardError}</Card>
          ) : dashboard ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-4">
                <div className="font-medium">Overview</div>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs text-neutral-700">
                  {JSON.stringify(dashboard.overview, null, 2)}
                </pre>
              </Card>
              <Card className="p-4">
                <div className="font-medium">Sources</div>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs text-neutral-700">
                  {JSON.stringify(normalizeDashboardRows(dashboard.sources), null, 2)}
                </pre>
              </Card>
              <Card className="p-4">
                <div className="font-medium">Top Pages</div>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs text-neutral-700">
                  {JSON.stringify(normalizeDashboardRows(dashboard.top_pages), null, 2)}
                </pre>
              </Card>
              <Card className="p-4">
                <div className="font-medium">Conversions</div>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs text-neutral-700">
                  {JSON.stringify(normalizeDashboardRows(dashboard.conversions), null, 2)}
                </pre>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
