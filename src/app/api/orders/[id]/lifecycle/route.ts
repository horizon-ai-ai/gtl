/**
 * Trade-order lifecycle advance API (spec §Phase 9b — dev spec v0.2.0).
 *
 * POST /api/orders/[id]/lifecycle
 *   body: { stage_key: "order_confirmed" | ... | "stocked_inbound" }
 *
 * Authorisation:
 *   - admin: may advance any trade order to any later stage
 *   - order owner (seller user): may advance forward by exactly one stage,
 *     and only across metadata-only stages (processing, in_transit,
 *     arrived_warehouse) — stages with a status side-effect are admin-only
 *
 * Side effects:
 *   - Updates order.metadata.lifecycle_stage and lifecycle_stage_at
 *   - Writes an OrderEvent (type: lifecycle_advanced, actor: 'admin' | 'user',
 *     data: { from, to })
 *   - Also bumps order.status when crossing meaningful boundaries
 *     (order_confirmed -> 'confirmed', shipped -> 'shipped',
 *     stocked_inbound -> 'completed'); every status change is validated by
 *     assertProjectTransition and recorded in OrderStatusHistory atomically
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import type { OrderStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail, handleError, ApiError } from "@/lib/api";
import { assertProjectTransition, writeOrderStatusHistory } from "@/lib/project-orders";
import { deriveTradeStages, TRADE_STAGE_KEYS, type TradeStage } from "@/lib/trade-order-stages";

const advanceSchema = z.object({
  stage_key: z.enum(TRADE_STAGE_KEYS as [TradeStage["key"], ...TradeStage["key"][]]),
});

// status promotions tied to lifecycle stages (admin-only; validated transitions)
const STAGE_TO_STATUS: Partial<Record<TradeStage["key"], OrderStatus>> = {
  order_confirmed: "confirmed",
  shipped: "shipped",
  stocked_inbound: "completed",
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const body = advanceSchema.parse(await req.json());
    const targetKey = body.stage_key;
    const targetIndex = TRADE_STAGE_KEYS.indexOf(targetKey);

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order || order.deleted_at) {
      throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    }

    const meta = (order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata)
      ? (order.metadata as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    if (meta.source !== "trade_inquiry") {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Lifecycle advance is only valid for trade orders");
    }

    // Role gating
    const isAdmin = session.user.role === "admin" || session.user.role === "super_admin";
    const isOwner = session.user.id === order.user_id;
    if (!isAdmin && !isOwner) {
      return fail("FORBIDDEN", "Not allowed to advance this order");
    }

    // Compute current stages
    const stages = deriveTradeStages({ status: order.status, metadata: order.metadata });
    const activeIdx = stages.findIndex((s) => s.state === "active");

    // Only advanceable keys (stages 4–9) can be the target
    if (!stages[targetIndex] || !stages[targetIndex].advanceable) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Stage is not advanceable");
    }

    // Forward-only
    if (activeIdx === -1) {
      // already at end
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Order is already at the final stage");
    }
    if (targetIndex < activeIdx) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Cannot move lifecycle backward");
    }
    // Non-admin: must be exactly one step forward
    if (!isAdmin && targetIndex !== activeIdx) {
      throw new ApiError(
        "BUSINESS_RULE_VIOLATION",
        "Sellers may only advance one stage at a time; ask an admin for multi-step moves",
      );
    }

    // Status-changing stages are admin-only: the deposit/quote-acceptance
    // gate lives in accept-quote, and fulfilment milestones are admin calls.
    const mappedStatus = STAGE_TO_STATUS[targetKey];
    if (mappedStatus && !isAdmin) {
      throw new ApiError(
        "BUSINESS_RULE_VIOLATION",
        "此階段會變更訂單狀態：訂單成立請走報價確認流程，出貨／入倉里程碑請由管理員推進",
      );
    }

    const fromStage = activeIdx >= 0 ? stages[activeIdx].key : null;
    const newStatus = mappedStatus ?? order.status;
    const statusChanges = newStatus !== order.status;
    if (statusChanges) {
      assertProjectTransition(order.status, newStatus);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.order.update({
        where: { id: order.id },
        data: {
          status: newStatus,
          metadata: {
            ...meta,
            lifecycle_stage: targetKey,
            lifecycle_stage_at: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          events: {
            create: {
              type: "lifecycle_advanced",
              actor: isAdmin ? "admin" : "user",
              data: { from: fromStage, to: targetKey, by_user_id: session.user.id } as Prisma.InputJsonValue,
            },
          },
        },
        include: { items: true, events: { orderBy: { created_at: "desc" }, take: 20 } },
      });
      if (statusChanges) {
        await writeOrderStatusHistory(
          {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: newStatus,
            actorId: session.user.id,
            reason: "lifecycle_advanced",
          },
          tx,
        );
      }
      return row;
    });

    return ok({
      ...updated,
      stages: deriveTradeStages({ status: updated.status, metadata: updated.metadata }),
    });
  } catch (err) {
    return handleError(err);
  }
}
