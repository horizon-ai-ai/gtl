import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ok, handleError, ApiError } from "@/lib/api";
import { lookupTaxId, validateTaxIdFormat } from "@/lib/gcis";
import { ensureDefaultSubscription } from "@/lib/subscriptions";
import { issueToken } from "@/lib/auth/tokens";
import { sendVerifyEmail } from "@/lib/auth/emails";

async function dispatchVerifyEmail(userId: string, email: string) {
  try {
    const { token } = await issueToken(userId, "verify");
    await sendVerifyEmail(email, token);
  } catch (err) {
    console.error("[register] failed to dispatch verification email", {
      user_id: userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const baseSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  display_name: z.string().min(2).max(30).optional(),
});

const personalSchema = baseSchema.extend({
  type: z.literal("personal"),
});

const companySchema = baseSchema.extend({
  type: z.literal("company"),
  tax_id: z.string().regex(/^\d{8}$/),
  company_name: z.string().min(1).max(200),
  company_name_en: z.string().min(1).max(200),
  address: z.string().min(1).max(300),
  industry: z.string().min(1).max(100),
  contact_name: z.string().min(2).max(30),
  contact_phone: z.string().min(1).max(50),
  contact_email: z.string().email().max(200),
  referral_sources: z.array(z.string().min(1).max(50)).min(1).max(10),
  website: z.string().max(255).optional(),
  remarks: z.string().max(2000).optional(),
  employee_size: z.string().optional(),
});

const schema = z.discriminatedUnion("type", [personalSchema, companySchema]);

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());

    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw new ApiError("CONFLICT", "Email already registered");

    const password_hash = await bcrypt.hash(body.password, 12);

    if (body.type === "company") {
      if (!validateTaxIdFormat(body.tax_id)) {
        throw new ApiError("VALIDATION_ERROR", "Invalid tax_id format");
      }
      const dup = await prisma.companyProfile.findUnique({ where: { tax_id: body.tax_id } });
      if (dup) throw new ApiError("CONFLICT", "Tax ID already registered");

      const lookup = await lookupTaxId(body.tax_id);
      const verified = lookup?.source === "gcis";

      const user = await prisma.user.create({
        data: {
          email: body.email,
          password_hash,
          type: "company",
          display_name: body.display_name ?? lookup?.name ?? body.email.split("@")[0],
          company: {
            create: {
              tax_id: body.tax_id,
              name: body.company_name || (lookup?.name ?? ""),
              name_en: body.company_name_en,
              address: body.address || (lookup?.address ?? ""),
              owner_name: lookup?.owner_name,
              business_items: lookup?.business_items ?? [],
              industry: body.industry,
              employee_size: body.employee_size,
              contact_name: body.contact_name,
              contact_phone: body.contact_phone,
              contact_email: body.contact_email,
              referral_sources: body.referral_sources,
              website: body.website,
              remarks: body.remarks,
              verified,
              verified_source: verified ? "gcis" : "manual",
            },
          },
        },
        include: { company: true },
      });
      await ensureDefaultSubscription(user.id);
      await dispatchVerifyEmail(user.id, user.email);
      return ok({ user_id: user.id, type: user.type, company: user.company });
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        password_hash,
        type: "personal",
        display_name: body.display_name ?? body.email.split("@")[0],
      },
    });
    await ensureDefaultSubscription(user.id);
    await dispatchVerifyEmail(user.id, user.email);
    return ok({ user_id: user.id, type: user.type });
  } catch (err) {
    return handleError(err);
  }
}
