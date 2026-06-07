"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cleanTaskSummary, customerInputsText } from "@/lib/project-brief";
import { formatTWD } from "@/lib/utils";
import { buildTradeLifecycleTimeline, DEFAULT_TRADE_LIFECYCLE_RULES } from "@/lib/trade-lifecycle";
import { deriveTradeStages } from "@/lib/trade-order-stages";
import { TradeOrderTimeline } from "@/components/app/trade-order-timeline";
import { useSession } from "next-auth/react";

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

type ProjectQuote = {
  id: string;
  amount: number;
  deposit_amount: number;
  currency: string;
  cancellation_terms: string;
  valid_days: number;
  quoted_at: string;
  expires_at: string;
  status: string;
};

type RevisionQuota = {
  total: number;
  used: number;
};

type OrderMessage = {
  id: string;
  sender_role: string;
  kind: string;
  body: string;
  consumes_revision: boolean;
  attachments?: unknown;
  created_at: string;
};

type StatusHistory = {
  id: string;
  from_status?: string | null;
  to_status: string;
  reason?: string | null;
  created_at: string;
};

type Order = {
  id: string;
  user_id: string;
  order_no: string;
  status: string;
  project_type?: string | null;
  title?: string | null;
  requirements_summary?: string | null;
  deliverable_snapshot?: Record<string, unknown> | null;
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
  quotes?: ProjectQuote[];
  revision_quota?: RevisionQuota | null;
  messages?: OrderMessage[];
  status_history?: StatusHistory[];
};

