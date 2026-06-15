import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanTaskSummary, customerInputsText } from "@/lib/project-brief";
import { formatTWD } from "@/lib/utils";
import { buildTradeLifecycleTimeline, listTradeLifecycleRules } from "@/lib/trade-lifecycle";
import { PROJECT_ORDER_POLICY, assertProjectTransition, defaultReviewItems, quoteExpiresAt } from "@/lib/project-orders";

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

async function quoteProjectOrder(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const amount = Number(formData.get("amount") ?? "0");
  const depositAmount = Number(formData.get("deposit_amount") ?? "0");
  const validDays = Number(formData.get("valid_days") ?? "14");
  const cancellationTerms = String(formData.get("cancellation_terms") ?? "").trim();
  if (!orderId || amount <= 0 || depositAmount <= 0 || !cancellationTerms) return;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  if (order.status === "quote_pending") {
    assertProjectTransition(order.status, "quoted");
  }
  if (!["quote_pending", "quoted"].includes(order.status)) return;
  const quotedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.projectQuote.updateMany({ where: { order_id: orderId, status: "active" }, data: { status: "superseded" } });
    await tx.projectQuote.create({
      data: {
        order_id: orderId,
        amount,
        deposit_amount: depositAmount,
        valid_days: validDays,
        cancellation_terms: cancellationTerms,
        quoted_at: quotedAt,
        expires_at: quoteExpiresAt(validDays, quotedAt),
        quoted_by: admin.id,
      },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { status: "quoted", subtotal: amount, total: amount },
    });
    await tx.orderStatusHistory.create({
      data: {
        order_id: orderId,
        from_status: order.status,
        to_status: "quoted",
        actor_id: admin.id,
        reason: order.status === "quoted" ? "admin_requoted" : "admin_quoted",
      },
    });
    await tx.orderMessage.create({
      data: { order_id: orderId, sender_role: "system", kind: "system_event", body: `後台已送出報價，效期 ${validDays} 天。` },
    });
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
}

