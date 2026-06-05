import { handleError, ok } from "@/lib/api";
import { requireSessionUser } from "@/lib/conversation/api";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const products = await prisma.product.findMany({
      where: {
        seller_id: user.id,
        deleted_at: null,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { category: { contains: q, mode: "insensitive" } },
                { hs_code: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        seller: {
          select: {
            id: true,
            display_name: true,
            company: { select: { name: true } },
          },
        },
      },
      orderBy: { updated_at: "desc" },
      take: 50,
    });

    return ok(products);
  } catch (err) {
    return handleError(err);
  }
}
