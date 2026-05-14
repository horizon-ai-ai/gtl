import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { assertTradeModuleAccess } from "@/lib/trade";
import { sendEmail } from "@/lib/notify";
import { getInquiryColumnSupport } from "@/lib/trade-quotations";

const createInquirySchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  target_price: z.number().int().nonnegative().optional(),
  delivery_terms: z.string().max(100).optional(),
  port_of_destination: z.string().max(100).optional(),
  payment_terms: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  expires_in_days: z.number().int().positive().max(90).default(30),
});

function expiresAt(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function listInquiriesForUser(userId: string, mode: "sent" | "received") {
  const columns = await getInquiryColumnSupport();
  const quotedPrice = columns.quoted_price ? `i."quoted_price"` : `NULL::integer`;
  const quotedQuantity = columns.quoted_quantity ? `i."quoted_quantity"` : `NULL::integer`;
  const quotationNotes = columns.quotation_notes ? `i."quotation_notes"` : `NULL::text`;
  const quotationVersion = columns.quotation_version
    ? `i."quotation_version"`
    : `CASE
         WHEN ${columns.quoted_price ? `i."quoted_price" IS NOT NULL` : `false`}
           OR ${columns.quotation_notes ? `COALESCE(i."quotation_notes", '') <> ''` : `false`}
         THEN 1
         ELSE 0
       END`;

  return prisma.$queryRawUnsafe<
    Array<{
      id: string;
      quantity: number;
      target_price: number | null;
      status: string;
      quoted_price: number | null;
      quoted_quantity: number | null;
      quotation_notes: string | null;
      quotation_version: number;
      quotation_history: unknown;
      quotation_pdf_url: string | null;
      payment_terms: string | null;
      port_of_destination: string | null;
      expires_at: Date;
      notes: string | null;
      created_at: Date;
      product: { name: string };
      buyer: { id: string; email: string; display_name: string | null; company: { name: string } | null };
      seller: { email: string; display_name: string | null; company: { name: string } | null };
    }>
  >(
    `
      SELECT
        i."id",
        i."quantity",
        i."target_price",
        i."status"::text AS "status",
        ${quotedPrice} AS "quoted_price",
        ${quotedQuantity} AS "quoted_quantity",
        ${quotationNotes} AS "quotation_notes",
        ${quotationVersion} AS "quotation_version",
        NULL::jsonb AS "quotation_history",
        i."quotation_pdf_url",
        i."payment_terms",
        i."port_of_destination",
        i."expires_at",
        i."notes",
        i."created_at",
        jsonb_build_object('name', p."name") AS "product",
        jsonb_build_object(
          'id', b."id",
          'email', b."email",
          'display_name', b."display_name",
          'company', CASE WHEN bc."name" IS NULL THEN NULL ELSE jsonb_build_object('name', bc."name") END
        ) AS "buyer",
        jsonb_build_object(
          'email', s."email",
          'display_name', s."display_name",
          'company', CASE WHEN sc."name" IS NULL THEN NULL ELSE jsonb_build_object('name', sc."name") END
        ) AS "seller"
      FROM "Inquiry" i
      INNER JOIN "Product" p ON p."id" = i."product_id"
      INNER JOIN "User" b ON b."id" = i."buyer_id"
      LEFT JOIN "CompanyProfile" bc ON bc."user_id" = b."id"
      INNER JOIN "User" s ON s."id" = i."seller_id"
      LEFT JOIN "CompanyProfile" sc ON sc."user_id" = s."id"
      WHERE ${mode === "received" ? `i."seller_id" = $1::uuid` : `i."buyer_id" = $1::uuid`}
      ORDER BY i."created_at" DESC
      LIMIT 100
    `,
    userId,
  );
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeModuleAccess(session.user.id);

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") ?? "sent";
    const items = await listInquiriesForUser(
      session.user.id,
      mode === "received" ? "received" : "sent",
    );

    return ok(items);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    await assertTradeModuleAccess(session.user.id);

    const body = createInquirySchema.parse(await req.json());
    const product = await prisma.product.findFirst({
      where: { id: body.product_id, deleted_at: null, status: "published" },
      select: { id: true, seller_id: true },
    });

    if (!product) throw new ApiError("RESOURCE_NOT_FOUND", "Product not found");
    if (product.seller_id === session.user.id) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Cannot inquire your own product");
    }

    const inquiryColumns = await getInquiryColumnSupport();
    const inquiryId = crypto.randomUUID();
    const nextExpiresAt = expiresAt(body.expires_in_days);
    const inquiryIdRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `
        INSERT INTO "Inquiry" (
          "id",
          "buyer_id",
          "seller_id",
          "product_id",
          "quantity",
          "target_price",
          "delivery_terms",
          "port_of_destination",
          "payment_terms",
          "notes",
          "status",
          "expires_at"
          ,
          "updated_at"
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          'sent'::"InquiryStatus",
          $11,
          CURRENT_TIMESTAMP
        )
        RETURNING "id"
      `,
      inquiryId,
      session.user.id,
      product.seller_id,
      product.id,
      body.quantity,
      body.target_price ?? null,
      body.delivery_terms ?? null,
      body.port_of_destination ?? null,
      body.payment_terms ?? null,
      body.notes ?? null,
      nextExpiresAt,
    );
    const createdInquiryId = inquiryIdRows[0]?.id;
    if (!createdInquiryId) {
      throw new ApiError("INTERNAL_ERROR", "Failed to create inquiry");
    }

    if (inquiryColumns.quoted_quantity) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Inquiry" SET "quoted_quantity" = $2, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $1::uuid`,
          createdInquiryId,
          body.quantity,
        );
      } catch (error) {
        console.error("[trade:inquiry quoted_quantity sync failed]", createdInquiryId, error);
      }
    }

    const [seller, buyer, productInfo] = await Promise.all([
      prisma.user.findUnique({
        where: { id: product.seller_id },
        select: {
          email: true,
          display_name: true,
          company: { select: { name: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          email: true,
          display_name: true,
          company: { select: { name: true } },
        },
      }),
      prisma.product.findUnique({
        where: { id: product.id },
        select: { name: true },
      }),
    ]);

    if (seller?.email && buyer && productInfo) {
      console.info("[trade:inquiry notify]", {
        inquiry_id: createdInquiryId,
        seller_email: seller.email,
        product: productInfo.name,
        buyer: buyer.company?.name ?? buyer.display_name ?? buyer.email,
      });
    }

    return ok({
      id: createdInquiryId,
      product_id: product.id,
      quantity: body.quantity,
      status: "sent",
    });
  } catch (err) {
    return handleError(err);
  }
}
