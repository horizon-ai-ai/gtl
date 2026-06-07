"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Download,
  ExternalLink,
  FileText,
  MessageCircle,
  Receipt,
  Search,
  Video,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTWD } from "@/lib/utils";

/**
 * Orders list — restyled per the business-owner mock (G3 介面 2026/06/07 補件):
 *  - Top filter bar: date range, status, service type, file presence, keyword
 *  - One unified list across all service types (marketing / design / trade /
 *    website / other) with service-type pill on each row
 *  - Per-order card: stage explanation banner, table row of key fields,
 *    action button row (明細/歷程, 取消, 聊天室, 會議預約, 會議紀錄, 檔案壓縮下載)
 */

type ServiceType = "marketing" | "design" | "trade" | "website" | "other";

type OrderItem = { id: string; name: string; quantity: number; unit_price: number; total: number };

type SuggestedItem = { name: string; quantity: number; unit: string; hint?: string };

type ProjectQuote = {
  id: string;
  amount: number;
  status: string;
  quoted_at: string;
};

type Order = {
  id: string;
  order_no: string;
  status: string;
  project_type?: string | null;
  title?: string | null;
  requirements_summary?: string | null;
  customer: { name?: string } & Record<string, unknown>;
  total: number;
  currency: string;
  items: OrderItem[];
  quotes?: ProjectQuote[];
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  submitted_at?: string | null;
  service_type?: ServiceType;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending: "待付款",
  paid: "已付款",
  shipped: "已出貨",
  completed: "已完成",
  canceled: "已取消",
  cancelled: "已取消",
  refunded: "已退款",
  quote_pending: "報價中",
  quoted: "已報價",
  confirmed: "已確認",
  in_execution: "執行中",
  closed: "結案",
};

const SERVICE_TYPES: { value: ServiceType; label: string; dotVar: string }[] = [
  { value: "marketing", label: "行銷", dotVar: "var(--g3-growth-300)" },
  { value: "design", label: "設計", dotVar: "var(--g3-generate-300)" },
  { value: "trade", label: "貿易", dotVar: "var(--g3-global-300)" },
  { value: "website", label: "網站生成", dotVar: "var(--g3-generate-400)" },
  { value: "other", label: "其他", dotVar: "#9ca3af" },
];

const STATUSES: { value: string; label: string }[] = [
  { value: "in_execution", label: "執行中" },
  { value: "closed", label: "已結案" },
  { value: "quote_pending", label: "報價中" },
  { value: "paid", label: "訂金已支付" },
  { value: "completed", label: "尾款已支付" },
];

type Filters = {
  date_start: string;
  date_end: string;
  quote_date_start: string;
  quote_date_end: string;
  status: string;
  service_type: string;
  file_filter: "" | "quotation" | "invoice" | "files";
  q: string;
};

const EMPTY_FILTERS: Filters = {
  date_start: "",
  date_end: "",
  quote_date_start: "",
  quote_date_end: "",
  status: "",
  service_type: "",
  file_filter: "",
  q: "",
};

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.date_start) params.set("date_start", filters.date_start);
  if (filters.date_end) params.set("date_end", filters.date_end);
  if (filters.quote_date_start) params.set("quote_date_start", filters.quote_date_start);
  if (filters.quote_date_end) params.set("quote_date_end", filters.quote_date_end);
  if (filters.status) params.set("status", filters.status);
  if (filters.service_type) params.set("service_type", filters.service_type);
  if (filters.q) params.set("q", filters.q);
  return params.toString();
}

function stageExplanation(order: Order): { text: string; isNew: boolean } {
  // Per spec §Phase 8 — narrate the current stage to the customer in plain language.
  switch (order.status) {
    case "draft":
      return { text: "訂單草稿尚未送出，補完內容後即可送出報價需求。", isNew: false };
    case "quote_pending":
      return { text: "訂單已成立，您已送出需求，我們將於 3 日內回覆報價單", isNew: true };
    case "quoted":
      return { text: "報價單已送達，請確認並支付訂金以啟動執行。", isNew: true };
    case "paid":
      return { text: "已收到訂金，案件已進入執行階段。", isNew: false };
    case "in_execution":
      return { text: "案件執行中，您可在聊天室隨時追蹤進度。", isNew: false };
    case "shipped":
      return { text: "已出貨，請留意配送通知。", isNew: false };
    case "completed":
    case "closed":
      return { text: "此訂單已結案囉", isNew: false };
    case "canceled":
    case "cancelled":
      return { text: "此訂單已取消。", isNew: false };
    default:
      return { text: STATUS_LABEL[order.status] ?? order.status, isNew: false };
  }
}

