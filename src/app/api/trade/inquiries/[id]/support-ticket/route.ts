import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";
import { assertTradeModuleAccess } from "@/lib/trade";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeModuleAccess(session.user.id);

    const inquiry = await prisma.inquiry.findFirst({
      where: {
        id: params.id,
        OR: [{ buyer_id: session.user.id }, { seller_id: session.user.id }],
      },
      include: {
        product: true,
        buyer: {
          select: {
            email: true,
            display_name: true,
            company: { select: { name: true } },
          },
        },
        seller: {
          select: {
            email: true,
            display_name: true,
            company: { select: { name: true } },
          },
        },
      },
    });
    if (!inquiry) return fail("RESOURCE_NOT_FOUND", "Inquiry not found");

    const counterpart =
      inquiry.buyer_id === session.user.id
        ? inquiry.seller.company?.name ?? inquiry.seller.display_name ?? inquiry.seller.email
        : inquiry.buyer.company?.name ?? inquiry.buyer.display_name ?? inquiry.buyer.email;

    const ticket = await prisma.supportTicket.create({
      data: {
        user_id: session.user.id,
        category: "trade_inquiry",
        priority: "high",
        subject: `貿易詢價協助：${inquiry.product.name}`,
        body: [
          `Inquiry ID: ${inquiry.id}`,
          `[meta] inquiry_id=${inquiry.id}`,
          `Product: ${inquiry.product.name}`,
          `Counterparty: ${counterpart}`,
          `Quantity: ${inquiry.quantity}`,
          `Target price: ${inquiry.target_price ?? "-"}`,
          `Delivery terms: ${inquiry.delivery_terms ?? "-"}`,
          `Port of destination: ${inquiry.port_of_destination ?? "-"}`,
          `Payment terms: ${inquiry.payment_terms ?? "-"}`,
          `Notes: ${inquiry.notes ?? "-"}`,
        ].join("\n"),
      },
    });

    await prisma.supportConversation.upsert({
      where: { id: ticket.id },
      update: { mode: "human", status: "open" },
      create: {
        id: ticket.id,
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
