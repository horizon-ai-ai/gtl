import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";
import { assertSellerTradeAccess } from "@/lib/trade";

const companyInfoSchema = z.object({
  company_name: z.string().min(1).max(200),
  company_name_en: z.string().min(1).max(200),
  tax_id: z.string().min(1).max(20),
  company_address: z.string().min(1).max(300),
  industry: z.string().min(1).max(100),
  contact_name: z.string().min(1).max(100),
  contact_phone: z.string().min(1).max(50),
  contact_email: z.string().min(1).max(200),
  referral_sources: z.array(z.string().min(1).max(50)).min(1).max(10),
  website: z.string().max(255).optional(),
  remarks: z.string().max(2000).optional(),
  bank_account_name: z.string().max(200).optional(),
  bank_account_number: z.string().max(100).optional(),
  bank_swift_code: z.string().max(50).optional(),
  bank_passbook_image: z.string().max(500).optional(),
  contract_agreed: z.literal(true),
});

const profileSchema = z.object({
  role: z.enum(["seller"]).default("seller"),
  description: z.string().max(1000).optional(),
  product_categories: z.array(z.string().min(1).max(50)).max(20).default([]),
  target_markets: z.array(z.string().min(1).max(50)).max(20).default([]),
  budget_range: z.string().max(100).optional(),
  capacity: z.string().max(100).optional(),
  company_info: companyInfoSchema.optional(),
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