async function confirmProjectDeposit(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "quoted") return;
  const quote = await prisma.projectQuote.findFirst({
    where: { order_id: orderId, status: "active" },
    orderBy: { quoted_at: "desc" },
  });
  if (!quote) return;

  await prisma.$transaction(async (tx) => {
    await tx.projectQuote.update({ where: { id: quote.id }, data: { status: "accepted" } });
    await tx.projectPayment.create({
      data: {
        order_id: orderId,
        customer_id: order.user_id,
        kind: "deposit",
        amount: quote.deposit_amount,
        method: "manual",
        status: "paid",
        paid_at: new Date(),
      },
    });
    await tx.revisionQuota.upsert({
      where: { order_id: orderId },
      update: { total: PROJECT_ORDER_POLICY.includedRevisions },
      create: { order_id: orderId, total: PROJECT_ORDER_POLICY.includedRevisions, used: 0 },
    });
    const reviewItemCount = await tx.reviewItem.count({ where: { order_id: orderId } });
    if (reviewItemCount === 0) {
      await tx.reviewItem.createMany({
        data: defaultReviewItems(order.project_type ?? "project").map((item) => ({
          order_id: orderId,
          label: item.label,
          sort_order: item.sort_order,
        })),
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: "confirmed", confirmed_at: new Date(), subtotal: quote.amount, total: quote.amount },
    });
    await tx.orderStatusHistory.create({
      data: { order_id: orderId, from_status: order.status, to_status: "confirmed", actor_id: admin.id, reason: "admin_deposit_confirmed" },
    });
    await tx.orderMessage.create({
      data: { order_id: orderId, sender_role: "system", kind: "system_event", body: "後台已確認訂金，專案成立。" },
    });
    await tx.adminAction.create({
      data: {
        admin_id: admin.id,
        action: "order_deposit_confirmed",
        target_type: "order",
        target_id: orderId,
        reason: `deposit ${quote.deposit_amount}`,
      },
    });
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/orders");
}

async function startProjectOrder(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { review_items: true } });
  if (!order) return;
  assertProjectTransition(order.status, "in_execution");
  await prisma.$transaction(async (tx) => {
    if (order.review_items.length === 0) {
      await tx.reviewItem.createMany({
        data: defaultReviewItems(order.project_type ?? "project").map((item) => ({
          order_id: orderId,
          label: item.label,
          sort_order: item.sort_order,
        })),
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: "in_execution", assigned_reviewer_id: admin.id },
    });
    await tx.orderStatusHistory.create({
      data: { order_id: orderId, from_status: order.status, to_status: "in_execution", actor_id: admin.id, reason: "execution_started" },
    });
    await tx.orderMessage.create({
      data: { order_id: orderId, sender_role: "system", kind: "system_event", body: "後台已接手執行，專案進入執行中。" },
    });
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
}

async function adjustRevisionQuota(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const total = Number(formData.get("total") ?? "0");
  const used = Number(formData.get("used") ?? "0");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orderId || total < 0 || used < 0 || used > total) return;

  await prisma.$transaction(async (tx) => {
    await tx.revisionQuota.upsert({
      where: { order_id: orderId },
      update: { total, used },
      create: { order_id: orderId, total, used },
    });
    await tx.orderMessage.create({
      data: {
        order_id: orderId,
        sender_role: "system",
        kind: "system_event",
        body: `後台已調整修改額度：已用 ${used} / 共 ${total} 次${reason ? `。原因：${reason}` : ""}`,
      },
    });
    await tx.adminAction.create({
      data: {
        admin_id: admin.id,
        action: "order_revision_quota_adjusted",
        target_type: "order",
        target_id: orderId,
        reason: reason || `${used}/${total}`,
      },
    });
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
}

async function cancelProjectOrder(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const refundAmount = Number(formData.get("refund_amount") ?? "0");
  if (!orderId || !reason || refundAmount < 0) return;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || ["closed", "cancelled"].includes(order.status)) return;
  assertProjectTransition(order.status, "cancelled");

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { status: "cancelled", cancel_reason: "admin", cancelled_at: new Date() },
    });
    if (refundAmount > 0) {
      const depositPayment = await tx.projectPayment.findFirst({
        where: { order_id: orderId, kind: "deposit", status: "paid" },
        orderBy: { paid_at: "desc" },
      });
      if (depositPayment) {
        await tx.projectPayment.update({
          where: { id: depositPayment.id },
          data: {
            status: refundAmount >= depositPayment.amount ? "refunded" : "partial_refund",
            refund_amount: refundAmount,
          },
        });
      }
    }
    await tx.orderStatusHistory.create({
      data: { order_id: orderId, from_status: order.status, to_status: "cancelled", actor_id: admin.id, reason },
    });
    await tx.orderMessage.create({
      data: {
        order_id: orderId,
        sender_role: "system",
        kind: "system_event",
        body: `後台已取消專案。原因：${reason}${refundAmount > 0 ? `。退款金額：${formatTWD(refundAmount)}` : ""}`,
      },
    });
    await tx.adminAction.create({
      data: {
        admin_id: admin.id,
        action: "project_order_cancelled",
        target_type: "order",
        target_id: orderId,
        reason,
      },
    });
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/orders");
}

async function updateReviewItem(formData: FormData) {
  "use server";
  await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const checked = formData.get("checked") === "on";
  const detail = String(formData.get("detail") ?? "");
  const resultText = String(formData.get("result") ?? "");
  if (!orderId || !itemId) return;
  await prisma.reviewItem.update({
    where: { id: itemId },
    data: { checked, detail, result: resultText ? { text: resultText } : undefined },
  });
  revalidatePath(`/admin/orders/${orderId}`);
}

async function completeProjectOrder(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const resultNote = String(formData.get("result_note") ?? "").trim();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  assertProjectTransition(order.status, "closed");
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "closed", closed_at: new Date() } });
    await tx.orderStatusHistory.create({
      data: { order_id: orderId, from_status: order.status, to_status: "closed", actor_id: admin.id, reason: "completed" },
    });
    await tx.orderMessage.create({
      data: { order_id: orderId, sender_role: "system", kind: "system_event", body: resultNote ? `專案已結案：${resultNote}` : "專案已結案，成果已送出。" },
    });
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
}

