"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTWD } from "@/lib/utils";
import { buildTradeLifecycleTimeline, DEFAULT_TRADE_LIFECYCLE_RULES } from "@/lib/trade-lifecycle";

type OrderItem = {
  id?: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  total?: number;
};

type OrderEvent = {
  id: string;
  type: string;
  actor: string;
  data: unknown;
  created_at: string;
};

type Order = {
  id: string;
  order_no: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
  };
  items: OrderItem[];
  shipping: number;
  tax: number;
  subtotal: number;
  total: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  events: OrderEvent[];
};

const STATUS_OPTIONS = ["draft", "pending", "paid", "shipped", "completed", "canceled", "refunded"];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void loadOrder();
  }, [params.id]);

  async function loadOrder() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/orders/${params.id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "訂單載入失敗");
      setLoading(false);
      return;
    }
    setOrder(json.data);
    setLoading(false);
  }

  function updateOrder(patch: Partial<Order>) {
    setOrder((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateCustomer<K extends keyof Order["customer"]>(key: K, value: Order["customer"][K]) {
    setOrder((prev) => (prev ? { ...prev, customer: { ...prev.customer, [key]: value } } : prev));
  }

  function updateItem(index: number, patch: Partial<OrderItem>) {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...patch } : item,
            ),
          }
        : prev,
    );
  }

  function addItem() {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            items: [...prev.items, { name: "", description: "", quantity: 1, unit_price: 0 }],
          }
        : prev,
    );
  }

  function removeItem(index: number) {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.filter((_, itemIndex) => itemIndex !== index),
          }
        : prev,
    );
  }

  const subtotal = useMemo(
    () => order?.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) ?? 0,
    [order],
  );
  const total = subtotal + (order?.shipping ?? 0) + (order?.tax ?? 0);
  const tradeTimeline =
    order && order.metadata?.source === "trade_inquiry"
      ? buildTradeLifecycleTimeline(order.created_at, DEFAULT_TRADE_LIFECYCLE_RULES)
      : [];

  async function saveOrder() {
    if (!order) return;
    setSaving(true);
    setError("");
    setNotice("");

    const res = await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: order.status,
        customer: order.customer,
        items: order.items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description ?? undefined,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
        })),
        shipping: Number(order.shipping),
        tax: Number(order.tax),
        notes: order.notes ?? "",
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "訂單更新失敗");
      setSaving(false);
      return;
    }

    setOrder(json.data);
    setNotice("訂單已更新");
    setSaving(false);
  }

  async function deleteOrder() {
    if (!order) return;
    setDeleting(true);
    setError("");
    setNotice("");

    const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "刪除訂單失敗");
      setDeleting(false);
      return;
    }

    router.push("/orders");
    router.refresh();
  }

  async function createSupportTicket() {
    if (!order) return;
    setCreatingTicket(true);
    setError("");
    setNotice("");

    const res = await fetch(`/api/orders/${order.id}/support-ticket`, {
      method: "POST",
    });
    const json = await res.json();
    setCreatingTicket(false);

    if (!res.ok) {
      setError(json.error?.message ?? "建立客服工單失敗");
      return;
    }

    setNotice("已建立客服工單，正在帶你前往支援頁");
    router.push("/support");
    router.refresh();
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl p-8 text-neutral-500">載入中...</div>;
  }

  if (!order) {
    return <div className="mx-auto max-w-6xl p-8 text-red-600">{error || "找不到訂單"}</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/orders" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> 返回訂單列表
          </Link>
          <h1 className="mt-3 text-2xl font-semibold">{order.order_no}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            建立於 {new Date(order.created_at).toLocaleString()}，最後更新 {new Date(order.updated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => void createSupportTicket()} disabled={creatingTicket}>
            {creatingTicket ? "建立工單中..." : "轉人工處理"}
          </Button>
          {order.status === "draft" ? (
            <Button type="button" variant="outline" onClick={() => void deleteOrder()} disabled={deleting}>
              <Trash2 className="h-4 w-4" /> {deleting ? "刪除中..." : "刪除草稿"}
            </Button>
          ) : null}
          <Button type="button" onClick={() => void saveOrder()} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "儲存中..." : "儲存變更"}
          </Button>
        </div>
      </div>

      {(error || notice) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {error || notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>訂單內容</CardTitle>
            <CardDescription>可直接調整品項、數量、單價、運費與稅額。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="狀態">
              <select
                value={order.status}
                onChange={(e) => updateOrder({ status: e.target.value })}
                className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">品項</div>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  新增品項
                </Button>
              </div>
              {order.items.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">目前沒有品項。</div>
              ) : (
                order.items.map((item, index) => (
                  <div key={item.id ?? index} className="rounded-md border p-4 space-y-3">
                    <div className="grid gap-3 md:grid-cols-[1.6fr,1fr,1fr]">
                      <Field label="名稱">
                        <Input
                          value={item.name}
                          onChange={(e) => updateItem(index, { name: e.target.value })}
                        />
                      </Field>
                      <Field label="數量">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, { quantity: Number(e.target.value || 0) })}
                        />
                      </Field>
                      <Field label="單價">
                        <Input
                          type="number"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, { unit_price: Number(e.target.value || 0) })}
                        />
                      </Field>
                    </div>
                    <Field label="描述">
                      <textarea
                        value={item.description ?? ""}
                        onChange={(e) => updateItem(index, { description: e.target.value })}
                        className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                      />
                    </Field>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-neutral-500">小計：{formatTWD(item.quantity * item.unit_price)}</div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)}>
                        移除
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="運費">
                <Input
                  type="number"
                  min="0"
                  value={order.shipping}
                  onChange={(e) => updateOrder({ shipping: Number(e.target.value || 0) })}
                />
              </Field>
              <Field label="稅額">
                <Input
                  type="number"
                  min="0"
                  value={order.tax}
                  onChange={(e) => updateOrder({ tax: Number(e.target.value || 0) })}
                />
              </Field>
            </div>

            <Field label="備註">
              <textarea
                value={order.notes ?? ""}
                onChange={(e) => updateOrder({ notes: e.target.value })}
                className="min-h-32 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              />
            </Field>

            <div className="rounded-md border bg-neutral-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span>商品小計</span>
                <span>{formatTWD(subtotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>運費</span>
                <span>{formatTWD(order.shipping)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>稅額</span>
                <span>{formatTWD(order.tax)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3 font-semibold">
                <span>訂單總額</span>
                <span>{formatTWD(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>客戶資料</CardTitle>
              <CardDescription>這裡對應 order customer JSON。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="客戶名稱">
                <Input value={order.customer.name} onChange={(e) => updateCustomer("name", e.target.value)} />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={order.customer.email ?? ""}
                  onChange={(e) => updateCustomer("email", e.target.value)}
                />
              </Field>
              <Field label="電話">
                <Input value={order.customer.phone ?? ""} onChange={(e) => updateCustomer("phone", e.target.value)} />
              </Field>
              <Field label="統編">
                <Input value={order.customer.tax_id ?? ""} onChange={(e) => updateCustomer("tax_id", e.target.value)} />
              </Field>
              <Field label="地址">
                <textarea
                  value={order.customer.address ?? ""}
                  onChange={(e) => updateCustomer("address", e.target.value)}
                  className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
                />
              </Field>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
              <CardTitle>訂單事件</CardTitle>
              <CardDescription>顯示目前 user side 可見的 order events。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.events.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">尚無事件。</div>
              ) : (
                order.events.map((event) => (
                  <div key={event.id} className="rounded-md border p-3 text-sm">
                    <div className="font-medium">
                      {event.type} · {event.actor}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">{new Date(event.created_at).toLocaleString()}</div>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-neutral-600">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </CardContent>
        </Card>
      </div>

      {tradeTimeline.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>貿易訂單生命週期</CardTitle>
            <CardDescription>依 admin portal 設定的規則式天數間隔顯示預估節點。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-6">
            {tradeTimeline.map((stage) => (
              <div key={stage.stage_key} className="rounded-md border bg-neutral-50 p-3 text-sm">
                <div className="font-medium">{stage.label}</div>
                <div className="mt-1 text-neutral-500">+{stage.day_offset} 天</div>
                <div className="mt-2">{stage.estimated_at.toLocaleDateString()}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
