import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { PROJECT_ORDER_POLICY, projectOrderInclude } from "@/lib/project-orders";

const purchaseSchema = z.object({
  quantity: z.number().int().positive().max(20).default(1),
  method: z.enum(["points", "card", "transfer", "manual"]).default("points"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = purchaseSchema.parse(await req.json().catch(() => ({})));
    const order = await prisma.order.findFirst({ where: { id: params.id, user_id: session.user.id, deleted_at: null } });
    if (!order) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    if (order.status !== "confirmed" && order.status !== "in_execution") {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "只有成立後的專案可以加購修改額度");
    }

    const pointCost = body.quantity * PROJECT_ORDER_POLICY.pointsPerRevision;
    const amount = body.quantity * PROJECT_ORDER_POLICY.revisionUnitPrice;
    const updated = await prisma.$transaction(async (tx) => {
      if (body.method === "points") {
        const wallet = await tx.pointWallet.upsert({
          where: { customer_id: session.user.id },
          update: {},
          create: { customer_id: session.user.id, balance: 0 },
        });
        if (wallet.balance < pointCost) {
          throw new ApiError("QUOTA_EXCEEDED", "點數不足，請先儲值或改用付款加購");
        }
        await tx.pointWallet.update({
          where: { customer_id: session.user.id },
          data: { balance: { decrement: pointCost } },
        });
        await tx.pointTransaction.create({
          data: {
            customer_id: session.user.id,
            delta: -pointCost,
            reason: "buy_revision",
            ref_order_id: order.id,
          },
        });
      }
      await tx.projectPayment.create({
        data: {
          order_id: order.id,
          customer_id: session.user.id,
          kind: "revision_quota",
          amount: body.method === "points" ? 0 : amount,
          method: body.method,
          status: "paid",
          paid_at: new Date(),
        },
      });
      await tx.revisionQuota.upsert({
        where: { order_id: order.id },
        update: { total: { increment: body.quantity } },
        create: { order_id: order.id, total: body.quantity, used: 0 },
      });
      await tx.orderMessage.create({
        data: {
          order_id: order.id,
          sender_role: "system",
          kind: "system_event",
          body: `已加購 ${body.quantity} 次修改額度。`,
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: projectOrderInclude() });
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
