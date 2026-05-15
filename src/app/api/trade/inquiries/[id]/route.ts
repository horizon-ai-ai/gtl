import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { assertVerifiedTradeProfile } from "@/lib/trade";
import { sendEmail } from "@/lib/notify";

const updateSchema = z.object({
  status: z.enum(["sent", "replied", "negotiating", "closed", "expired"]).optional(),
  quoted_price: z.number().int().nonnegative().optional().nullable(),
  quoted_quantity: z.number().int().positive().optional().nullable(),
  quotation_notes: z.string().max(2000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertVerifiedTradeProfile(session.user.id);

    const body = updateSchema.parse(await req.json());
    const inquiry = await prisma.inquiry.findFirst({
      where: {
        id: params.id,
        OR: [{ buyer_id: session.user.id }, { seller_id: session.user.id }],
      },
      include: {
        product: true,
        buyer: {
          select: {
            id: true,
            email: true,
            display_name: true,
            company: { select: { name: true } },
          },
        },
        seller: {
          select: {
            id: true,
            email: true,
            display_name: true,
            company: { select: { name: true } },
          },
        },
      },
    });

    if (!inquiry) throw new ApiError("RESOURCE_NOT_FOUND", "Inquiry not found");

    const isSeller = inquiry.seller_id === session.user.id;
    const isBuyer = inquiry.buyer_id === session.user.id;

    if ((body.quoted_price !== undefined || body.quoted_quantity !== undefined || body.quotation_notes !== undefined) && !isSeller) {
      throw new ApiError("FORBIDDEN", "Only seller can update quotation data");
    }

    if (body.status === "replied" && !isSeller) {
      throw new ApiError("FORBIDDEN", "Only seller can mark inquiry as replied");
    }
    if (body.status === "expired" && !isSeller) {
      throw new ApiError("FORBIDDEN", "Only seller can mark inquiry as expired");
    }
    if (body.status === "sent") {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Cannot revert inquiry to sent");
    }
    if (body.status === "negotiating" && !isBuyer && !isSeller) {
      throw new ApiError("FORBIDDEN", "Cannot move this inquiry into negotiation");
    }
    if (body.status === "closed" && !isSeller && !isBuyer) {
      throw new ApiError("FORBIDDEN", "Cannot close this inquiry");
    }
    if (body.status === "replied" && body.quoted_price == null && inquiry.quoted_price == null) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Replying with a quotation requires quoted price");
    }

    const shouldBumpVersion =
      isSeller && (body.quoted_price !== undefined || body.quoted_quantity !== undefined || body.quotation_notes !== undefined);
    const nextVersion = shouldBumpVersion ? inquiry.quotation_version + 1 : inquiry.quotation_version;
    const previousHistory =
      Array.isArray(inquiry.quotation_history) ? inquiry.quotation_history : [];
    const nextHistory =
      shouldBumpVersion
        ? [
            ...previousHistory,
            {
              version: nextVersion,
              quoted_price: body.quoted_price === undefined ? inquiry.quoted_price : body.quoted_price,
              quoted_quantity: body.quoted_quantity === undefined ? inquiry.quoted_quantity ?? inquiry.quantity : body.quoted_quantity,
              quotation_notes: body.quotation_notes === undefined ? inquiry.quotation_notes : body.quotation_notes,
              status: body.status ?? inquiry.status,
              updated_by: session.user.id,
              updated_at: new Date().toISOString(),
            },
          ]
        : previousHistory;

    const updated = await prisma.inquiry.update({
      where: { id: inquiry.id },
      data: {
        status: body.status,
        quoted_price: body.quoted_price === null ? null : body.quoted_price,
        quoted_quantity: body.quoted_quantity === null ? null : body.quoted_quantity,
        quotation_notes: body.quotation_notes === null ? null : body.quotation_notes,
        quotation_version: shouldBumpVersion ? { increment: 1 } : undefined,
        quotation_history: nextHistory,
      },
      include: {
        product: true,
        buyer: {
          select: {
            id: true,
            email: true,
            display_name: true,
            company: { select: { name: true } },
          },
        },
        seller: {
          select: {
            id: true,
            email: true,
            display_name: true,
            company: { select: { name: true } },
          },
        },
      },
    });

    if (shouldBumpVersion || body.status === "negotiating" || body.status === "closed" || body.status === "expired") {
      const buyerName = updated.buyer.company?.name ?? updated.buyer.display_name ?? updated.buyer.email;
      const sellerName = updated.seller.company?.name ?? updated.seller.display_name ?? updated.seller.email;
      const quotedPrice = updated.quoted_price ?? "-";
      const quotedQuantity = updated.quoted_quantity ?? updated.quantity;

      if (shouldBumpVersion) {
        await sendEmail({
          to: updated.buyer.email,
          subject: `Quotation updated for ${updated.product.name}`,
          text: [
            `Product: ${updated.product.name}`,
            `Seller: ${sellerName}`,
            `Buyer: ${buyerName}`,
            `Quotation version: ${updated.quotation_version}`,
            `Quoted quantity: ${quotedQuantity}`,
            `Quoted price: ${quotedPrice}`,
            `Status: ${updated.status}`,
            `Notes: ${updated.quotation_notes ?? "-"}`,
          ].join("\n"),
        });
      }

      if (body.status === "negotiating") {
        await sendEmail({
          to: [updated.buyer.email, updated.seller.email],
          subject: `Inquiry negotiation started for ${updated.product.name}`,
          text: [
            `Product: ${updated.product.name}`,
            `Buyer: ${buyerName}`,
            `Seller: ${sellerName}`,
            `Status: negotiating`,
          ].join("\n"),
        });
      }

      if (body.status === "closed" || body.status === "expired") {
        await sendEmail({
          to: [updated.buyer.email, updated.seller.email],
          subject: `Inquiry ${updated.status} for ${updated.product.name}`,
          text: [
            `Product: ${updated.product.name}`,
            `Buyer: ${buyerName}`,
            `Seller: ${sellerName}`,
            `Final status: ${updated.status}`,
          ].join("\n"),
        });
      }
    }

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
