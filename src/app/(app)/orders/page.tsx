"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatTWD } from "@/lib/utils";

type OrderItem = { id: string; name: string; quantity: number; unit_price: number; total: number };
type SuggestedItem = { name: string; quantity: number; unit: string; hint?: string };
type Order = {
  id: string;
  order_no: string;
  status: string;
  project_type?: string | null;
  title?: string | null;
  requirements_summary?: string | null;
  customer: { name: string };
  total: number;
  currency: string;
  items: OrderItem[];
  notes?: string | null;
  metadata?: { suggested_items?: SuggestedItem[] } | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending: "待付款",
  paid: "已付款",
  shipped: "已出貨",
  completed: "已完成",
  canceled: "已取消",
  refunded: "已退款",
  quote_pending: "等候報價",
  quoted: "已報價",
  confirmed: "已確認",
  in_execution: "執行中",
  closed: "結案",
  cancelled: "已取消",
};

const PROJECT_TYPE_LABEL: Record<string, string> = {
  website: "一頁式網站",
  product_page: "商品頁",
  copywriting: "行銷文案",
  design: "設計專案",
  project: "專案",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((j) => {
        setOrders(j.data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-6xl mx-auto pb-14">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">訂單管理</h1>
          <p className="mt-1 text-sm text-neutral-500">查看、編輯、匯出你的訂單與 AI 建單草稿。</p>
        </div>
        <a href="/api/orders/export.csv">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" /> 匯出 CSV
          </Button>
        </a>
      </div>
      {loading ? (
        <p className="text-neutral-500">載入中...</p>
      ) : orders.length === 0 ? (
        <Card className="p-12 text-center text-neutral-500">
          <p>尚無訂單</p>
          <p className="text-sm mt-2">透過 AI 對話可以協助你建立第一筆訂單</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-neutral-500">{o.order_no}</div>
                  <div className="font-medium mt-1">{o.title ?? o.customer.name}</div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {new Date(o.created_at).toLocaleString()} ·{" "}
                    {o.project_type
                      ? PROJECT_TYPE_LABEL[o.project_type] ?? o.project_type
                      : `${o.items.length} 項商品`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{o.project_type && o.total === 0 ? "待報價" : formatTWD(o.total)}</div>
                  <span className="inline-block mt-1 text-xs px-2 py-1 rounded bg-neutral-100">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                  <div className="mt-3">
                    <Link href={`/orders/${o.id}`}>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-4 w-4" /> 查看 / 編輯
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
              {o.project_type && o.requirements_summary ? (
                <div className="mt-4 rounded-md border bg-neutral-50 p-3">
                  <div className="text-sm font-medium">需求摘要</div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-600">
                    {o.requirements_summary}
                  </p>
                </div>
              ) : null}
              {o.status === "draft" && (o.metadata?.suggested_items?.length || o.notes) ? (
                <div className="mt-4 rounded-md border bg-neutral-50 p-3 space-y-3">
                  {o.metadata?.suggested_items?.length ? (
                    <div>
                      <div className="text-sm font-medium">建議品項</div>
                      <div className="mt-2 space-y-2">
                        {o.metadata.suggested_items.map((item, index) => (
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
                  {o.notes ? (
                    <div>
                      <div className="text-sm font-medium">草稿摘要</div>
                      <p className="mt-2 text-sm text-neutral-600 whitespace-pre-wrap">{o.notes}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
