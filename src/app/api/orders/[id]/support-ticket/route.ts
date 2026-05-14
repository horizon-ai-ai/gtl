import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const order = await prisma.order.findFirst({
      where: { id: params.id, user_id: session.user.id, deleted_at: null },
      include: { items: true },
    });
    if (!order) return fail("RESOURCE_NOT_FOUND", "Order not found");

    const ticket = await prisma.supportTicket.create({
      data: {
        user_id: session.user.id,
        conversation_id: order.conversation_id ?? undefined,
        category: "order_support",
        priority: order.status === "pending" ? "high" : "normal",
        subject: `訂單協助：${order.order_no}`,
        body: [
          `Order No: ${order.order_no}`,
          `[meta] order_id=${order.id}`,
          `Status: ${order.status}`,
          `Customer: ${JSON.stringify(order.customer)}`,
          `Items:`,
          ...order.items.map((item) => `- ${item.name} x ${item.quantity} @ ${item.unit_price}`),
          `Notes: ${order.notes ?? "-"}`,
        ].join("\n"),
      },
    });

    await prisma.supportConversation.upsert({
      where: { id: order.conversation_id ?? ticket.id },
      update: { mode: "human", status: "open" },
      create: {
        id: order.conversation_id ?? ticket.id,
        user_id: session.user.id,
        mode: "human",
        status: "open",
      },
    });

    return ok(ticket);
  } catch (err) {
    return handleError(err);
  }
}
