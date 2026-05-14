import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError } from "@/lib/api";
import { assertTradeModuleAccess } from "@/lib/trade";
import { createSimplePdf } from "@/lib/pdf";

export async function GET(_: Request, { params }: { params: { id: string } }) {
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
        buyer: { include: { company: true } },
        seller: { include: { company: true } },
      },
    });
    if (!inquiry) return fail("RESOURCE_NOT_FOUND", "Inquiry not found");

    const pdf = createSimplePdf(`Quotation ${inquiry.id.slice(0, 8)}`, [
      `Product: ${inquiry.product.name}`,
      `Buyer: ${inquiry.buyer.company?.name ?? inquiry.buyer.display_name ?? inquiry.buyer.email}`,
      `Seller: ${inquiry.seller.company?.name ?? inquiry.seller.display_name ?? inquiry.seller.email}`,
      `Inquiry quantity: ${inquiry.quantity}`,
      `Quoted quantity: ${inquiry.quoted_quantity ?? inquiry.quantity}`,
      `Target price: ${inquiry.target_price ?? "-"}`,
      `Quoted price: ${inquiry.quoted_price ?? "-"}`,
      `Delivery terms: ${inquiry.delivery_terms ?? "-"}`,
      `Destination: ${inquiry.port_of_destination ?? "-"}`,
      `Payment terms: ${inquiry.payment_terms ?? "-"}`,
      `Quotation version: ${inquiry.quotation_version}`,
      `Quotation notes: ${inquiry.quotation_notes ?? "-"}`,
      `Notes: ${inquiry.notes ?? "-"}`,
      `Generated at: ${new Date().toLocaleString("zh-TW")}`,
    ]);

    await prisma.inquiry.update({
      where: { id: inquiry.id },
      data: {
        quotation_pdf_url: `/api/trade/inquiries/${inquiry.id}/quotation.pdf`,
        status: inquiry.status === "sent" ? "replied" : inquiry.status,
      },
    });

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="quotation-${inquiry.id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
