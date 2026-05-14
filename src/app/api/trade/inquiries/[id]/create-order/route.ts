import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { assertTradeModuleAccess } from "@/lib/trade";
import { generateOrderNo } from "@/lib/utils";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    if (session.user.role !== "admin" && session.user.role !== "super_admin") {
      await assertTradeModuleAccess(session.user.id);
    }

    const inquiry = await prisma.inquiry.findFirst({
      where:
        session.user.role === "admin" || session.user.role === "super_admin"
          ? { id: params.id }
          : { id: params.id, seller_id: session.user.id },
      include: {
        product: true,
        buyer: {
          include: {
            company: true,
          },
        },
      },
    });

    if (!inquiry) {
      throw new ApiError("RESOURCE_NOT_FOUND", "Inquiry not found");
    }

    const estimatedUnitPrice =
      inquiry.quoted_price ?? inquiry.target_price ?? inquiry.product.price_min ?? inquiry.product.price_max ?? 0;
    const orderQuantity = inquiry.quoted_quantity ?? inquiry.quantity;

    const order = await prisma.order.create({
      data: {
        user_id: inquiry.seller_id,
        order_no: generateOrderNo(),
        status: "draft",
        customer: {
          name: inquiry.buyer.company?.name ?? inquiry.buyer.display_name ?? inquiry.buyer.email,
          email: inquiry.buyer.email,
          phone: inquiry.buyer.company?.contact_phone ?? undefined,
          tax_id: inquiry.buyer.company?.tax_id ?? undefined,
        } as Prisma.InputJsonValue,
        notes: [
          `Created from trade inquiry ${inquiry.id}`,
          inquiry.notes ? `Inquiry notes: ${inquiry.notes}` : null,
          inquiry.delivery_terms ? `Delivery terms: ${inquiry.delivery_terms}` : null,
          inquiry.payment_terms ? `Payment terms: ${inquiry.payment_terms}` : null,
          inquiry.port_of_destination ? `Port of destination: ${inquiry.port_of_destination}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          source: "trade_inquiry",
          inquiry_id: inquiry.id,
          buyer_id: inquiry.buyer_id,
          product_id: inquiry.product_id,
          quotation_version: inquiry.quotation_version,
        } as Prisma.InputJsonValue,
        subtotal: orderQuantity * estimatedUnitPrice,
        total: orderQuantity * estimatedUnitPrice,
        items: {
          create: [
            {
              name: inquiry.product.name,
              description: inquiry.product.description,
              quantity: orderQuantity,
              unit_price: estimatedUnitPrice,
              total: orderQuantity * estimatedUnitPrice,
            },
          ],
        },
        events: {
          create: {
            type: "draft_created_from_inquiry",
            actor:
              session.user.role === "admin" || session.user.role === "super_admin" ? "admin" : "seller",
            data: {
              inquiry_id: inquiry.id,
              product_id: inquiry.product_id,
            } as Prisma.InputJsonValue,
          },
        },
      },
      include: { items: true },
    });

    await prisma.inquiry.update({
      where: { id: inquiry.id },
      data: { status: "closed" },
    });

    return ok(order);
  } catch (err) {
    return handleError(err);
  }
}