const STATUS_OPTIONS = ["draft", "pending", "paid", "shipped", "completed", "canceled", "refunded", "quote_pending", "quoted", "confirmed", "in_execution", "closed", "cancelled"];
const PROJECT_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  quote_pending: "等候報價",
  quoted: "已報價",
  confirmed: "已確認",
  in_execution: "執行中",
  closed: "結案",
  cancelled: "已取消",
};
const PROJECT_STATUS_FLOW = ["draft", "quote_pending", "quoted", "confirmed", "in_execution", "closed"];
const PROJECT_TYPE_LABEL: Record<string, string> = {
  website: "網站製作",
  product_page: "商品頁製作",
  copywriting: "文案製作",
  design: "設計製作",
  project: "專案製作",
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

const BRIEF_FIELD_LABELS: Record<string, string> = {
  brandName: "品牌名稱",
  productName: "商品 / 服務名稱",
  promotedProduct: "主推商品",
  targetAudience: "目標客群",
  marketingGoal: "行銷目標",
  coreMessage: "核心訊息",
  tone: "語氣",
  style: "風格",
  visualStyle: "視覺風格",
  websiteType: "網站類型",
  pageGoal: "頁面目標",
  sections: "頁面段落",
  productImages: "商品圖片",
  referenceImages: "參考圖片",
  budget: "預算",
  deadline: "期限",
  brandContext: "品牌脈絡",
  offer: "主打優惠",
};

function labelForBriefKey(key: string) {
  return BRIEF_FIELD_LABELS[key] ?? key;
}

function previewJson(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  const text = JSON.stringify(value, null, 2);
  return text.length > 1800 ? `${text.slice(0, 1800)}...` : text;
}

function actorLabel(actor: string) {
  if (actor === "user") return "你";
  if (actor === "admin") return "GTL 團隊";
  if (actor === "system") return "系統";
  return "GTL";
}

function messageSenderLabel(role: string) {
  if (role === "customer") return "你";
  if (role === "reviewer") return "GTL 團隊";
  if (role === "system") return "系統";
  return role || "訊息";
}

function messageKindLabel(kind: string) {
  if (kind === "progress_update") return "進度更新";
  if (kind === "revision_request") return "修改需求";
  if (kind === "system_event") return "系統紀錄";
  return "對話";
}

function messageKindClass(kind: string, onDark = false) {
  if (onDark) return "bg-canvas/15 text-canvas";
  if (kind === "progress_update") return "bg-brand-50 text-brand-600";
  if (kind === "revision_request") return "bg-accent-50 text-accent-600";
  if (kind === "system_event") return "bg-sunken text-ink-500";
  return "bg-surface text-ink-500";
}

function eventSummary(event: OrderEvent) {
  const data = recordValue(event.data);
  const metadata = recordValue(data.metadata);
  const revision = recordValue(data.project_revision);
  const version = typeof data.version === "number"
    ? data.version
    : typeof revision.version === "number"
      ? revision.version
      : null;
  const projectType = stringValue(data.project_type) || stringValue(metadata.project_type);
  const projectTypeLabel = PROJECT_TYPE_LABEL[projectType] ?? projectType;

  switch (event.type) {
    case "draft_created":
      return {
        title: "已建立草稿",
        description: "你已先保存這筆需求，還可以繼續調整後再送出。",
        detail: projectTypeLabel ? `類型：${projectTypeLabel}` : "",
      };
    case "created":
      return {
        title: "已送出需求",
        description: "GTL 已收到你的需求，接下來會依內容進行報價與排程。",
        detail: projectTypeLabel ? `類型：${projectTypeLabel}` : "",
      };
    case "project_order_revision_created":
      return {
        title: version ? `已建立第 ${version} 版訂單` : "已建立新版訂單",
        description: stringValue(data.previous_order_id)
          ? "這版是根據你後續修改後重新送出的需求，前一版會保留紀錄方便對照。"
          : "這是此專案的第一版訂單。",
        detail: stringValue(data.relation) === "supersedes_unconfirmed_order"
          ? "前一版尚未付款，已自動作廢，以此版為準。"
          : "",
      };
    case "project_order_superseded":
      return {
        title: "已改用新版需求",
        description: "你後續送出了新版內容，這一版已停止報價或付款流程。",
        detail: stringValue(data.next_order_no) ? `新版訂單：${stringValue(data.next_order_no)}` : "",
      };
    case "execution_started":
      return {
        title: "已開始執行",
        description: "GTL 團隊已接手製作，後續會在訂單聊天室同步進度。",
        detail: "",
      };
    case "admin_marked_abnormal":
      return {
        title: "訂單需要人工確認",
        description: "GTL 團隊已標記此訂單需要補充確認，請留意後續訊息。",
        detail: stringValue(data.reason),
      };
    case "admin_force_canceled":
      return {
        title: "訂單已取消",
        description: "這筆訂單已由 GTL 團隊取消。",
        detail: stringValue(data.reason),
      };
    default:
      return {
        title: EVENT_TYPE_LABEL[event.type] ?? "訂單狀態已更新",
        description: `${actorLabel(event.actor)}更新了訂單紀錄。`,
        detail: "",
      };
  }
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  created: "已送出需求",
  draft_created: "已建立草稿",
  execution_started: "已開始執行",
  admin_marked_abnormal: "需要人工確認",
  admin_force_canceled: "訂單已取消",
  project_order_revision_created: "已建立訂單版本",
  project_order_superseded: "已改用新版需求",
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const loadOrder = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError("");
    }
    const res = await fetch(`/api/orders/${params.id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "訂單載入失敗");
      if (!options?.silent) setLoading(false);
      return;
    }
    setOrder(json.data);
    setLastSyncedAt(new Date());
    if (!options?.silent) setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    if (!order?.project_type) return;
    if (order.status === "closed" || order.status === "cancelled" || order.status === "canceled") return;
    const timer = window.setInterval(() => {
      void loadOrder({ silent: true });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadOrder, order?.id, order?.project_type, order?.status]);

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
  const isProjectOrder = Boolean(order?.project_type);
  const activeQuote = order?.quotes?.find((quote) => quote.status === "active") ?? order?.quotes?.[0] ?? null;
  const revisionQuota = order?.revision_quota;
  const revisionRemaining = revisionQuota ? Math.max(0, revisionQuota.total - revisionQuota.used) : 0;

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

  async function runProjectAction(path: string, body?: Record<string, unknown>) {
    if (!order) return;
    setProjectBusy(true);
    setError("");
    setNotice("");
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "操作失敗");
      setProjectBusy(false);
      return;
    }
    setOrder(json.data);
    setNotice("操作已完成");
    setProjectBusy(false);
  }

  async function sendProjectMessage(kind: "message" | "revision_request") {
    if (!order || !messageDraft.trim()) return;
    const body = messageDraft.trim();
    setMessageDraft("");
    setProjectBusy(true);
    setError("");
    setNotice("");
    const res = await fetch(`/api/orders/${order.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, kind }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error?.message ?? "訊息送出失敗");
      setProjectBusy(false);
      return;
    }
    await loadOrder({ silent: true });
    setNotice(kind === "revision_request" ? "修改需求已送出" : "訊息已送出");
    setProjectBusy(false);
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl p-8 text-neutral-500">載入中...</div>;
  }

  if (!order) {
    return <div className="mx-auto max-w-6xl p-8 text-red-600">{error || "找不到訂單"}</div>;
  }

  const deliverableSnapshot = recordValue(order.deliverable_snapshot);
  const alignmentSnapshot = recordValue(deliverableSnapshot.alignment);
  const requirementSummary = cleanTaskSummary(order.requirements_summary);
  const projectRevision = recordValue(order.metadata?.project_revision);
  const projectVersion = typeof projectRevision.version === "number" ? projectRevision.version : 1;
  const previousOrderId = stringValue(projectRevision.previousOrderId);
  const revisionRelation = stringValue(projectRevision.relation);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-8 pb-14">
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
          {!isProjectOrder ? (
            <Button type="button" onClick={() => void saveOrder()} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? "儲存中..." : "儲存變更"}
            </Button>
          ) : null}
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

      {/* Trade-order timeline (spec §Phase 9a) — header card with 9-stage stepper */}
      {order && order.metadata?.source === "trade_inquiry" ? (() => {
        const stages = deriveTradeStages({ status: order.status, metadata: order.metadata });
        const caseNo =
          (order.metadata?.inquiry_id as string | undefined) ?? order.order_no;
        const supplier =
          (order.customer?.name as string | undefined) ??
          (order.metadata?.supplier as string | undefined) ??
          "—";
        // ETA = created_at + last stage day_offset (21 days) for display
        const etaDate = new Date(
          new Date(order.created_at).getTime() + 21 * 24 * 60 * 60 * 1000,
        );
        const etaDisplay = etaDate
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "");
        const role = (session?.user as { role?: string } | undefined)?.role;
        const canAdvance =
          role === "admin" || role === "super_admin" || session?.user?.id === order.user_id;
        return (
          <TradeOrderTimeline
            orderId={order.id}
            caseNo={caseNo}
            supplier={supplier}
            etaDisplay={etaDisplay}
            stages={stages}
            canAdvance={canAdvance}
            inquiryId={(order.metadata?.inquiry_id as string | undefined) ?? null}
            onAdvanced={() => void loadOrder()}
          />
        );
      })() : null}

      {isProjectOrder ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {order.title ?? "專案訂單"}
              <span className="rounded-pill bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">v{projectVersion}</span>
            </CardTitle>
            <CardDescription>
              報價、訂金、修改額度與執行聊天室會在這裡流轉。
              {previousOrderId ? ` 此版本接續前一版需求${revisionRelation === "supersedes_unconfirmed_order" ? "，前一版未付款訂單已作廢" : ""}。` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-6">
              {PROJECT_STATUS_FLOW.map((status) => {
                const active = order.status === status;
                const reached = (order.status_history ?? []).some((item) => item.to_status === status) || active;
                return (
                  <div key={status} className={`rounded-md border p-3 text-sm ${active ? "border-neutral-900 bg-neutral-900 text-white" : reached ? "bg-neutral-50" : "text-neutral-400"}`}>
                    <div className="font-medium">{PROJECT_STATUS_LABEL[status]}</div>
                  </div>
                );
              })}
            </div>

            {requirementSummary ? (
              <div className="rounded-md border bg-neutral-50 p-4">
                <div className="text-sm font-medium">需求摘要</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{requirementSummary}</p>
              </div>
            ) : null}

            <ProjectAlignmentPanel snapshot={deliverableSnapshot} alignment={alignmentSnapshot} />

            {activeQuote ? (
              <div className="grid gap-4 md:grid-cols-3">
                <InfoBox label="報價金額" value={formatTWD(activeQuote.amount)} />
                <InfoBox label="訂金" value={formatTWD(activeQuote.deposit_amount)} />
                <InfoBox label="報價效期" value={`${new Date(activeQuote.expires_at).toLocaleDateString()} 到期`} />
                <div className="rounded-md border bg-neutral-50 p-4 text-sm md:col-span-3">
                  <div className="font-medium">取消條款</div>
                  <div className="mt-2 whitespace-pre-wrap text-neutral-600">{activeQuote.cancellation_terms}</div>
                </div>
              </div>
            ) : order.status === "quote_pending" ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">已送出需求，等待後台報價。</div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {order.status === "draft" ? (
                <Button type="button" disabled={projectBusy} onClick={() => void runProjectAction(`/api/orders/${order.id}/submit`)}>
                  確認細節，送出訂單
                </Button>
              ) : null}
              {order.status === "quoted" && activeQuote ? (
                <Button type="button" disabled={projectBusy} onClick={() => void runProjectAction(`/api/orders/${order.id}/accept-quote`, { method: "manual" })}>
                  支付訂金確定下單
                </Button>
              ) : null}
              {["quote_pending", "quoted", "confirmed", "in_execution"].includes(order.status) ? (
                <Button type="button" variant="outline" disabled={projectBusy} onClick={() => void runProjectAction(`/api/orders/${order.id}/cancel`, { reason: "客戶取消" })}>
                  取消訂單
                </Button>
              ) : null}
              {["confirmed", "in_execution"].includes(order.status) ? (
                <Button type="button" variant="outline" disabled={projectBusy} onClick={() => void runProjectAction(`/api/orders/${order.id}/revision-quota/purchase`, { quantity: 1, method: "manual" })}>
                  加購 1 次修改額度
                </Button>
              ) : null}
            </div>

            <ProjectDeliverablePreview snapshot={deliverableSnapshot} />

            <div className="grid gap-4 lg:grid-cols-[0.7fr,1.3fr]">
              <div className="rounded-md border bg-neutral-50 p-4 text-sm">
                <div className="font-medium">修改額度</div>
                {revisionQuota ? (
                  <>
                    <div className="mt-2 text-2xl font-semibold">{revisionRemaining}</div>
                    <div className="mt-1 text-neutral-500">已用 {revisionQuota.used} / 共 {revisionQuota.total} 次</div>
                  </>
                ) : (
                  <div className="mt-2 text-neutral-500">訂金確認後會建立修改額度。</div>
                )}
              </div>
              <OrderChatPanel
                messages={order.messages ?? []}
                draft={messageDraft}
                onDraftChange={setMessageDraft}
                busy={projectBusy}
                status={order.status}
                lastSyncedAt={lastSyncedAt}
                onSend={(kind) => void sendProjectMessage(kind)}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isProjectOrder ? (
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

        <OrderEventTimeline events={order.events} />
	      </div>
      </div>
	      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>客戶資料</CardTitle>
              <CardDescription>報價與執行時使用的客戶聯絡資料。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <InfoBox label="客戶名稱" value={order.customer.name || "—"} />
              <InfoBox label="Email" value={order.customer.email || "—"} />
              <InfoBox label="電話" value={order.customer.phone || "—"} />
              <InfoBox label="統編" value={order.customer.tax_id || "—"} />
              <div className="rounded-md border bg-neutral-50 p-4 text-sm md:col-span-2">
                <div className="text-neutral-500">地址</div>
                <div className="mt-1 whitespace-pre-wrap font-semibold text-neutral-950">{order.customer.address || "—"}</div>
              </div>
            </CardContent>
          </Card>

          <OrderEventTimeline events={order.events} />
        </div>
      )}

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

