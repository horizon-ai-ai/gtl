import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsDashboardClient } from "./analytics-dashboard-client";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: { connection_id?: string };
}) {
  const session = await auth();
  const connections = session?.user
    ? await prisma.googleAnalyticsConnection.findMany({
        where: { user_id: session.user.id, status: "active" },
        orderBy: { created_at: "desc" },
      })
    : [];
  const requestedId = searchParams?.connection_id;
  const connection = requestedId
    ? connections.find((item) => item.id === requestedId) ?? null
    : connections[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Analytics Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">
          已接上 GA dashboard API，固定查最近 7 天流量、來源、熱門頁與轉換。
        </p>
      </div>

      {connections.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>可用連線</CardTitle>
            <CardDescription>切換不同 Property 觀看 dashboard。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {connections.map((item) => (
              <a
                key={item.id}
                href={`/analytics?connection_id=${item.id}`}
                className={`rounded-md border px-3 py-2 text-sm ${
                  item.id === connection?.id ? "border-neutral-900 bg-neutral-900 text-white" : "hover:bg-neutral-50"
                }`}
              >
                {item.property_name}
              </a>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {connection ? (
        <AnalyticsDashboardClient connectionId={connection.id} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>尚未連接 GA Property</CardTitle>
            <CardDescription>
              先完成 Google Analytics 連接，這裡才會顯示流量、來源、熱門頁與轉換資料。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-dashed p-5 text-sm text-neutral-600">
              建議流程：先到「整合設定」連接你的 GA4 Property，完成後再回來看 dashboard。
            </div>
            <a href="/settings/integrations">
              <Button>前往整合設定</Button>
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