function quotationUrl(order: Order): string | null {
  if (order.quotes && order.quotes.length > 0) {
    return `/api/orders/${order.id}/quotes/${order.quotes[0].id}/pdf`;
  }
  if ((order.metadata as Record<string, unknown> | undefined)?.source === "trade_inquiry") {
    const inquiryId = (order.metadata as Record<string, unknown>)?.inquiry_id;
    if (typeof inquiryId === "string") return `/api/trade/inquiries/${inquiryId}/quotation.pdf`;
  }
  return null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);

  const load = useCallback(async (active: Filters) => {
    setLoading(true);
    const qs = buildQuery(active);
    const res = await fetch(`/api/orders${qs ? `?${qs}` : ""}`);
    const j = await res.json();
    setOrders(j.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const applyFilters = () => setFilters(draft);
  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  const activeServiceLabel = useMemo(
    () => SERVICE_TYPES.find((s) => s.value === filters.service_type)?.label,
    [filters.service_type],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-8 pb-14">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">訂單列表</h1>
            <p className="mt-1 text-sm text-stone-500">
              統一管理 設計 · 行銷 · 貿易 · 網站生成 · 其他 五種類型訂單。
            </p>
          </div>
          <a href="/api/orders/export.csv">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> 匯出 CSV
            </Button>
          </a>
        </div>

        {/* Filter bar */}
        <Card className="mb-6 rounded-2xl p-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Date range */}
            <div>
              <label className="text-xs font-medium text-stone-600 flex items-center gap-1.5 mb-1.5">
                <CalendarRange className="h-3.5 w-3.5" /> 日期範圍
              </label>
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] w-14 text-stone-500">訂單</span>
                  <Input
                    type="date"
                    value={draft.date_start}
                    onChange={(e) => setDraft((d) => ({ ...d, date_start: e.target.value }))}
                    className="h-8 text-xs"
                  />
                  <span className="text-stone-400">~</span>
                  <Input
                    type="date"
                    value={draft.date_end}
                    onChange={(e) => setDraft((d) => ({ ...d, date_end: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] w-14 text-stone-500">報價</span>
                  <Input
                    type="date"
                    value={draft.quote_date_start}
                    onChange={(e) => setDraft((d) => ({ ...d, quote_date_start: e.target.value }))}
                    className="h-8 text-xs"
                  />
                  <span className="text-stone-400">~</span>
                  <Input
                    type="date"
                    value={draft.quote_date_end}
                    onChange={(e) => setDraft((d) => ({ ...d, quote_date_end: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="text-xs font-medium text-stone-600 mb-1.5 block">訂單狀態</label>
              <select
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                className="w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-sm"
              >
                <option value="">全部狀態</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Service type */}
            <div>
              <label className="text-xs font-medium text-stone-600 mb-1.5 block">服務類型</label>
              <select
                value={draft.service_type}
                onChange={(e) => setDraft((d) => ({ ...d, service_type: e.target.value }))}
                className="w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-sm"
              >
                <option value="">全部類型</option>
                {SERVICE_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* File filter */}
            <div>
              <label className="text-xs font-medium text-stone-600 mb-1.5 block">檔案</label>
              <select
                value={draft.file_filter}
                onChange={(e) => setDraft((d) => ({ ...d, file_filter: e.target.value as Filters["file_filter"] }))}
                className="w-full h-9 rounded-md border border-stone-200 bg-white px-2 text-sm"
              >
                <option value="">全部</option>
                <option value="quotation">報價已上傳</option>
                <option value="invoice">發票已上傳</option>
                <option value="files">檔案已上傳</option>
              </select>
            </div>
          </div>

          {/* Keyword search */}
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
            <label className="text-xs font-medium text-stone-600 md:w-40 shrink-0">
              關鍵字或訂單編號搜尋
            </label>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="例如：無印良品 / G20260101"
                className="h-9 pl-9 text-sm"
              />
            </div>
            <Button size="sm" onClick={applyFilters} className="bg-g3-brand text-white border-0 hover:opacity-90">
              搜尋
            </Button>
          </div>

          <div className="mt-3 flex items-center justify-end gap-3 text-xs">
            <button onClick={clearFilters} className="text-stone-500 hover:text-stone-800">
              [清除篩選]
            </button>
            <button onClick={applyFilters} className="text-growth-600 hover:text-growth-700 font-medium">
              [套用篩選]
            </button>
          </div>
        </Card>

        {/* Order list */}
        {loading ? (
          <p className="text-stone-500">載入中...</p>
        ) : orders.length === 0 ? (
          <Card className="p-12 text-center text-stone-500 rounded-2xl">
            <p>沒有符合條件的訂單</p>
            {filters !== EMPTY_FILTERS ? (
              <button onClick={clearFilters} className="mt-2 text-xs text-growth-600 hover:underline">
                清除篩選並查看全部
              </button>
            ) : (
              <p className="text-sm mt-2">透過 AI 對話可以協助你建立第一筆訂單</p>
            )}
          </Card>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}

        {activeServiceLabel ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-stone-500">
            <span>篩選中：</span>
            <span className="rounded-full bg-stone-100 px-2 py-0.5">服務類型 = {activeServiceLabel}</span>
            <button
              onClick={() => {
                setDraft((d) => ({ ...d, service_type: "" }));
                setFilters((f) => ({ ...f, service_type: "" }));
              }}
              className="text-stone-400 hover:text-stone-700"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const { text: stageText, isNew } = stageExplanation(order);
  const service = SERVICE_TYPES.find((s) => s.value === order.service_type);
  const quoteUrl = quotationUrl(order);
  const itemQty = order.items.reduce((sum, it) => sum + it.quantity, 0);
  const rawSuggested = order.metadata?.suggested_items;
  const suggestedItems = Array.isArray(rawSuggested) ? (rawSuggested as SuggestedItem[]) : [];

  return (
    <Card className="rounded-2xl border-stone-200 p-5 shadow-sm">
      {/* Stage banner */}
      <div className="mb-4 flex items-start gap-2 text-sm">
        <span className="text-stone-600">階段說明：</span>
        <span className="flex-1 text-stone-800">{stageText}</span>
        {isNew ? (
          <span className="rounded-full bg-err-500 px-2 py-0.5 text-[10px] font-medium text-white">
            new！
          </span>
        ) : null}
      </div>

      {/* Field grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs md:grid-cols-9">
        <Field label="訂單日期">
          {new Date(order.created_at).toLocaleDateString("zh-TW")}
        </Field>
        <Field label="訂單編號">
          <span className="font-mono">{order.order_no}</span>
        </Field>
        <Field label="訂單數量">{itemQty || "-"}</Field>
        <Field label="訂單總額">
          {order.total > 0 ? formatTWD(order.total) : "待報價"}
        </Field>
        <Field label="報價單">
          {quoteUrl ? (
            <a href={quoteUrl} className="text-growth-600 hover:underline" target="_blank" rel="noreferrer">
              下載
            </a>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </Field>
        <Field label="訂金支付">
          {["paid", "in_execution", "shipped", "completed", "closed"].includes(order.status) ? (
            <span className="text-stone-700">已付款</span>
          ) : order.status === "quoted" ? (
            <Link href={`/orders/${order.id}`} className="text-growth-600 hover:underline">
              前往付款
            </Link>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </Field>
        <Field label="尾款支付">
          {order.status === "completed" || order.status === "closed" ? (
            <span className="text-stone-700">{formatTWD(Math.round(order.total / 2))}</span>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </Field>
        <Field label="訂單狀態">
          <div className="flex items-center gap-1.5">
            {service ? (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: service.dotVar }}
                title={service.label}
              />
            ) : null}
            <span>{STATUS_LABEL[order.status] ?? order.status}</span>
          </div>
        </Field>
        <Field label="發票">
          {order.status === "completed" || order.status === "closed" ? (
            <a href="#" className="text-growth-600 hover:underline">
              線上列印
            </a>
          ) : (
            <span className="text-stone-400">—</span>
          )}
        </Field>
      </div>

      {/* Draft-order AI 建議品項 block — pre-redesign behavior restored (review #2) */}
      {order.status === "draft" && (suggestedItems.length || order.notes) ? (
        <div className="mt-4 rounded-md border bg-neutral-50 p-3 space-y-3">
          {suggestedItems.length ? (
            <div>
              <div className="text-sm font-medium">建議品項</div>
              <div className="mt-2 space-y-2">
                {suggestedItems.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex items-start justify-between gap-3 rounded border bg-white px-3 py-2"
                  >
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-neutral-500">{item.hint ?? "請補完整品項資料"}</div>
                    </div>
                    <div className="text-xs text-neutral-500 whitespace-nowrap">
                      {item.quantity} {item.unit}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {order.notes ? (
            <div>
              <div className="text-sm font-medium">草稿摘要</div>
              <p className="mt-2 text-sm text-neutral-600 whitespace-pre-wrap">{order.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Action row */}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
        <Link href={`/orders/${order.id}`}>
          <Button size="sm" variant="default" className="bg-stone-900 text-white hover:bg-stone-800">
            <ExternalLink className="h-3.5 w-3.5" /> 訂單明細／歷程
          </Button>
        </Link>
        {["draft", "quote_pending", "quoted"].includes(order.status) ? (
          <Button size="sm" variant="outline" className="text-stone-700">
            取消訂單
          </Button>
        ) : null}
        <Link href={`/orders/${order.id}#chat`}>
          <Button size="sm" variant="outline">
            <MessageCircle className="h-3.5 w-3.5" /> 訂單聊天室
          </Button>
        </Link>
        <Button size="sm" variant="outline">
          <Video className="h-3.5 w-3.5" /> 會議預約
        </Button>
        <Button size="sm" variant="outline">
          <FileText className="h-3.5 w-3.5" /> 會議紀錄
        </Button>
        <Button size="sm" variant="outline">
          <Receipt className="h-3.5 w-3.5" /> 檔案壓縮下載
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-stone-400">{label}</span>
      <span className="text-stone-800">{children}</span>
    </div>
  );
}