async function addProjectOrderMessage(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const orderId = String(formData.get("order_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const kindValue = String(formData.get("kind") ?? "message");
  const kind = kindValue === "progress_update" ? "progress_update" : "message";
  if (!orderId || !body) return;

  await prisma.orderMessage.create({
    data: {
      order_id: orderId,
      sender_role: "reviewer",
      sender_id: admin.id,
      kind,
      body,
    },
  });
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: kind === "progress_update" ? "order_progress_message" : "order_chat_message",
      target_type: "order",
      target_id: orderId,
      reason: body.slice(0, 120),
    },
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
}

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const [order, audits, lifecycleRules] = await Promise.all([
    prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: true,
        events: { orderBy: { created_at: "desc" } },
        quotes: { orderBy: { quoted_at: "desc" } },
        payments: { orderBy: { created_at: "desc" } },
        revision_quota: true,
        messages: { orderBy: { created_at: "asc" } },
        review_items: { orderBy: { sort_order: "asc" } },
        status_history: { orderBy: { created_at: "asc" } },
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
  const isProjectOrder = Boolean(order.project_type);
  const activeQuote = order.quotes.find((quote) => quote.status === "active") ?? order.quotes[0] ?? null;
  const depositPayment = order.payments.find((payment) => payment.kind === "deposit");
  const revisionRemaining = order.revision_quota
    ? Math.max(0, order.revision_quota.total - order.revision_quota.used)
    : 0;
  const deliverableSnapshot = recordValue(order.deliverable_snapshot);
  const alignmentSnapshot = recordValue(deliverableSnapshot.alignment);
  const requirementSummary = cleanTaskSummary(order.requirements_summary);
  const projectRevision = recordValue(orderMetadata.project_revision);
  const projectVersion = typeof projectRevision.version === "number" ? projectRevision.version : 1;
  const previousOrderId = stringValue(projectRevision.previousOrderId);
  const revisionRelation = stringValue(projectRevision.relation);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{order.order_no}</h1>
          <p className="text-sm text-neutral-500 mt-1">平台用戶：{order.user.email}</p>
        </div>
        <span className="rounded bg-neutral-100 px-3 py-1 text-sm">{order.status}</span>
      </div>

      {isProjectOrder ? (
        <Card className="p-4 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm text-neutral-500">AI 專案訂單</div>
              <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold">
                {order.title ?? order.order_no}
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">v{projectVersion}</span>
              </h2>
              <div className="mt-1 text-sm text-neutral-500">
                類型：{order.project_type} · 修改額度剩餘 {revisionRemaining}
              </div>
              {previousOrderId ? (
                <div className="mt-1 text-xs text-neutral-500">
                  接續前一版訂單 {previousOrderId}
                  {revisionRelation === "supersedes_unconfirmed_order" ? "，前一版未付款訂單已自動作廢" : ""}
                </div>
              ) : null}
            </div>
            <span className="rounded bg-neutral-900 px-3 py-1 text-sm text-white">{order.status}</span>
          </div>

          {requirementSummary ? (
            <div className="rounded border bg-neutral-50 p-3">
              <div className="text-sm font-medium">需求摘要</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{requirementSummary}</p>
            </div>
          ) : null}

          <AdminProjectAlignment snapshot={deliverableSnapshot} alignment={alignmentSnapshot} />

          {activeQuote ? (
            <div className="grid gap-3 md:grid-cols-4">
              <Info label="報價">{formatTWD(activeQuote.amount)}</Info>
              <Info label="訂金">{formatTWD(activeQuote.deposit_amount)}</Info>
              <Info label="效期">{new Date(activeQuote.expires_at).toLocaleDateString()}</Info>
              <Info label="報價狀態">{activeQuote.status}</Info>
            </div>
          ) : null}

          <div className="rounded border bg-neutral-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">後台控制台</div>
                <div className="mt-1 text-xs text-neutral-500">報價、付款確認、執行、修改額度、聊天與取消都在這裡處理。</div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-white px-2 py-1">訂金：{depositPayment ? `${depositPayment.status} ${formatTWD(depositPayment.amount)}` : "未收"}</span>
                <span className="rounded bg-white px-2 py-1">修改：{revisionRemaining} / {order.revision_quota?.total ?? 0}</span>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {["quote_pending", "quoted"].includes(order.status) ? (
                <form action={quoteProjectOrder} className="grid gap-3 rounded border bg-white p-3 md:grid-cols-[1fr,1fr,120px]">
                  <input type="hidden" name="order_id" value={order.id} />
                  <div className="text-sm font-medium md:col-span-3">{order.status === "quoted" ? "重報價" : "填寫報價"}</div>
                  <input name="amount" type="number" min="1" required defaultValue={activeQuote?.amount ?? ""} placeholder="總報價金額" className="rounded border px-3 py-2 text-sm" />
                  <input name="deposit_amount" type="number" min="1" required defaultValue={activeQuote?.deposit_amount ?? ""} placeholder="訂金" className="rounded border px-3 py-2 text-sm" />
                  <select name="valid_days" defaultValue={String(activeQuote?.valid_days ?? 14)} className="rounded border px-3 py-2 text-sm">
                    <option value="7">7 天</option>
                    <option value="14">14 天</option>
                    <option value="30">30 天</option>
                  </select>
                  <textarea
                    name="cancellation_terms"
                    required
                    defaultValue={activeQuote?.cancellation_terms ?? "已付訂金後若取消，依專案進度與已投入工時評估退款。"}
                    placeholder="取消條款"
                    className="min-h-24 rounded border px-3 py-2 text-sm md:col-span-3"
                  />
                  <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm text-white md:col-span-3">
                    {order.status === "quoted" ? "送出新版報價" : "送出報價"}
                  </button>
                </form>
              ) : null}

              <div className="space-y-3">
                {order.status === "quoted" && activeQuote ? (
                  <form action={confirmProjectDeposit} className="rounded border bg-white p-3">
                    <input type="hidden" name="order_id" value={order.id} />
                    <div className="text-sm font-medium">訂金確認</div>
                    <p className="mt-2 text-sm text-neutral-600">客戶已付款或人工確認匯款後，按下後會建立付款紀錄、修改額度與審稿工作表。</p>
                    <button type="submit" className="mt-3 rounded bg-neutral-900 px-4 py-2 text-sm text-white">手動確認訂金</button>
                  </form>
                ) : null}

                {order.status === "confirmed" ? (
                  <form action={startProjectOrder} className="rounded border bg-white p-3">
                    <input type="hidden" name="order_id" value={order.id} />
                    <div className="text-sm font-medium">執行排程</div>
                    <p className="mt-2 text-sm text-neutral-600">接單後會指派目前管理員，狀態進入執行中。</p>
                    <button type="submit" className="mt-3 rounded bg-neutral-900 px-4 py-2 text-sm text-white">接單並進入執行</button>
                  </form>
                ) : null}

                {order.status === "in_execution" ? (
                  <form action={completeProjectOrder} className="rounded border bg-white p-3">
                    <input type="hidden" name="order_id" value={order.id} />
                    <div className="text-sm font-medium">結案</div>
                    <input name="result_note" placeholder="成果說明" className="mt-3 w-full rounded border px-3 py-2 text-sm" />
                    <button type="submit" className="mt-3 rounded bg-green-700 px-4 py-2 text-sm text-white">已完成送出</button>
                  </form>
                ) : null}
              </div>

              {["confirmed", "in_execution"].includes(order.status) ? (
                <form action={adjustRevisionQuota} className="grid gap-3 rounded border bg-white p-3 md:grid-cols-2">
                  <input type="hidden" name="order_id" value={order.id} />
                  <div className="text-sm font-medium md:col-span-2">修改額度管理</div>
                  <input name="total" type="number" min="0" defaultValue={order.revision_quota?.total ?? 0} className="rounded border px-3 py-2 text-sm" placeholder="總額度" />
                  <input name="used" type="number" min="0" defaultValue={order.revision_quota?.used ?? 0} className="rounded border px-3 py-2 text-sm" placeholder="已使用" />
                  <input name="reason" className="rounded border px-3 py-2 text-sm md:col-span-2" placeholder="調整原因" />
                  <button type="submit" className="rounded border px-4 py-2 text-sm hover:bg-neutral-50 md:col-span-2">更新修改額度</button>
                </form>
              ) : null}

              {!["closed", "cancelled"].includes(order.status) ? (
                <form action={cancelProjectOrder} className="grid gap-3 rounded border border-red-200 bg-white p-3 md:grid-cols-[1fr,140px]">
                  <input type="hidden" name="order_id" value={order.id} />
                  <div className="text-sm font-medium text-red-700 md:col-span-2">取消專案</div>
                  <textarea name="reason" required placeholder="取消原因" className="min-h-20 rounded border px-3 py-2 text-sm md:col-span-2" />
                  <input name="refund_amount" type="number" min="0" defaultValue="0" className="rounded border px-3 py-2 text-sm" placeholder="退款金額" />
                  <button type="submit" className="rounded bg-red-600 px-4 py-2 text-sm text-white">取消訂單</button>
                </form>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded border bg-white p-3">
              <div className="text-sm font-medium">付款紀錄</div>
              <div className="mt-3 space-y-2">
                {order.payments.length === 0 ? (
                  <div className="rounded border border-dashed p-4 text-sm text-neutral-500">尚無付款紀錄。</div>
                ) : (
                  order.payments.map((payment) => (
                    <div key={payment.id} className="rounded bg-neutral-50 px-3 py-2 text-sm">
                      <div className="font-medium">{payment.kind} · {formatTWD(payment.amount)}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {payment.status} · {payment.method} · {payment.paid_at ? new Date(payment.paid_at).toLocaleString() : "未付款"}
                        {payment.refund_amount ? ` · 退款 ${formatTWD(payment.refund_amount)}` : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-sm font-medium">狀態歷史</div>
              <div className="mt-3 space-y-2">
                {order.status_history.length === 0 ? (
                  <div className="rounded border border-dashed p-4 text-sm text-neutral-500">尚無狀態紀錄。</div>
                ) : (
                  order.status_history.map((history) => (
                    <div key={history.id} className="rounded bg-neutral-50 px-3 py-2 text-sm">
                      <div className="font-medium">{history.from_status ?? "建立"} → {history.to_status}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {new Date(history.created_at).toLocaleString()}
                        {history.reason ? ` · ${history.reason}` : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
            <div className="space-y-3">
              <div className="text-sm font-medium">審稿 / 執行工作表</div>
              {order.review_items.length === 0 ? (
                <div className="rounded border border-dashed p-4 text-sm text-neutral-500">確認訂金或進入執行後會建立工作表。</div>
              ) : (
                order.review_items.map((item) => (
                  <form key={item.id} action={updateReviewItem} className="rounded border p-3 text-sm">
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="item_id" value={item.id} />
                    <label className="flex items-center gap-2 font-medium">
                      <input type="checkbox" name="checked" defaultChecked={item.checked} />
                      {item.label}
                    </label>
                    <textarea name="detail" defaultValue={item.detail ?? ""} placeholder="細節" className="mt-2 min-h-20 w-full rounded border px-3 py-2 text-sm" />
                    <textarea
                      name="result"
                      defaultValue={typeof item.result === "object" && item.result && "text" in item.result ? String((item.result as { text?: unknown }).text ?? "") : ""}
                      placeholder="成果"
                      className="mt-2 min-h-20 w-full rounded border px-3 py-2 text-sm"
                    />
                    <button type="submit" className="mt-2 rounded border px-3 py-2 text-xs hover:bg-neutral-50">儲存</button>
                  </form>
                ))
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">訂單協作對話</div>
                  <div className="mt-1 text-xs text-neutral-500">這裡送出的回覆與進度，會同步顯示在客戶的訂單頁。</div>
                </div>
                <span className="rounded-full border bg-white px-3 py-1 text-xs text-neutral-500">
                  {order.messages.length} 則訊息
                </span>
              </div>
              <div className="max-h-[520px] space-y-3 overflow-auto rounded-lg border bg-neutral-50 p-3">
                {order.messages.length === 0 ? (
                  <div className="rounded border border-dashed bg-white p-4 text-sm text-neutral-500">
                    尚無訊息。可先發一則進度更新，讓客戶知道目前已進入報價或執行流程。
                  </div>
                ) : (
                  order.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg border px-3 py-2 text-sm shadow-sm ${adminMessageCardClass(message.sender_role)}`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span>{adminMessageSenderLabel(message.sender_role)}</span>
                        <span className={`rounded-full px-2 py-0.5 ${adminMessageKindClass(message.kind)}`}>
                          {adminMessageKindLabel(message.kind)}
                        </span>
                        <span>{new Date(message.created_at).toLocaleString()}</span>
                        {message.consumes_revision ? <span className="text-orange-600">扣 1 次修改</span> : null}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap leading-6 text-neutral-800">{message.body}</div>
                    </div>
                  ))
                )}
              </div>
              {!["closed", "cancelled"].includes(order.status) ? (
                <form action={addProjectOrderMessage} className="rounded-lg border bg-white p-3 shadow-sm">
                  <input type="hidden" name="order_id" value={order.id} />
                  <textarea
                    name="body"
                    required
                    placeholder="回覆客戶，或更新目前進度"
                    className="min-h-24 w-full rounded-md border bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button name="kind" value="message" type="submit" className="rounded border px-3 py-2 text-xs hover:bg-neutral-50">
                      回覆訊息
                    </button>
                    <button name="kind" value="progress_update" type="submit" className="rounded bg-neutral-900 px-3 py-2 text-xs text-white">
                      發進度更新
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

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

          {!isProjectOrder ? (
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
          ) : null}

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

          {!isProjectOrder ? (
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
          ) : null}
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

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-neutral-50 p-3 text-sm">
      <div className="text-neutral-500">{label}</div>
      <div className="mt-1 font-medium">{children}</div>
    </div>
  );
}

function adminMessageSenderLabel(role: string) {
  if (role === "customer") return "客戶";
  if (role === "reviewer") return "GTL 團隊";
  if (role === "system") return "系統";
  return role || "訊息";
}

function adminMessageKindLabel(kind: string) {
  if (kind === "progress_update") return "進度更新";
  if (kind === "revision_request") return "修改需求";
  if (kind === "system_event") return "系統紀錄";
  return "對話";
}

function adminMessageKindClass(kind: string) {
  if (kind === "progress_update") return "bg-green-50 text-green-700";
  if (kind === "revision_request") return "bg-orange-50 text-orange-700";
  if (kind === "system_event") return "bg-neutral-100 text-neutral-600";
  return "bg-white text-neutral-500";
}

function adminMessageCardClass(role: string) {
  if (role === "customer") return "border-orange-100 bg-orange-50/60";
  if (role === "reviewer") return "border-green-100 bg-white";
  if (role === "system") return "border-neutral-200 bg-neutral-100/70";
  return "bg-white";
}

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

function AdminProjectAlignment({
  snapshot,
  alignment,
}: {
  snapshot: Record<string, unknown>;
  alignment: Record<string, unknown>;
}) {
  const task = recordValue(alignment.designTask);
  const fallbackTask = recordValue(snapshot.taskSnapshot);
  const displayTask = Object.keys(task).length > 0 ? task : fallbackTask;
  const recentDialogue = arrayValue(alignment.recentDialogue);
  const websiteItem = recordValue(snapshot.websiteItem);
  const images = arrayValue(snapshot.images);
  const textItems = arrayValue(snapshot.textItems);
  const taskSummary = cleanTaskSummary(displayTask.summary);
  const customerInputs = customerInputsText(displayTask.collectedData);

  if (
    Object.keys(displayTask).length === 0 &&
    recentDialogue.length === 0 &&
    Object.keys(websiteItem).length === 0 &&
    images.length === 0 &&
    textItems.length === 0
  ) {
    return (
      <div className="rounded border border-dashed p-4 text-sm text-neutral-500">
        尚未帶入任務對齊資料。新的生成結果送單會自動附上任務與對話快照。
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
      <div className="space-y-3">
        <div className="rounded border bg-white p-3">
          <div className="text-sm font-medium">客戶對齊任務</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Info label="任務">{stringValue(displayTask.title) || "—"}</Info>
            <Info label="類型">{stringValue(displayTask.taskType) || "—"}</Info>
            <Info label="模板">{stringValue(displayTask.templateLabel) || stringValue(displayTask.templateKey) || "—"}</Info>
            <Info label="狀態">{stringValue(displayTask.status) || "—"}</Info>
          </div>
          {taskSummary ? (
            <p className="mt-3 whitespace-pre-wrap rounded border bg-neutral-50 p-3 text-sm text-neutral-700">
              {taskSummary}
            </p>
          ) : null}
          {customerInputs ? (
            <div className="mt-3 rounded border bg-neutral-50 p-3 text-sm">
              <div className="font-medium">客戶原話與需求紀錄</div>
              <p className="mt-2 whitespace-pre-wrap text-neutral-700">{customerInputs}</p>
            </div>
          ) : null}
        </div>
        <div className="rounded border bg-white p-3">
          <div className="text-sm font-medium">交付快照</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Info label="交付類型">{stringValue(snapshot.kind) || "—"}</Info>
            <Info label="版本">{snapshot.versionNumber ? `v${String(snapshot.versionNumber)}` : "—"}</Info>
            <Info label="Site ID">{stringValue(websiteItem.siteId) || "—"}</Info>
            <Info label="數量">圖片 {images.length} · 文字 {textItems.length}</Info>
          </div>
          {websiteItem.openUrl ? (
            <a href={stringValue(websiteItem.openUrl)} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded border px-3 py-2 text-sm hover:bg-neutral-50">
              開啟網站預覽
            </a>
          ) : null}
        </div>
      </div>
      <div className="space-y-3">
        <AdminSnapshotBlock label="已收集資料" value={displayTask.collectedData} />
        <AdminSnapshotBlock label="已確認需求" value={displayTask.resolvedRequirements} />
        <AdminSnapshotBlock label="仍缺資料" value={displayTask.missingRequirements} />
        <div className="rounded border bg-white p-3">
          <div className="text-sm font-medium">最近對話</div>
          <div className="mt-3 max-h-72 space-y-2 overflow-auto">
            {recentDialogue.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-sm text-neutral-500">沒有最近對話。</div>
            ) : (
              recentDialogue.map((item, index) => {
                const message = recordValue(item);
                return (
                  <div key={stringValue(message.id) || index} className="rounded bg-neutral-50 px-3 py-2 text-sm">
                    <div className="text-xs text-neutral-500">
                      {stringValue(message.role) || "message"} · {message.createdAt ? new Date(String(message.createdAt)).toLocaleString() : ""}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{stringValue(message.content) || "—"}</div>
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

function AdminSnapshotBlock({ label, value }: { label: string; value: unknown }) {
  const text = previewJson(value);
  const empty = text === "{}" || text === "[]" || text === "—";
  return (
    <div className="rounded border bg-white p-3 text-sm">
      <div className="font-medium">{label}</div>
      {empty ? (
        <div className="mt-2 text-xs text-neutral-500">—</div>
      ) : (
        <AdminBriefValueList value={value} />
      )}
    </div>
  );
}

function AdminBriefValueList({ value }: { value: unknown }) {
  const record = recordValue(value);
  const entries = Object.entries(record).filter(([, item]) => item !== null && item !== undefined && previewJson(item) !== "{}" && previewJson(item) !== "[]");
  if (entries.length === 0) {
    return (
      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-xs leading-5 text-neutral-600">
        {previewJson(value)}
      </pre>
    );
  }
  return (
    <div className="mt-2 max-h-64 overflow-auto rounded border bg-neutral-50">
      {entries.map(([key, item]) => (
        <div key={key} className="grid gap-2 border-b px-3 py-2 text-xs last:border-0 md:grid-cols-[140px,1fr]">
          <div className="font-medium text-neutral-500">{labelForBriefKey(key)}</div>
          <div className="whitespace-pre-wrap text-neutral-700">{previewJson(item)}</div>
        </div>
      ))}
    </div>
  );
}
