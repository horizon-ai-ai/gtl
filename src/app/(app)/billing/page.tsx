"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatTWD } from "@/lib/utils";
import { Check } from "lucide-react";

const PLAN_COLUMNS = [
  {
    code: "free",
    title: "Seed 種子體驗",
    audience: "想試用功能的你",
    price: "0",
    chat: "100次\n＊依公平使用原則與系統資源合理分配",
    image: "10張 1K畫素 (logo浮水印)",
    onepage: "可產1次、不提供下載",
    sharedAccounts: "-",
    tradeProducts: "-",
    inquiries: "-",
    trial: "-",
    recommended: false,
  },
  {
    code: "starter",
    title: "Rise 入門版",
    audience: "個人創業者 / 小型品牌",
    price: "299/月",
    chat: "無限\n＊依公平使用原則與系統資源合理分配",
    image: "30張1K畫素 (logo浮水印)",
    onepage: "2次，未提供下載PNG\\HTML",
    sharedAccounts: "-",
    tradeProducts: "-",
    inquiries: "-",
    trial: "-",
    recommended: false,
  },
  {
    code: "pro",
    title: "Win 進階版",
    audience: "穩定經營品牌",
    price: "1980/月",
    chat: "無限",
    image: "不含浮水印\n1K 50/pcs\n2K 20/pcs\n4K 5/pcs",
    onepage: "2次 提供png下載/HTML",
    sharedAccounts: "1",
    tradeProducts: "-",
    inquiries: "-",
    trial: "-",
    recommended: false,
  },
  {
    code: "lead",
    title: "Lead 商業版",
    audience: "有銷售與上架需求的企業",
    price: "5980/月",
    chat: "無限",
    image: "不含浮水印\n1K 100/pcs\n2K 50/pcs\n4K 10/pcs",
    onepage: "10次 提供png下載/HTML",
    sharedAccounts: "3",
    tradeProducts: "2筆",
    inquiries: "20次",
    trial: "申請7天體驗，綁信用卡",
    recommended: true,
  },
  {
    code: "prime",
    title: "Prime 團隊版",
    audience: "團隊協作 / 多品牌產品經營",
    price: "12800/月",
    chat: "無限",
    image: "不含浮水印\n1K 500/pcs\n2K 200/pcs\n4K 100/pcs",
    onepage: "無限(超量限流/每日平均分配) 提供png下載/HTML",
    sharedAccounts: "5",
    tradeProducts: "1000筆",
    inquiries: "無限",
    trial: "申請7天體驗，綁信用卡",
    recommended: false,
  },
];

const PLAN_ROWS = [
  { key: "audience", label: "適合對象" },
  { key: "price", label: "費用" },
  { key: "chat", label: "對話" },
  { key: "image", label: "產圖" },
  { key: "onepage", label: "一頁式生成" },
  { key: "sharedAccounts", label: "共用帳號" },
  { key: "tradeProducts", label: "貿易上架商品" },
  { key: "inquiries", label: "詢價/報價次數" },
  { key: "trial", label: "申請體驗" },
] as const;

const CUSTOM_SERVICE_PITCH =
  "若是您喜歡G³系統中的功能，我們提供客製化服務，都能依照需求選擇最適合的方案。歡迎洽詢";

type Plan = {
  id: string;
  code: string;
  name: string;
  price_monthly: number;
  monthly_credits: number;
  features: Record<string, unknown>;
};

type Subscription = {
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  plan: { code: string; name: string; price_monthly: number; monthly_credits: number };
} | null;

