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
        <StatCard label="已發出 Quotation" value={quotationCount} hint="累計發出的報價單" />
        <StatCard label="議價中" value={negotiatingCount} hint="等待雙方回覆的詢價" />
        <StatCard label="Trade 訂單數" value={tradeOrderCount} hint="由詢價成立的訂單" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">最新 Quotation</div>
            <Link href="/admin/trade/quotations" className="text-xs text-neutral-500 underline underline-offset-2">
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {latestQuotations.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">尚無報價紀錄。</div>
            ) : null}
            {latestQuotations.map((inquiry) => (
              <div key={inquiry.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{inquiry.product_name}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      QUOTATION_STATUS_STYLE[inquiry.status] ?? "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {QUOTATION_STATUS_LABEL[inquiry.status] ?? inquiry.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
                  <span>Buyer：{inquiry.buyer_name}</span>
                  <span>Seller：{inquiry.seller_name}</span>
                  <span>{new Date(inquiry.updated_at).toLocaleDateString()}</span>
                </div>
                <div className="mt-1.5 text-sm text-neutral-800">
                  v{inquiry.quotation_version} · USD {(inquiry.quoted_price ?? inquiry.target_price ?? 0).toLocaleString()} FOB
                  {inquiry.quoted_quantity ?? inquiry.quantity ? (
                    <span className="text-neutral-500"> · 數量 {(inquiry.quoted_quantity ?? inquiry.quantity).toLocaleString()}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">生命週期規則</div>
              <Link href="/admin/trade/lifecycle" className="text-xs text-neutral-500 underline underline-offset-2">
                編輯規則
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-neutral-400">
                  <th className="pb-2 font-medium">階段</th>
                  <th className="pb-2 font-medium">代碼</th>
                  <th className="pb-2 text-right font-medium">天數</th>
                </tr>
              </thead>
              <tbody>
                {lifecycleRules.map((rule) => (
                  <tr key={rule.stage_key} className="border-b last:border-0">
                    <td className="py-2 font-medium">{rule.label}</td>
                    <td className="py-2 text-xs text-neutral-500">{rule.stage_key}</td>
                    <td className="py-2 text-right text-neutral-700">+{rule.day_offset} 天</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-sm font-semibold">最新 Trade 訂單</div>
            <div className="space-y-2">
              {latestTradeOrders.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">尚無 trade 訂單。</div>
              ) : null}
              {latestTradeOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{order.order_no}</span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        {order.status}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-neutral-500">
                      {order.user.company?.name ?? order.user.email} · {new Date(order.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="shrink-0 rounded-md border px-3 py-1.5 text-xs hover:bg-neutral-50"
                  >
                    查看訂單
                  </Link>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const QUOTATION_STATUS_LABEL: Record<string, string> = {
  quoted: "已報價",
  negotiating: "議價中",
  accepted: "已接受",
  rejected: "已婉拒",
  closed: "已結案",
};

const QUOTATION_STATUS_STYLE: Record<string, string> = {
  quoted: "bg-blue-100 text-blue-700",
  negotiating: "bg-amber-100 text-amber-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-neutral-100 text-neutral-500",
  closed: "bg-neutral-100 text-neutral-500",
};

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs text-neutral-400">{hint}</div> : null}
    </Card>
  );
}
