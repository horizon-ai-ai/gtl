import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const order = await prisma.order.findFirst({ where: { id: params.id, user_id: session.user.id, deleted_at: null } });
    if (!order) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    const quote = await prisma.projectQuote.findFirst({
      where: { order_id: order.id, status: "active" },
      orderBy: { quoted_at: "desc" },
    });
    return ok(quote);
  } catch (err) {
    return handleError(err);
  }
}
