import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError } from "@/lib/api";
import { inquiryToPIData } from "@/lib/pdf/inquiry-to-pi-data";
import { renderProFormaInvoice } from "@/lib/pdf/render";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

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

    const pdf = await renderProFormaInvoice(inquiryToPIData(inquiry));

    await prisma.inquiry.update({
      where: { id: inquiry.id },
      data: {
        quotation_pdf_url: `/api/trade/inquiries/${inquiry.id}/quotation.pdf`,
        status: inquiry.status === "sent" ? "replied" : inquiry.status,
      },
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="quotation-${inquiry.id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
