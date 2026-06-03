import { requireAdmin } from "@/lib/auth";
import { handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function POST() {
  try {
    await requireAdmin();
    const now = new Date();
    const expiredQuotes = await prisma.projectQuote.findMany({
      where: {
        status: "active",
        expires_at: { lt: now },
        order: { status: "quoted", deleted_at: null },
      },
      include: { order: true },
      take: 100,
    });

    for (const quote of expiredQuotes) {
      await prisma.$transaction(async (tx) => {
        await tx.projectQuote.update({ where: { id: quote.id }, data: { status: "expired" } });
        await tx.order.update({
          where: { id: quote.order_id },
          data: { status: "cancelled", cancel_reason: "quote_expired", cancelled_at: now },
        });
        await tx.orderStatusHistory.create({
          data: {
            order_id: quote.order_id,
            from_status: "quoted",
            to_status: "cancelled",
            reason: "quote_expired",
          },
        });
        await tx.orderMessage.create({
          data: {
            order_id: quote.order_id,
            sender_role: "system",
            kind: "system_event",
            body: "報價已逾期，系統已自動取消訂單。",
          },
        });
      });
    }

    return ok({ expired: expiredQuotes.length });
  } catch (err) {
    return handleError(err);
  }
}
