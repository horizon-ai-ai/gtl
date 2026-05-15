import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";
import { assertSellerTradeAccess } from "@/lib/trade";

const profileSchema = z.object({
  role: z.enum(["seller"]).default("seller"),
  description: z.string().max(1000).optional(),
  product_categories: z.array(z.string().min(1).max(50)).max(20).default([]),
  target_markets: z.array(z.string().min(1).max(50)).max(20).default([]),
  budget_range: z.string().max(100).optional(),
  capacity: z.string().max(100).optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertSellerTradeAccess(session.user.id);

    const profile = await prisma.tradeProfile.findUnique({
      where: { user_id: session.user.id },
    });

    return ok(profile);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertSellerTradeAccess(session.user.id);

    const body = profileSchema.parse(await req.json());
    const profile = await prisma.tradeProfile.upsert({
      where: { user_id: session.user.id },
      update: {
        ...body,
        verified: false,
      },
      create: {
        user_id: session.user.id,
        verified: false,
        ...body,
      },
    });

    return ok(profile);
  } catch (err) {
    return handleError(err);
  }
}
