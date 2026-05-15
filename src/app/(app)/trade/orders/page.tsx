import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertVerifiedTradeProfile } from "@/lib/trade";
import { buildTradeLifecycleTimeline, listTradeLifecycleRules } from "@/lib/trade-lifecycle";
import { Card } from "@/components/ui/card";

export default async function TradeOrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  await assertVerifiedTradeProfile(session.user.id);

  const [orders, rules] = await Promise.all([
    prisma.order.findMany({
      where: {
        user_id: session.user.id,
        deleted_at: null,
        metadata: { path: ["source"], equals: "trade_inquiry" },
      },
      include: { items: true },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
    listTradeLifecycleRules(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">貿易訂單</h1>
          <p className="mt-1 text-sm text-neutral-500">
            顯示由 trade 詢價/quotation 轉成的訂單，以及規則式生命週期節點。
          </p>
        </div>
        <Link href="/trade" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
          回到貿易工作台
        </Link>
      </div>

      {orders.length === 0 ? (
        <Card className="p-8 text-sm text-neutral-500">目前沒有由 trade 成立的訂單。</Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const timeline = buildTradeLifecycleTimeline(order.created_at, rules);
            return (
              <Card key={order.id} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-medium">{order.order_no}</div>
                    <div className="mt-1 text-sm text-neutral-500">
                      目前狀態 {order.status} · 建立於 {new Date(order.created_at).toLocaleDateString("zh-TW")}
                    </div>
                  </div>
                  <Link href={`/orders/${order.id}`} className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
                    查看訂單
                  </Link>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-6">
                  {timeline.map((stage) => (
                    <div key={stage.stage_key} className="rounded-md border bg-neutral-50 p-3 text-sm">
                      <div className="font-medium">{stage.label}</div>
                      <div className="mt-1 text-neutral-500">+{stage.day_offset} 天</div>
                      <div className="mt-2 text-neutral-700">
                        {stage.estimated_at.toLocaleDateString("zh-TW")}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