function OrderEventTimeline({ events }: { events: OrderEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>進度紀錄</CardTitle>
        <CardDescription>建立、報價、付款、修改與結案的可讀紀錄。</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[520px] overflow-auto">
        {events.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">尚無紀錄。</div>
        ) : (
          <div className="relative space-y-0 pl-5">
            <div className="absolute bottom-3 left-[7px] top-3 w-px bg-neutral-200" />
            {events.map((event) => {
              const summary = eventSummary(event);
              return (
                <div key={event.id} className="relative pb-5 last:pb-0">
                  <span className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-neutral-900 shadow-sm" />
                  <div className="rounded-md border bg-white p-3 text-sm shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-neutral-950">{summary.title}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {new Date(event.created_at).toLocaleString()} · {actorLabel(event.actor)}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap leading-6 text-neutral-700">{summary.description}</p>
                    {summary.detail ? (
                      <div className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-600">
                        {summary.detail}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectDeliverablePreview({ snapshot }: { snapshot: Record<string, unknown> }) {
  const websiteItem = recordValue(snapshot.websiteItem);
  const images = arrayValue(snapshot.images).map(recordValue);
  const textItems = arrayValue(snapshot.textItems).map(recordValue);
  const hasWebsite = Object.keys(websiteItem).length > 0;
  const hasDeliverables = hasWebsite || images.length > 0 || textItems.length > 0;

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">生成成果</div>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            這裡保留送單時的成果版本，後續報價與修改會以這份快照作為對齊基準。
          </p>
        </div>
        {snapshot.versionNumber ? (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
            生成 v{String(snapshot.versionNumber)}
          </span>
        ) : null}
      </div>

      {!hasDeliverables ? (
        <div className="mt-3 rounded-md border border-dashed p-4 text-sm text-neutral-500">
          尚未帶入生成成果。
        </div>
      ) : null}

      {hasWebsite ? (
        <div className="mt-4 rounded-md border bg-neutral-50 p-3 text-sm">
          <div className="font-medium">網站成果</div>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <InfoBox label="名稱" value={stringValue(websiteItem.label) || stringValue(websiteItem.siteName) || "網站初稿"} />
            <InfoBox label="Site ID" value={stringValue(websiteItem.siteId) || "—"} />
            <InfoBox label="狀態" value={stringValue(snapshot.kind) || "—"} />
          </div>
          {websiteItem.openUrl ? (
            <a
              href={stringValue(websiteItem.openUrl)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-md border bg-white px-3 py-2 text-sm hover:bg-neutral-50"
            >
              開啟網站預覽
            </a>
          ) : null}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-medium">圖像成果</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image, index) => {
              const url = stringValue(image.url) || stringValue(image.imageUrl);
              return (
                <a
                  key={`${url}-${index}`}
                  href={url || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-md border bg-neutral-50 text-sm transition hover:bg-neutral-100"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={stringValue(image.label) || `成果圖 ${index + 1}`} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-neutral-400">無圖片網址</div>
                  )}
                  <div className="px-3 py-2 text-xs text-neutral-600">
                    {stringValue(image.label) || `成果圖 ${index + 1}`}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      {textItems.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-medium">文字成果</div>
          <div className="mt-3 space-y-3">
            {textItems.map((item, index) => (
              <div key={`${stringValue(item.id)}-${index}`} className="rounded-md border bg-neutral-50 p-3 text-sm">
                <div className="font-medium">{stringValue(item.label) || `文字成果 ${index + 1}`}</div>
                <div className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-neutral-700">
                  {stringValue(item.content) || stringValue(item.text) || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OrderChatPanel({
  messages,
  draft,
  onDraftChange,
  busy,
  status,
  lastSyncedAt,
  onSend,
}: {
  messages: OrderMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  busy: boolean;
  status: string;
  lastSyncedAt: Date | null;
  onSend: (kind: "message" | "revision_request") => void;
}) {
  const isClosed = status === "closed" || status === "cancelled" || status === "canceled";
  const canRequestRevision = status === "confirmed" || status === "in_execution";
  const latestMessage = messages[messages.length - 1];

  return (
    <div className="rounded-lg border border-line1 bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">訂單協作對話</div>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            管理員回覆、進度更新與你的補充需求會即時同步到同一張訂單。
          </p>
        </div>
        <div className="rounded-pill border border-line1 bg-sunken px-3 py-1 text-xs text-ink-500">
          {busy ? "同步中..." : lastSyncedAt ? `已同步 ${lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "等待同步"}
        </div>
      </div>

      {latestMessage ? (
        <div className="mt-3 rounded-md border border-line1 bg-sunken/70 px-3 py-2 text-xs text-ink-500">
          最新：{messageSenderLabel(latestMessage.sender_role)}在 {new Date(latestMessage.created_at).toLocaleString()} 更新
        </div>
      ) : null}

      <div className="mt-3 max-h-96 space-y-3 overflow-auto rounded-md border border-line1 bg-sunken/60 p-3">
        {messages.length === 0 ? (
          <div className="rounded-md border border-dashed border-line2 bg-surface p-4 text-sm text-neutral-500">
            尚無對話。你可以先留言補充需求，GTL 團隊回覆後也會出現在這裡。
          </div>
        ) : (
          messages.map((message) => {
            const fromCustomer = message.sender_role === "customer";
            const fromSystem = message.sender_role === "system";
            return (
              <div key={message.id} className={`flex ${fromSystem ? "justify-center" : fromCustomer ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[86%] rounded-lg border px-3 py-2 text-sm shadow-xs ${
                    fromSystem
                      ? "border-line1 bg-canvas text-ink-500"
                      : fromCustomer
                        ? "border-ink-900 bg-ink-900 text-canvas"
                        : "border-line1 bg-surface text-ink-700"
                  }`}
                >
                  <div className={`flex flex-wrap items-center gap-2 text-xs ${fromCustomer ? "text-canvas/70" : "text-ink-400"}`}>
                    <span>{messageSenderLabel(message.sender_role)}</span>
                    <span className={`rounded-pill px-2 py-0.5 ${messageKindClass(message.kind, fromCustomer)}`}>
                      {messageKindLabel(message.kind)}
                    </span>
                    <span>{new Date(message.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap leading-6">{message.body}</div>
                  {message.consumes_revision ? (
                    <div className="mt-2 text-xs text-accent-300">已計入一次修改額度</div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isClosed ? (
        <>
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            className="mt-3 min-h-24 w-full rounded-md border border-line1 bg-sunken px-3 py-2 text-sm text-ink-900 outline-none transition-[box-shadow,border] duration-120 ease-smooth placeholder:text-ink-400 focus:border-accent-500 focus:shadow-[var(--shadow-focus)]"
            placeholder="輸入想補充的需求、問題，或回覆 GTL 團隊"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy || !draft.trim()} onClick={() => onSend("message")}>
              送出訊息
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !draft.trim() || !canRequestRevision}
              onClick={() => onSend("revision_request")}
            >
              作為修改需求送出
            </Button>
            {!canRequestRevision ? (
              <div className="self-center text-xs text-neutral-500">修改需求會在訂金確認後開啟；一般補充可先送出。</div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-neutral-500">
          訂單已結束，對話已轉為唯讀。
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-neutral-50 p-4 text-sm">
      <div className="text-neutral-500">{label}</div>
      <div className="mt-1 font-semibold text-neutral-950">{value}</div>
    </div>
  );
}

function ProjectAlignmentPanel({
  snapshot,
  alignment,
}: {
  snapshot: Record<string, unknown>;
  alignment: Record<string, unknown>;
}) {
  const task = recordValue(alignment.designTask);
  const conversation = recordValue(alignment.conversation);
  const fallbackTask = recordValue(snapshot.taskSnapshot);
  const displayTask = Object.keys(task).length > 0 ? task : fallbackTask;
  const recentDialogue = arrayValue(alignment.recentDialogue);
  const websiteItem = recordValue(snapshot.websiteItem);
  const images = arrayValue(snapshot.images);
  const textItems = arrayValue(snapshot.textItems);
  const taskSummary = cleanTaskSummary(displayTask.summary);
  const customerInputs = customerInputsText(displayTask.collectedData);
  const hasAlignment =
    Object.keys(displayTask).length > 0 ||
    Object.keys(conversation).length > 0 ||
    recentDialogue.length > 0 ||
    Object.keys(websiteItem).length > 0 ||
    images.length > 0 ||
    textItems.length > 0;

  if (!hasAlignment) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">
        這筆訂單尚未帶入對話對齊資料。後續從生成結果送單會自動補上任務、需求與交付快照。
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr,1.05fr]">
      <div className="space-y-4">
        <div className="rounded-md border bg-white p-4">
          <div className="text-sm font-medium">目前對齊的任務</div>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <InfoBox label="任務名稱" value={stringValue(displayTask.title) || "—"} />
            <InfoBox label="任務類型" value={stringValue(displayTask.taskType) || "—"} />
            <InfoBox label="模板" value={stringValue(displayTask.templateLabel) || stringValue(displayTask.templateKey) || "—"} />
            <InfoBox label="狀態" value={stringValue(displayTask.status) || "—"} />
          </div>
          {taskSummary ? (
            <div className="mt-3 rounded-md border bg-neutral-50 p-3 text-sm">
              <div className="font-medium">任務摘要</div>
              <p className="mt-2 whitespace-pre-wrap text-neutral-700">{taskSummary}</p>
            </div>
          ) : null}
          {customerInputs ? (
            <div className="mt-3 rounded-md border bg-neutral-50 p-3 text-sm">
              <div className="font-medium">客戶原話與需求紀錄</div>
              <p className="mt-2 whitespace-pre-wrap text-neutral-700">{customerInputs}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border bg-white p-4">
          <div className="text-sm font-medium">生成交付快照</div>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <InfoBox label="交付類型" value={stringValue(snapshot.kind) || "—"} />
            <InfoBox label="版本" value={snapshot.versionNumber ? `v${String(snapshot.versionNumber)}` : "—"} />
            <InfoBox label="網站 Site ID" value={stringValue(websiteItem.siteId) || "—"} />
            <InfoBox label="交付數量" value={`圖片 ${images.length} · 文字 ${textItems.length}`} />
          </div>
          {websiteItem.openUrl ? (
            <a
              href={stringValue(websiteItem.openUrl)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
            >
              開啟網站預覽
            </a>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border bg-white p-4">
          <div className="text-sm font-medium">客戶已提供 / 已確認資料</div>
          <div className="mt-3 grid gap-3">
            <SnapshotBlock label="已收集資料" value={displayTask.collectedData} />
            <SnapshotBlock label="已確認需求" value={displayTask.resolvedRequirements} />
            <SnapshotBlock label="仍缺資料" value={displayTask.missingRequirements} />
            <SnapshotBlock label="目前追問目標" value={displayTask.currentClarificationGoal} />
          </div>
        </div>

        <div className="rounded-md border bg-white p-4">
          <div className="text-sm font-medium">最近對話脈絡</div>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto">
            {recentDialogue.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">沒有帶入最近對話。</div>
            ) : (
              recentDialogue.map((item, index) => {
                const message = recordValue(item);
                return (
                  <div key={stringValue(message.id) || index} className="rounded-md border bg-neutral-50 p-3 text-sm">
                    <div className="text-xs text-neutral-500">
                      {stringValue(message.role) || "message"} · {message.createdAt ? new Date(String(message.createdAt)).toLocaleString() : ""}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-neutral-700">{stringValue(message.content) || "—"}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapshotBlock({ label, value }: { label: string; value: unknown }) {
  const empty = value === null || value === undefined || previewJson(value) === "{}" || previewJson(value) === "[]";
  return (
    <div className="rounded-md border bg-neutral-50 p-3 text-sm">
      <div className="font-medium">{label}</div>
      {empty ? (
        <div className="mt-2 text-xs text-neutral-500">—</div>
      ) : (
        <BriefValueList value={value} />
      )}
    </div>
  );
}

function BriefValueList({ value }: { value: unknown }) {
  const record = recordValue(value);
  const entries = Object.entries(record).filter(([, item]) => item !== null && item !== undefined && previewJson(item) !== "{}" && previewJson(item) !== "[]");
  if (entries.length === 0) {
    return (
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-neutral-600">
        {previewJson(value)}
      </pre>
    );
  }
  return (
    <div className="mt-2 max-h-64 overflow-auto rounded border bg-white">
      {entries.map(([key, item]) => (
        <div key={key} className="grid gap-2 border-b px-3 py-2 text-xs last:border-0 md:grid-cols-[140px,1fr]">
          <div className="font-medium text-neutral-500">{labelForBriefKey(key)}</div>
          <div className="whitespace-pre-wrap text-neutral-700">{previewJson(item)}</div>
        </div>
      ))}
    </div>
  );
}
