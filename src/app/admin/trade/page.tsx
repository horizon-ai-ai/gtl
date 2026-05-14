import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listTradeLifecycleRules } from "@/lib/trade-lifecycle";
import { getTradeOperationSummary } from "@/lib/trade-quotations";
import { Card } from "@/components/ui/card";

export default async function AdminTradeOperationsPage() {
  await requireAdmin();

  const [{ quotationCount, negotiatingCount, latestQuotations, latestTradeOrders }, tradeOrderCount, lifecycleRules] =
    await Promise.all([
      getTradeOperationSummary(),
      prisma.order.count({ where: { metadata: { path: ["source"], equals: "trade_inquiry" }, deleted_at: null } }),
      listTradeLifecycleRules(),
    ]);

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trade Operations</h1>
          <p className="mt-1 text-sm text-neutral-500">
            將 quotation、trade order、lifecycle 規則集中在同一個 admin 工作台。
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/trade/quotations" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
            Quotation 管理
          </Link>
          <Link href="/admin/trade/lifecycle" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
            生命週期規則
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="已發出 Quotation" value={quotationCount} />
        <StatCard label="議價中" value={negotiatingCount} />
        <StatCard label="Trade 訂單數" value={tradeOrderCount} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">最新 Quotation</div>
          <div className="space-y-3">
            {latestQuotations.map((inquiry) => (
              <div key={inquiry.id} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{inquiry.product_name}</div>
                <div className="mt-1 text-neutral-500">
                  Buyer：{inquiry.buyer_name}
                </div>
                <div className="mt-1 text-neutral-500">
                  Seller：{inquiry.seller_name}
                </div>
                <div className="mt-2">
                  v{inquiry.quotation_version} · USD {(inquiry.quoted_price ?? inquiry.target_price ?? 0).toLocaleString()} FOB
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">生命週期規則</div>
          <div className="space-y-3">
            {lifecycleRules.map((rule) => (
              <div key={rule.stage_key} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{rule.label}</div>
                <div className="mt-1 text-neutral-500">{rule.stage_key}</div>
                <div className="mt-2">+{rule.day_offset} 天</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 text-sm font-medium">最新 Trade 訂單</div>
        <div className="space-y-3">
          {latestTradeOrders.map((order) => (
            <div key={order.id} className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
              <div>
                <div className="font-medium">{order.order_no}</div>
                <div className="mt-1 text-neutral-500">{order.user.company?.name ?? order.user.email}</div>
              </div>
              <Link href={`/admin/orders/${order.id}`} className="rounded-md border px-3 py-2 text-xs hover:bg-neutral-50">
                查看訂單
              </Link>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </Card>
  );
}
