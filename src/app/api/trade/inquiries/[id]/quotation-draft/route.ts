import { auth } from "@/lib/auth";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { listSellerQuotationRows } from "@/lib/trade-quotations";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const inquiries = await listSellerQuotationRows(session.user.id);
    const inquiry = inquiries.find((item) => item.id === params.id);
    if (!inquiry) throw new ApiError("RESOURCE_NOT_FOUND", "Inquiry not found");

    const buyerName = inquiry.buyer_name || inquiry.buyer_email;
    const draft = [
      `Dear ${buyerName},`,
      ``,
      `Thank you for your inquiry on ${inquiry.product_name}.`,
      `We are pleased to offer the following quotation based on your request.`,
      ``,
      `Product: ${inquiry.product_name}`,
      `Quantity: ${inquiry.quoted_quantity ?? inquiry.quantity}`,
      `Quoted price: USD ${(inquiry.quoted_price ?? inquiry.target_price ?? 0).toLocaleString()} FOB`,
      `Origin: -`,
      `Payment terms: T/T`,
      `Delivery terms: FOB`,
      `Destination port: -`,
      ``,
      `Please let us know if you would like to proceed or discuss custom specifications.`,
      ``,
      `Best regards,`,
      `${session.user.email}`,
    ].join("\n");

    return ok({ quotation_notes: draft });
  } catch (err) {
    return handleError(err);
  }
}
