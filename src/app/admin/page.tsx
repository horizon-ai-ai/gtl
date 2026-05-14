import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTWD } from "@/lib/utils";

export default async function AdminDashboard() {
  const [userCount, activeUserCount, orderCount, gmvAgg] = await Promise.all([
    prisma.user.count({ where: { deleted_at: null } }),
    prisma.user.count({ where: { status: "active" } }),
    prisma.order.count({ where: { deleted_at: null } }),
    prisma.order.aggregate({
      where: { status: { in: ["paid", "shipped", "completed"] } },
      _sum: { total: true },
    }),
  ]);

  const cards = [
    { label: "總用戶數", value: userCount.toLocaleString() },
    { label: "活躍用戶", value: activeUserCount.toLocaleString() },
    { label: "訂單總數", value: orderCount.toLocaleString() },
    { label: "GMV", value: formatTWD(gmvAgg._sum.total ?? 0) },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold mb-6">儀表板</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-neutral-500">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
