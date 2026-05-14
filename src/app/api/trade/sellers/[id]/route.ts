import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";
import { assertTradeModuleAccess } from "@/lib/trade";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeModuleAccess(session.user.id);

    const seller = await prisma.user.findFirst({
      where: {
        id: params.id,
        deleted_at: null,
        trade_profile: {
          role: { in: ["seller", "both"] },
        },
      },
      select: {
        id: true,
        email: true,
        display_name: true,
        avatar_url: true,
        company: true,
        trade_profile: true,
        products: {
          where: { deleted_at: null, status: "published" },
          orderBy: { created_at: "desc" },
          take: 50,
        },
      },
    });

    if (!seller) return fail("RESOURCE_NOT_FOUND", "Seller not found");
    return ok(seller);
  } catch (err) {
    return handleError(err);
  }
}
