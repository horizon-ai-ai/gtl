"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatTWD } from "@/lib/utils";
import { Check } from "lucide-react";

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
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">方案與計費</h1>
        <p className="mt-1 text-sm text-neutral-500">
          管理訂閱、續約設定與最近的計費紀錄。正式金流尚未接 ECPay；目前這頁使用 sandbox 升級流程。
        </p>
      </div>

      {status ? <div className="rounded-md border bg-neutral-50 px-4 py-3 text-sm">{status}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
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

        <Card>
          <CardHeader>
            <CardTitle>最近計費紀錄</CardTitle>
            <CardDescription>目前為 sandbox invoice 紀錄，可先驗證方案切換流程。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-neutral-500">載入中...</div>
            ) : invoices.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">尚無計費紀錄。</div>
            ) : (
              invoices.map((invoice) => (
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
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const features = p.features ?? {};
          const isCurrent = sub?.plan.code === p.code;
          return (
            <Card key={p.id} className={isCurrent ? "ring-2 ring-neutral-900" : ""}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-semibold text-neutral-900">
                    {p.price_monthly === 0 ? "免費" : formatTWD(p.price_monthly)}
                  </span>
                  {p.price_monthly > 0 ? <span className="text-sm"> / 月</span> : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <FeatureRow label={`月 ${p.monthly_credits.toLocaleString()} credits`} />
                {Boolean(features["analytics.ga4"]) ? <FeatureRow label="GA4 整合" /> : null}
                {Boolean(features.trade_module) ? <FeatureRow label="貿易模組" /> : null}
                {Boolean(features.pagebuilder) ? <FeatureRow label={`建站 ${String(features["pagebuilder.max_sites"] ?? "1")} 站`} /> : null}
                {Boolean(features["rag.advanced"]) ? <FeatureRow label="進階 RAG 客服" /> : null}
                <Button
                  className="mt-4 w-full"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={actioning === p.code || isCurrent}
                  onClick={() =>
                    void mutateSubscription(
                      { action: "switch_plan", plan_code: p.code },
                      p.code,
                      `已切換到 ${p.name}`,
                    )
                  }
                >
                  {isCurrent ? "目前方案" : actioning === p.code ? "處理中..." : p.price_monthly === 0 ? "切換為免費" : "切換方案"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function FeatureRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Check className="h-4 w-4 text-green-600" />
      <span>{label}</span>
    </div>
  );
}
