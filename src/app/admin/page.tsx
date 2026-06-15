import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTWD } from "@/lib/utils";
import Link from "next/link";

export default async function AdminDashboard() {
  const [userCount, activeUserCount, orderCount, gmvAgg, quotePendingCount, executionCount, openSupportCount, latestOrders] = await Promise.all([
    prisma.user.count({ where: { deleted_at: null } }),
    prisma.user.count({ where: { status: "active" } }),
    prisma.order.count({ where: { deleted_at: null } }),
    prisma.order.aggregate({
      where: { status: { in: ["paid", "shipped", "completed"] } },
      _sum: { total: true },
    }),
    prisma.order.count({ where: { deleted_at: null, status: "quote_pending" } }),
    prisma.order.count({ where: { deleted_at: null, status: "in_execution" } }),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.order.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: "desc" },
      take: 6,
      include: {
        user: { select: { email: true, display_name: true } },
        _count: { select: { messages: true } },
      },
    }),
  ]);

  const cards = [
    { label: "總用戶數", value: userCount.toLocaleString() },
    { label: "活躍用戶", value: activeUserCount.toLocaleString() },
    { label: "訂單總數", value: orderCount.toLocaleString() },
    { label: "GMV", value: formatTWD(gmvAgg._sum.total ?? 0) },
  ];

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Admin dashboard</div>
          <h1 className="mt-2 text-2xl font-semibold">營運工作台</h1>
          <p className="mt-1 text-sm text-ink-500">先看需要人處理的訂單、報價、支援，再進入細節頁操作。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/orders" className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-canvas shadow-xs transition hover:-translate-y-px hover:shadow-sm">
            查看訂單
          </Link>
          <Link href="/admin/support" className="rounded-md border border-line1 bg-surface px-4 py-2 text-sm font-medium text-ink-700 shadow-xs transition hover:-translate-y-px hover:bg-hover hover:shadow-sm">
            人工支援
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-line1 bg-surface shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-normal text-ink-500">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.85fr,1.15fr]">
        <Card className="border-line1 bg-surface p-5 shadow-sm">
          <div className="text-sm font-semibold text-ink-900">待處理焦點</div>
          <div className="mt-4 grid gap-3">
            <AdminFocusLink href="/admin/orders?status=quote_pending" label="等待報價" value={quotePendingCount} />
            <AdminFocusLink href="/admin/orders?status=in_execution" label="執行中訂單" value={executionCount} />
            <AdminFocusLink href="/admin/support" label="未處理支援" value={openSupportCount} />
          </div>
        </Card>

        <Card className="overflow-hidden border-line1 bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line1 px-5 py-4">
            <div>
              <div className="text-sm font-semibold text-ink-900">最新訂單</div>
              <div className="mt-1 text-xs text-ink-500">包含專案訂單與一般交易單，點進去可處理報價與對話。</div>
            </div>
            <Link href="/admin/orders" className="text-sm text-accent-600 hover:underline">
              全部
            </Link>
          </div>
          <div className="divide-y divide-line1">
            {latestOrders.length === 0 ? (
              <div className="p-5 text-sm text-ink-500">尚無訂單。</div>
            ) : (
              latestOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="grid gap-2 px-5 py-4 text-sm transition hover:bg-hover md:grid-cols-[1fr,140px,90px]"
                >
                  <div>
                    <div className="font-medium text-ink-900">{order.title ?? order.order_no}</div>
                    <div className="mt-1 text-xs text-ink-500">
                      {order.user.display_name ?? order.user.email} · {order._count.messages} 則對話
                    </div>
                  </div>
                  <div className="text-ink-500">{order.project_type ?? "commerce"}</div>
                  <div>
                    <span className="rounded-full bg-sunken px-2.5 py-1 text-xs text-ink-600">{order.status}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AdminFocusLink({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-md border border-line1 bg-sunken px-4 py-3 transition hover:bg-hover">
      <span className="text-sm text-ink-700">{label}</span>
      <span className="text-xl font-semibold text-ink-900">{value}</span>
    </Link>
  );
}
