import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { generateSiteSchema, slugifySiteName } from "@/lib/site-builder";
import { saveSiteFiles } from "@/lib/site-assets";
import { createTradeProductDraftFromImages } from "@/lib/trade-vision";
import { assertTradeSiteBuilderAccess } from "@/lib/trade";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  industry: z.string().max(120).optional(),
  audience: z.string().max(200).optional(),
  goal: z.string().max(200).optional(),
  product_notes: z.string().max(1200).optional(),
  generate_with_ai: z.boolean().default(true),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeSiteBuilderAccess(session.user.id);

    const sites = await prisma.site.findMany({
      where: { user_id: session.user.id, deleted_at: null },
      orderBy: { created_at: "desc" },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      take: 50,
    });
    return ok(sites);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeSiteBuilderAccess(session.user.id);
    const contentType = req.headers.get("content-type") ?? "";

    let body: z.infer<typeof createSchema>;
    let siteImageUrls: string[] = [];
    let productDraft: Awaited<ReturnType<typeof createTradeProductDraftFromImages>> | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const files = formData
        .getAll("images")
        .filter((value): value is File => value instanceof File && value.size > 0);

      body = createSchema.parse({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        industry: String(formData.get("industry") ?? ""),
        audience: String(formData.get("audience") ?? ""),
        goal: String(formData.get("goal") ?? ""),
        product_notes: String(formData.get("product_notes") ?? ""),
        generate_with_ai: String(formData.get("generate_with_ai") ?? "true") === "true",
      });

      if (files.length > 0) {
        siteImageUrls = await saveSiteFiles(files, session.user.id, "products");
        productDraft = await createTradeProductDraftFromImages(files);
      }
    } else {
      body = createSchema.parse(await req.json());
    }

    const baseSlug = slugifySiteName(body.name);

    let slug = baseSlug;
    let counter = 1;
    while (await prisma.site.findUnique({ where: { slug } })) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    const schema = body.generate_with_ai
      ? await generateSiteSchema({
          business_name: body.name,
          description: body.description,
          industry: body.industry,
          audience: body.audience,
          goal: body.goal,
          product_notes: body.product_notes,
          product_image_urls: siteImageUrls,
          product_draft: productDraft,
        })
      : {
          title: body.name,
          tagline: body.description ?? body.product_notes ?? "",
          primary_color: "#171717",
          product_images: siteImageUrls,
          inquiry_cta_label: "立即詢價",
          inquiry_cta_note: "想了解更多商品資訊，歡迎立即詢價。",
          sections: [
            {
              type: "hero",
              title: body.name,
              body: body.product_notes ?? body.description ?? "",
              image_url: siteImageUrls[0],
              button_label: "立即詢價",
            },
            {
              type: "story",
              title: "商品介紹",
              body: body.description ?? "",
            },
            {
              type: "cta",
              title: "立即詢價",
              body: "若想了解報價、MOQ 或交期，歡迎立即詢價。",
              button_label: "立即詢價",
            },
          ],
        };

    const site = await prisma.site.create({
      data: {
        user_id: session.user.id,
        slug,
        name: body.name,
        description: body.description ?? body.product_notes ?? null,
        theme: schema
          ? {
              primary_color: schema.primary_color,
            }
          : undefined,
        versions: {
          create: {
            version: 1,
            schema: (schema ?? {
              title: body.name,
              tagline: body.description ?? "",
              sections: [],
            }) as object,
          },
        },
      },
      include: { versions: true },
    });

    const currentVersion = site.versions[0];
    if (!currentVersion) throw new ApiError("INTERNAL_ERROR", "Site version not created");

    const updated = await prisma.site.update({
      where: { id: site.id },
      data: { current_version_id: currentVersion.id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
