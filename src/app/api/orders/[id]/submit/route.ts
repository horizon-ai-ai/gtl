import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertProjectTransition, projectOrderInclude, writeOrderStatusHistory } from "@/lib/project-orders";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const order = await prisma.order.findFirst({ where: { id: params.id, user_id: session.user.id, deleted_at: null } });
    if (!order) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    assertProjectTransition(order.status, "quote_pending");

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "quote_pending",
        submitted_at: new Date(),
        events: { create: { type: "submitted_for_quote", actor: "user" } },
      },
      include: projectOrderInclude(),
    });
    await writeOrderStatusHistory({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "quote_pending",
      actorId: session.user.id,
      reason: "submitted_for_quote",
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
