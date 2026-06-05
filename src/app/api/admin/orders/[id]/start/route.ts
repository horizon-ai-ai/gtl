import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertProjectTransition, projectOrderInclude, writeOrderStatusHistory } from "@/lib/project-orders";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order || order.deleted_at) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    assertProjectTransition(order.status, "in_execution");

    const paidDeposit = await prisma.projectPayment.findFirst({
      where: { order_id: order.id, kind: "deposit", status: "paid" },
    });
    if (!paidDeposit) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "尚未收到已付訂金，無法開始執行");
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "in_execution",
        assigned_reviewer_id: admin.id,
        events: { create: { type: "execution_started", actor: "admin" } },
        messages: {
          create: {
            sender_role: "system",
            kind: "system_event",
            body: "後台已接手執行，專案進入執行中。",
          },
        },
      },
      include: projectOrderInclude(),
    });
    await writeOrderStatusHistory({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "in_execution",
      actorId: admin.id,
      reason: "execution_started",
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
