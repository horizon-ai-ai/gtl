import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";
import { assertTradeModuleAccess } from "@/lib/trade";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeModuleAccess(session.user.id);

    const buyer = await prisma.user.findFirst({
      where: {
        id: params.id,
        deleted_at: null,
        OR: [
          { id: session.user.id },
          { inquiries_sent: { some: { seller_id: session.user.id } } },
          { inquiries_recv: { some: { buyer_id: session.user.id } } },
        ],
      },
      select: {
        id: true,
        email: true,
        display_name: true,
        company: {
          select: {
            name: true,
            tax_id: true,
            contact_name: true,
            contact_phone: true,
            industry: true,
          },
        },
        trade_profile: {
          select: {
            role: true,
            description: true,
            target_markets: true,
            budget_range: true,
            product_categories: true,
          },
        },
        inquiries_sent: {
          where: { buyer_id: params.id },
          orderBy: { created_at: "desc" },
          take: 20,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
            seller: {
              select: {
                id: true,
                display_name: true,
                company: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!buyer) return fail("RESOURCE_NOT_FOUND", "Buyer not found");
    return ok({
      ...buyer,
      buyer_inquiries: buyer.inquiries_sent,
    });
  } catch (err) {
    return handleError(err);
  }
}
