import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: { sort_order: "asc" },
    });
    return ok(
      plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        price_monthly: p.price_monthly,
        monthly_credits: Number(p.monthly_credits),
        features: p.features,
      }))
    );
  } catch (err) {
    return handleError(err);
  }
}
