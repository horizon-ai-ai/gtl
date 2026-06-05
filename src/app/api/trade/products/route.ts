import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { assertSellerTradeAccess } from "@/lib/trade";
import { getActiveTradeCategories, normalizeTradeCategoryName } from "@/lib/trade-categories";

const imagePathSchema = z.string().refine((value) => value.startsWith("/") || /^https?:\/\//.test(value), {
  message: "Image must be an absolute URL or local asset path",
});

const variantSchema = z.object({
  name: z.string().max(120),
  english_name: z.string().max(120).optional(),
  spec: z.string().max(200).optional(),
  price_fob_usd: z.string().max(50).optional(),
});

const specsSchema = z.object({
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
  quantity_range: z.string().max(120).optional(),
  total_price: z.string().max(120).optional(),
  remarks: z.string().max(4000).optional(),
  seller_info: z.string().max(1000).optional(),
  shelf_life: z.string().max(200).optional(),
  allergens: z.string().max(2000).optional(),
  nutrition_label: z.string().max(4000).optional(),
  permit_no: z.string().max(500).optional(),
  return_policy: z.string().max(2000).optional(),
  warranty_policy: z.string().max(2000).optional(),
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
});

const createProductSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  category: z.string().min(1).max(100),
  hs_code: z.string().max(20).optional(),
  images: z.array(imagePathSchema).max(10).default([]),
  specs: specsSchema.optional(),
  price_fob_usd: z.number().int().nonnegative().optional(),
  origin_country: z.string().max(100).optional(),
  certifications: z.array(z.string().min(1).max(100)).max(20).default([]),
  status: z.enum(["draft", "published", "paused"]).default("published"),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "market";
    const q = url.searchParams.get("q")?.trim();
    const category = url.searchParams.get("category")?.trim();
    const hsCode = url.searchParams.get("hs_code")?.trim();
    const sellerId = url.searchParams.get("seller_id")?.trim();

    if (scope === "mine") {
      await assertSellerTradeAccess(session.user.id);
    }

    const items = await prisma.product.findMany({
      where: {
        deleted_at: null,
        ...(scope === "mine"
          ? { seller_id: session.user.id }
          : {
              status: "published",
              ...(sellerId ? { seller_id: sellerId } : { seller_id: { not: session.user.id } }),
            }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { hs_code: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(category ? { category: { contains: category, mode: "insensitive" } } : {}),
        ...(hsCode ? { hs_code: { contains: hsCode, mode: "insensitive" } } : {}),
      },
      include: {
        seller: {
          select: {
            id: true,
            display_name: true,
            company: { select: { name: true } },
            trade_profile: { select: { role: true, target_markets: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });

    return ok(items);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertSellerTradeAccess(session.user.id);

    const tradeProfile = await prisma.tradeProfile.findUnique({
      where: { user_id: session.user.id },
    });
    if (!tradeProfile || tradeProfile.role !== "seller") {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Seller profile required");
    }

    const body = createProductSchema.parse(await req.json());
    const categories = await getActiveTradeCategories();
    const normalizedCategory = normalizeTradeCategoryName(
      body.category,
      categories.map((category) => category.name),
    );

    const product = await prisma.product.create({
      data: {
        seller_id: session.user.id,
        name: body.name,
        description: body.description,
        hs_code: body.hs_code,
        category: normalizedCategory,
        images: body.images,
        specs: body.specs,
        price_min: body.price_fob_usd,
        price_max: body.price_fob_usd,
        currency: "USD",
        origin_country: body.origin_country,
        certifications: body.certifications,
        status: "published",
        unit: "pcs",
        moq: 1,
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

    return ok(product);
  } catch (err) {
    return handleError(err);
  }
}
