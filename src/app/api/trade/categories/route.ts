import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";
import { assertTradeModuleAccess } from "@/lib/trade";
import { getActiveTradeCategories } from "@/lib/trade-categories";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeModuleAccess(session.user.id);

    const [categories, rows] = await Promise.all([
      getActiveTradeCategories(),
      prisma.product.findMany({
      where: { deleted_at: null, status: "published" },
      select: { category: true, hs_code: true },
      orderBy: { category: "asc" },
      take: 500,
    }),
    ]);

    const hs_codes = Array.from(
      new Set(rows.map((row) => row.hs_code).filter((value): value is string => Boolean(value)))
    );

    const response = ok({ categories: categories.map((category) => category.name), hs_codes });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err) {
    return handleError(err);
  }
}