type Invoice = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [plansRes, subRes, invoiceRes] = await Promise.all([
      fetch("/api/billing/plans"),
      fetch("/api/billing/subscription"),
      fetch("/api/billing/invoices"),
    ]);
    const [plansJson, subJson, invoiceJson] = await Promise.all([
      plansRes.json(),
      subRes.json(),
      invoiceRes.json(),
    ]);
    setPlans(plansJson.data ?? []);
    setSub(subJson.data ?? null);
    setInvoices(invoiceJson.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function mutateSubscription(payload: Record<string, unknown>, key: string, successMessage: string) {
    setActioning(key);
    setStatus(null);
    const res = await fetch("/api/billing/subscription", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setActioning(null);
    if (!res.ok) {
      setStatus(json.error?.message ?? "更新方案失敗");
      return;
    }
    setStatus(successMessage);
    await load();
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">方案與計費</h1>
        <p className="mt-1 text-sm text-neutral-500">
          管理訂閱、續約設定與最近的計費紀錄。正式金流尚未接 ECPay；目前這頁使用 sandbox 升級流程。
        </p>
      </div>

      {status ? <div className="rounded-md border bg-neutral-50 px-4 py-3 text-sm">{status}</div> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr,0.8fr] lg:items-stretch">
        <Card>
          <CardHeader>
            <CardTitle>目前方案</CardTitle>
            <CardDescription>可直接切換方案，或設定到期後取消續訂。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-sm text-neutral-500">載入中...</div>
            ) : sub ? (
              <>
                <div className="rounded-lg border bg-neutral-50 p-4">
                  <div className="text-lg font-medium">{sub.plan.name}</div>
                  <div className="mt-1 text-sm text-neutral-600">
                    {sub.status} · {formatTWD(sub.plan.price_monthly)} / 月 · {sub.plan.monthly_credits.toLocaleString()} credits
                  </div>
                  <div className="mt-2 text-sm text-neutral-500">
                    週期：{new Date(sub.current_period_start).toLocaleDateString()} - {new Date(sub.current_period_end).toLocaleDateString()}
                  </div>
                  <div className="mt-1 text-sm text-neutral-500">
                    自動續訂：{sub.cancel_at_period_end ? "已停止，期末取消" : "開啟"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {sub.cancel_at_period_end ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void mutateSubscription({ action: "resume" }, "resume", "已恢復自動續訂")}
                      disabled={actioning === "resume"}
                    >
                      {actioning === "resume" ? "處理中..." : "恢復自動續訂"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void mutateSubscription(
                          { action: "cancel_at_period_end" },
                          "cancel",
                          "已設定在本期結束後取消續訂",
                        )
                      }
                      disabled={actioning === "cancel"}
                    >
                      {actioning === "cancel" ? "處理中..." : "期末取消續訂"}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-neutral-500">尚未建立訂閱，請直接從下方案卡選擇。</div>
            )}
          </CardContent>
        </Card>

        <div className="relative lg:min-h-0">
        <Card className="flex flex-col lg:absolute lg:inset-0">
          <CardHeader>
            <CardTitle>最近計費紀錄</CardTitle>
            <CardDescription>目前為 sandbox invoice 紀錄，可先驗證方案切換流程。</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            {loading ? (
              <div className="text-sm text-neutral-500">載入中...</div>
            ) : invoices.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">尚無計費紀錄。</div>
            ) : (
              <div className="max-h-72 space-y-3 overflow-y-auto pr-1 lg:max-h-full">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{invoice.type}</div>
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">{invoice.status}</span>
                    </div>
                    <div className="mt-1 text-neutral-700">{formatTWD(invoice.amount)} {invoice.currency}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {new Date(invoice.created_at).toLocaleString()}
                      {invoice.paid_at ? ` · paid ${new Date(invoice.paid_at).toLocaleString()}` : ""}
                    </div>
                    {invoice.metadata?.plan_name ? (
                      <div className="mt-1 text-xs text-neutral-500">
                        方案：{String(invoice.metadata.plan_name)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>方案比較</CardTitle>
          <CardDescription>依需求選擇方案；Lead 商業版為商業落地首選。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-5 pt-0 lg:p-6 lg:pt-0">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 border border-neutral-200 bg-blue-50/70 px-3 py-3 text-left font-semibold text-neutral-800">
                  項目
                </th>
                {PLAN_COLUMNS.map((column) => (
                  <th
                    key={column.code}
                    className="border border-neutral-200 bg-blue-50/70 px-3 py-3 text-center font-semibold text-neutral-800"
                  >
                    {column.recommended ? (
                      <div className="mb-1 text-xs font-semibold italic text-blue-700">最推薦｜商業落地首選</div>
                    ) : null}
                    {column.title}
                    {sub?.plan.code === column.code ? (
                      <div className="mt-1 text-xs font-normal text-emerald-600">目前方案</div>
                    ) : null}
                  </th>
                ))}
                <th className="w-44 border border-neutral-200 bg-blue-50/70 px-3 py-3 text-center font-semibold text-neutral-800">
                  客製化服務
                </th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ROWS.map((row, rowIndex) => (
                <tr key={row.key} className={rowIndex % 2 === 1 ? "bg-neutral-50/60" : ""}>
                  <td className="border border-neutral-200 px-3 py-3 font-medium text-neutral-700">{row.label}</td>
                  {PLAN_COLUMNS.map((column) => (
                    <td
                      key={`${row.key}-${column.code}`}
                      className="whitespace-pre-line border border-neutral-200 px-3 py-3 text-center text-neutral-700"
                    >
                      {column[row.key]}
                    </td>
                  ))}
                  {rowIndex === 0 ? (
                    <td
                      rowSpan={PLAN_ROWS.length + 2}
                      className="border border-neutral-200 bg-white px-4 py-3 text-center align-middle text-neutral-600"
                    >
                      {CUSTOM_SERVICE_PITCH}
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr>
                <td className="border border-neutral-200 px-3 py-3 font-medium text-neutral-700">人工處理報價服務</td>
                {PLAN_COLUMNS.map((column) => (
                  <td key={`manual-${column.code}`} className="border border-neutral-200 px-3 py-3 text-center">
                    <Check className="mx-auto h-4 w-4 text-green-600" />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border border-neutral-200 px-3 py-3" />
                {PLAN_COLUMNS.map((column) => {
                  const plan = plans.find((p) => p.code === column.code);
                  const isCurrent = sub?.plan.code === column.code;
                  return (
                    <td key={`action-${column.code}`} className="border border-neutral-200 px-3 py-3 text-center">
                      <Button
                        size="sm"
                        variant={isCurrent || column.recommended ? "default" : "outline"}
                        disabled={!plan || actioning === column.code || isCurrent}
                        onClick={() =>
                          plan
                            ? void mutateSubscription(
                                { action: "switch_plan", plan_code: plan.code },
                                column.code,
                                `已切換到 ${plan.name}`,
                              )
                            : undefined
                        }
                      >
                        {isCurrent
                          ? "目前方案"
                          : actioning === column.code
                            ? "處理中..."
                            : plan?.price_monthly === 0
                              ? "免費開始"
                              : "切換方案"}
                      </Button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
