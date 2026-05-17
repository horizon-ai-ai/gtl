import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { assertSellerTradeAccess, assertTradeModuleAccess } from "@/lib/trade";
import { getActiveTradeCategories, normalizeTradeCategoryName } from "@/lib/trade-categories";

const variantSchema = z.object({
  name: z.string().max(120),
  english_name: z.string().max(120).optional(),
  spec: z.string().max(200).optional(),
  price_fob_usd: z.string().max(50).optional(),
});

const updateProductSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  category: z.string().min(1).max(100).optional(),
  specs: z
    .object({
      unit_length_cm: z.string().max(50).optional(),
      unit_width_cm: z.string().max(50).optional(),
      unit_height_cm: z.string().max(50).optional(),
      unit_weight_kg: z.string().max(50).optional(),
      carton_quantity: z.string().max(50).optional(),
      carton_net_weight_kg: z.string().max(50).optional(),
      carton_gross_weight_kg: z.string().max(50).optional(),
      brand: z.string().max(120).optional(),
      english_name: z.string().max(120).optional(),
      barcode: z.string().max(120).optional(),
      product_spec_text: z.string().max(200).optional(),
      tax_category: z.string().max(100).optional(),
      original_price: z.string().max(50).optional(),
      promo_price: z.string().max(50).optional(),
      special_spec_enabled: z.boolean().optional(),
      special_variants: z.array(variantSchema).max(50).optional(),
      storage_days: z.string().max(50).optional(),
      storage_unit: z.string().max(50).optional(),
      storage_method: z.string().max(120).optional(),
      temp_control: z.string().max(20).optional(),
      feature_description: z.string().max(2000).optional(),
      full_description: z.string().max(4000).optional(),
      domestic_vendor_name: z.string().max(200).optional(),
      domestic_vendor_phone: z.string().max(100).optional(),
      domestic_vendor_address: z.string().max(300).optional(),
      vegetarian_type: z.string().max(100).optional(),
      ingredients: z.string().max(4000).optional(),
      marketing_claim: z.string().max(4000).optional(),
      liability_insurance: z.string().max(4000).optional(),
      food_registration_no: z.string().max(4000).optional(),
      commission_rate: z.string().max(50).optional(),
      hs_code: z.string().max(20).optional(),
      linked_site_id: z.string().max(120).optional(),
      linked_site_url: z.string().max(255).optional(),
    })
    .optional(),
  price_fob_usd: z.number().int().nonnegative().optional().nullable(),
  origin_country: z.string().max(100).optional().nullable(),
  certifications: z.array(z.string().min(1).max(100)).max(20).optional(),
  status: z.enum(["draft", "published", "paused"]).optional(),
});

async function findOwnedProduct(id: string, userId: string) {
  const product = await prisma.product.findFirst({
    where: { id, seller_id: userId, deleted_at: null },
    include: {
      seller: {
        select: {
          id: true,
          display_name: true,
          company: { select: { name: true } },
        },
      },
    },
  });
  if (!product) {
    throw new ApiError("RESOURCE_NOT_FOUND", "Product not found");
  }
  return product;
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeModuleAccess(session.user.id);

    const product = await prisma.product.findFirst({
      where: {
        id: params.id,
        deleted_at: null,
        OR: [{ seller_id: session.user.id }, { status: "published" }],
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
    });
    if (!product) return fail("RESOURCE_NOT_FOUND", "Product not found");
    return ok(product);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertSellerTradeAccess(session.user.id);

    await findOwnedProduct(params.id, session.user.id);
    const body = updateProductSchema.parse(await req.json());
    const categories = await getActiveTradeCategories();
    const data: Record<string, unknown> = {
      ...body,
      currency: "USD",
      unit: "pcs",
      moq: 1,
    };
    delete data.price_fob_usd;
    if (body.category) {
      data.category = normalizeTradeCategoryName(
        body.category,
        categories.map((category) => category.name),
      );
    }
    if (body.price_fob_usd !== undefined) {
      data.price_min = body.price_fob_usd;
      data.price_max = body.price_fob_usd;
    }

    const product = await prisma.product.update({
      where: { id: params.id },
      data,
      include: {
        seller: {
          select: {
            id: true,
            display_name: true,
            company: { select: { name: true } },
          },
        },
      },
    });
    return ok(product);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertSellerTradeAccess(session.user.id);

    await findOwnedProduct(params.id, session.user.id);
    await prisma.product.update({
      where: { id: params.id },
      data: {
        deleted_at: new Date(),
        status: "paused",
      },
    });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
