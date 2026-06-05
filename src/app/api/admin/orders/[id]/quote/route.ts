import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertProjectTransition, projectOrderInclude, quoteExpiresAt, writeOrderStatusHistory } from "@/lib/project-orders";

const quoteSchema = z.object({
  amount: z.number().int().positive(),
  deposit_amount: z.number().int().positive(),
  cancellation_terms: z.string().min(1).max(4000),
  valid_days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(14),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const body = quoteSchema.parse(await req.json());
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order || order.deleted_at) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    assertProjectTransition(order.status, "quoted");

    const updated = await prisma.$transaction(async (tx) => {
      await tx.projectQuote.updateMany({
        where: { order_id: order.id, status: "active" },
        data: { status: "superseded" },
      });
      const quotedAt = new Date();
      await tx.projectQuote.create({
        data: {
          order_id: order.id,
          amount: body.amount,
          deposit_amount: body.deposit_amount,
          cancellation_terms: body.cancellation_terms,
          valid_days: body.valid_days,
          quoted_at: quotedAt,
          expires_at: quoteExpiresAt(body.valid_days, quotedAt),
          quoted_by: admin.id,
        },
      });
      await tx.orderEvent.create({
        data: {
          order_id: order.id,
          type: "quoted",
          actor: "admin",
          data: { amount: body.amount, deposit_amount: body.deposit_amount, valid_days: body.valid_days },
        },
      });
      await tx.orderMessage.create({
        data: {
          order_id: order.id,
          sender_role: "system",
          kind: "system_event",
          body: `後台已送出報價，效期 ${body.valid_days} 天。`,
        },
      });
      return tx.order.update({
        where: { id: order.id },
        data: { status: "quoted", subtotal: body.amount, total: body.amount },
        include: projectOrderInclude(),
      });
    });
    await writeOrderStatusHistory({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "quoted",
      actorId: admin.id,
      reason: "admin_quoted",
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
