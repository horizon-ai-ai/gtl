import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ok, handleError, ApiError } from "@/lib/api";
import { lookupTaxId, validateTaxIdFormat } from "@/lib/gcis";
import { ensureDefaultSubscription } from "@/lib/subscriptions";

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
  contact_name: z.string().min(2).max(30).optional(),
  contact_phone: z.string().optional(),
  industry: z.string().optional(),
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
              name: lookup?.name ?? "",
              address: lookup?.address ?? "",
              owner_name: lookup?.owner_name,
              business_items: lookup?.business_items ?? [],
              industry: body.industry,
              employee_size: body.employee_size,
              contact_name: body.contact_name,
              contact_phone: body.contact_phone,
              verified,
              verified_source: verified ? "gcis" : "manual",
            },
          },
        },
        include: { company: true },
      });
      await ensureDefaultSubscription(user.id);
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
    return ok({ user_id: user.id, type: user.type });
  } catch (err) {
    return handleError(err);
  }
}
