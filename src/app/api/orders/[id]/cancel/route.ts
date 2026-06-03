import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { PROJECT_ORDER_POLICY, assertProjectTransition, projectOrderInclude, writeOrderStatusHistory } from "@/lib/project-orders";

const cancelSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = cancelSchema.parse(await req.json().catch(() => ({})));
    const order = await prisma.order.findFirst({ where: { id: params.id, user_id: session.user.id, deleted_at: null } });
    if (!order) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    assertProjectTransition(order.status, "cancelled");

    const deposit = await prisma.projectPayment.findFirst({
      where: { order_id: order.id, kind: "deposit", status: "paid" },
      orderBy: { paid_at: "desc" },
    });
    const refundAmount =
      order.status === "confirmed" && deposit
        ? Math.floor(deposit.amount * (PROJECT_ORDER_POLICY.refundRateBeforeExecution / 100))
        : 0;

    const updated = await prisma.$transaction(async (tx) => {
      if (deposit && refundAmount > 0) {
        await tx.projectPayment.update({
          where: { id: deposit.id },
          data: { status: "partial_refund", refund_amount: refundAmount },
        });
      }
      await tx.orderMessage.create({
        data: {
          order_id: order.id,
          sender_role: "system",
          kind: "system_event",
          body: body.reason ? `訂單已取消：${body.reason}` : "訂單已取消。",
        },
      });
      await tx.orderEvent.create({
        data: {
          order_id: order.id,
          type: "cancelled",
          actor: "user",
          data: { reason: body.reason, refund_amount: refundAmount },
        },
      });
      return tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", cancel_reason: "user", cancelled_at: new Date() },
        include: projectOrderInclude(),
      });
    });
    await writeOrderStatusHistory({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "cancelled",
      actorId: session.user.id,
      reason: body.reason ?? "user_cancelled",
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
