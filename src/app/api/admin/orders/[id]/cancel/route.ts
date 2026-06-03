import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertProjectTransition, projectOrderInclude, writeOrderStatusHistory } from "@/lib/project-orders";

const cancelSchema = z.object({
  reason: z.string().min(1).max(1000),
  refund_amount: z.number().int().nonnegative().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const body = cancelSchema.parse(await req.json());
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order || order.deleted_at) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    assertProjectTransition(order.status, "cancelled");

    const updated = await prisma.$transaction(async (tx) => {
      const deposit = await tx.projectPayment.findFirst({
        where: { order_id: order.id, kind: "deposit", status: "paid" },
        orderBy: { paid_at: "desc" },
      });
      if (deposit && body.refund_amount && body.refund_amount > 0) {
        await tx.projectPayment.update({
          where: { id: deposit.id },
          data: { status: "partial_refund", refund_amount: body.refund_amount },
        });
      }
      await tx.orderMessage.create({
        data: {
          order_id: order.id,
          sender_role: "system",
          kind: "system_event",
          body: `後台取消訂單：${body.reason}`,
        },
      });
      return tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", cancel_reason: "admin", cancelled_at: new Date() },
        include: projectOrderInclude(),
      });
    });
    await writeOrderStatusHistory({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "cancelled",
      actorId: admin.id,
      reason: body.reason,
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
