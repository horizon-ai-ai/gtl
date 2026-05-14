import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatTWD } from "@/lib/utils";
import { buildTradeLifecycleTimeline, listTradeLifecycleRules } from "@/lib/trade-lifecycle";

async function markAbnormal(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orderId || !reason) return;

  await prisma.orderEvent.create({
    data: {
      order_id: orderId,
      type: "admin_marked_abnormal",
      actor: "admin",
      data: { reason },
    },
  });
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "order_mark_abnormal",
      target_type: "order",
      target_id: orderId,
      reason,
    },
  });
  revalidatePath(`/admin/orders/${orderId}`);
}

async function forceCancel(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orderId || !reason) return;

  await prisma.order.update({
    where: { id: orderId },
    data: { status: "canceled" },
  });
  await prisma.orderEvent.create({
    data: {
      order_id: orderId,
      type: "admin_force_canceled",
      actor: "admin",
      data: { reason },
    },
  });
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "order_force_cancel",
      target_type: "order",
      target_id: orderId,
      reason,
    },
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
}

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const [order, audits, lifecycleRules] = await Promise.all([
    prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: true,
        events: { orderBy: { created_at: "desc" } },
        user: {
          include: {
            company: true,
            subscription: { include: { plan: true } },
          },
        },
      },
    }),
    prisma.adminAction.findMany({
      where: { target_type: "order", target_id: params.id },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
    listTradeLifecycleRules(),
  ]);

  if (!order) notFound();

  const customer = order.customer as {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
  };
  const orderMetadata = (order.metadata ?? {}) as Record<string, unknown>;
  const tradeTimeline =
    orderMetadata.source === "trade_inquiry"
      ? buildTradeLifecycleTimeline(order.created_at, lifecycleRules)
      : [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{order.order_no}</h1>
          <p className="text-sm text-neutral-500 mt-1">平台用戶：{order.user.email}</p>
        </div>
        <span className="rounded bg-neutral-100 px-3 py-1 text-sm">{order.status}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2 space-y-4">
          <div>
            <div className="text-sm font-medium">訂單資訊</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>客戶：{customer.name ?? "—"}</div>
              <div>客戶 Email：{customer.email ?? "—"}</div>
              <div>電話：{customer.phone ?? "—"}</div>
              <div>統編：{customer.tax_id ?? "—"}</div>
              <div>地址：{customer.address ?? "—"}</div>
              <div>建立時間：{new Date(order.created_at).toLocaleString()}</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">商品清單</div>
            <div className="mt-3 space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="rounded border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{item.name}</div>
                    <div>{formatTWD(item.total)}</div>
                  </div>
                  <div className="text-neutral-500 mt-1">
                    {item.quantity} × {formatTWD(item.unit_price)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {order.notes ? (
            <div>
              <div className="text-sm font-medium">備註</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">{order.notes}</div>
            </div>
          ) : null}
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">金額摘要</div>
            <div className="mt-3 space-y-2 text-sm">
              <div>小計：{formatTWD(order.subtotal)}</div>
              <div>稅額：{formatTWD(order.tax)}</div>
              <div>運費：{formatTWD(order.shipping)}</div>
              <div className="font-medium">總計：{formatTWD(order.total)}</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium">平台用戶</div>
            <div className="mt-3 text-sm space-y-1">
              <div>{order.user.display_name ?? "未命名用戶"}</div>
              <div className="text-neutral-500">{order.user.email}</div>
              <div className="text-neutral-500">{order.user.company?.name ?? order.user.type}</div>
              <div className="text-neutral-500">{order.user.subscription?.plan.name ?? "免費"}</div>
            </div>
          </div>

          <form action={markAbnormal} className="space-y-2 rounded border p-3">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="text-sm font-medium">標註異常</div>
            <textarea
              name="reason"
              required
              className="min-h-24 w-full rounded border px-3 py-2 text-sm"
              placeholder="例如：金額異常、客訴、疑似重複建單"
            />
            <button type="submit" className="w-full rounded bg-neutral-900 px-3 py-2 text-sm text-white">
              記錄異常
            </button>
          </form>

          <form action={forceCancel} className="space-y-2 rounded border p-3">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="text-sm font-medium">強制取消</div>
            <textarea
              name="reason"
              required
              className="min-h-24 w-full rounded border px-3 py-2 text-sm"
              placeholder="填寫強制取消原因"
            />
            <button type="submit" className="w-full rounded bg-red-600 px-3 py-2 text-sm text-white">
              強制取消訂單
            </button>
          </form>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">訂單事件</div>
          <div className="space-y-2">
            {order.events.map((event) => (
              <div key={event.id} className="rounded border p-3 text-sm">
                <div className="font-medium">{event.type}</div>
                <div className="text-neutral-500 mt-1">
                  {event.actor} · {new Date(event.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Admin 操作紀錄</div>
          <div className="space-y-2">
            {audits.map((item) => (
              <div key={item.id} className="rounded border p-3 text-sm">
                <div className="font-medium">{item.action}</div>
                <div className="text-neutral-500 mt-1">
                  {new Date(item.created_at).toLocaleString()}
                  {item.reason ? ` · ${item.reason}` : ""}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {tradeTimeline.length > 0 ? (
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium">Trade 訂單生命週期</div>
          <div className="grid gap-4 md:grid-cols-6">
            {tradeTimeline.map((stage) => (
              <div key={stage.stage_key} className="rounded border bg-neutral-50 p-3 text-sm">
                <div className="font-medium">{stage.label}</div>
                <div className="mt-1 text-neutral-500">+{stage.day_offset} 天</div>
                <div className="mt-2">{stage.estimated_at.toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
