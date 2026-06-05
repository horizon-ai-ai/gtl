import type { OrderStatus, Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export const PROJECT_ORDER_STATUSES = [
  "draft",
  "quote_pending",
  "quoted",
  "confirmed",
  "in_execution",
  "closed",
  "cancelled",
] as const;

export const PROJECT_ORDER_POLICY = {
  quoteValidDays: 14,
  includedRevisions: 2,
  revisionUnitPrice: 3000,
  pointsPerRevision: 300,
  refundRateBeforeExecution: 0,
};

const ALLOWED_TRANSITIONS: Record<string, OrderStatus[]> = {
  draft: ["quote_pending", "cancelled"],
  quote_pending: ["quoted", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["in_execution", "cancelled"],
  in_execution: ["closed", "cancelled"],
  closed: [],
  cancelled: [],
};

export function isProjectOrderStatus(status: string): status is (typeof PROJECT_ORDER_STATUSES)[number] {
  return PROJECT_ORDER_STATUSES.includes(status as never);
}

export function quoteExpiresAt(validDays: number, quotedAt = new Date()) {
  const next = new Date(quotedAt);
  next.setDate(next.getDate() + validDays);
  return next;
}

export function assertProjectTransition(from: OrderStatus, to: OrderStatus) {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ApiError("CONFLICT", `Illegal order transition: ${from} -> ${to}`);
  }
}

export async function writeOrderStatusHistory(params: {
  orderId: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  actorId?: string | null;
  reason?: string | null;
}) {
  await prisma.orderStatusHistory.create({
    data: {
      order_id: params.orderId,
      from_status: params.fromStatus ?? null,
      to_status: params.toStatus,
      actor_id: params.actorId ?? null,
      reason: params.reason ?? null,
    },
  });
}

export function projectOrderInclude() {
  return {
    items: true,
    events: { orderBy: { created_at: "desc" as const } },
    quotes: { orderBy: { quoted_at: "desc" as const } },
    payments: { orderBy: { created_at: "desc" as const } },
    revision_quota: true,
    messages: { orderBy: { created_at: "asc" as const } },
    review_items: { orderBy: { sort_order: "asc" as const } },
    meetings: { orderBy: { scheduled_at: "asc" as const } },
    status_history: { orderBy: { created_at: "asc" as const } },
  } satisfies Prisma.OrderInclude;
}

export function defaultReviewItems(orderType: string) {
  if (orderType === "website" || orderType === "product_page") {
    return [
      { label: "確認需求摘要與目標客群", sort_order: 0 },
      { label: "檢查網站內容與圖片素材", sort_order: 1 },
      { label: "檢查手機版與桌面版呈現", sort_order: 2 },
      { label: "整理成果與交付說明", sort_order: 3 },
    ];
  }
  return [
    { label: "確認需求摘要", sort_order: 0 },
    { label: "檢查成果內容", sort_order: 1 },
    { label: "整理交付說明", sort_order: 2 },
  ];
}

export async function consumeRevisionQuota(tx: Prisma.TransactionClient, orderId: string) {
  // Atomic guarded increment: only succeeds while used < total, so
  // concurrent revision requests cannot over-consume the quota.
  const consumed = await tx.revisionQuota.updateMany({
    where: { order_id: orderId, used: { lt: prisma.revisionQuota.fields.total } },
    data: { used: { increment: 1 } },
  });
  if (consumed.count === 0) {
    throw new ApiError("BUSINESS_RULE_VIOLATION", "修改額度不足，請先加購修改額度");
  }
}
