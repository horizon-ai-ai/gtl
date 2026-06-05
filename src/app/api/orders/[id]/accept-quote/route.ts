import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  PROJECT_ORDER_POLICY,
  assertProjectTransition,
  defaultReviewItems,
  projectOrderInclude,
} from "@/lib/project-orders";

const acceptSchema = z.object({
  method: z.enum(["card", "transfer", "manual"]).default("manual"),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = acceptSchema.parse(await req.json().catch(() => ({})));
    const order = await prisma.order.findFirst({ where: { id: params.id, user_id: session.user.id, deleted_at: null } });
    if (!order) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    assertProjectTransition(order.status, "confirmed");

    const quote = await prisma.projectQuote.findFirst({
      where: { order_id: order.id, status: "active" },
      orderBy: { quoted_at: "desc" },
    });
    if (!quote) throw new ApiError("BUSINESS_RULE_VIOLATION", "No active quote to accept");
    if (quote.expires_at.getTime() < Date.now()) throw new ApiError("BUSINESS_RULE_VIOLATION", "Quote expired");

    const updated = await prisma.$transaction(async (tx) => {
      // Claim the order first with a status-guarded write: if a concurrent
      // accept already moved it off the pre-accept status, zero rows match
      // and this request aborts before any money/quota side-effect runs.
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: "confirmed", confirmed_at: new Date(), total: quote.amount, subtotal: quote.amount },
      });
      if (claimed.count === 0) {
        throw new ApiError("CONFLICT", "Quote was already accepted or the order changed state");
      }
      await tx.projectQuote.update({ where: { id: quote.id }, data: { status: "accepted" } });
      await tx.projectPayment.create({
        data: {
          order_id: order.id,
          customer_id: session.user.id,
          kind: "deposit",
          amount: quote.deposit_amount,
          method: body.method,
          status: "paid",
          paid_at: new Date(),
        },
      });
      await tx.revisionQuota.upsert({
        where: { order_id: order.id },
        update: { total: PROJECT_ORDER_POLICY.includedRevisions },
        create: { order_id: order.id, total: PROJECT_ORDER_POLICY.includedRevisions, used: 0 },
      });
      const existingReviewItems = await tx.reviewItem.count({ where: { order_id: order.id } });
      if (existingReviewItems === 0) {
        await tx.reviewItem.createMany({
          data: defaultReviewItems(order.project_type ?? "project").map((item) => ({
            order_id: order.id,
            label: item.label,
            sort_order: item.sort_order,
          })),
        });
      }
      await tx.orderMessage.create({
        data: {
          order_id: order.id,
          sender_role: "system",
          kind: "system_event",
          body: "訂金已確認，專案成立並開啟訂單聊天室。",
        },
      });
      await tx.orderEvent.create({
        data: { order_id: order.id, type: "deposit_paid", actor: "user", data: { quote_id: quote.id } },
      });
      await tx.orderStatusHistory.create({
        data: {
          order_id: order.id,
          from_status: order.status,
          to_status: "confirmed",
          actor_id: session.user.id,
          reason: "deposit_paid",
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: projectOrderInclude() });
    });

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
