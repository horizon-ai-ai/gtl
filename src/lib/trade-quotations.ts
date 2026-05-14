import { prisma } from "@/lib/db";

export type TradeQuotationRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  product_name: string;
  buyer_name: string;
  buyer_email: string;
  seller_name: string;
  seller_email: string;
  quantity: number;
  target_price: number | null;
  quoted_price: number | null;
  quoted_quantity: number | null;
  quotation_notes: string | null;
  quotation_version: number;
  status: string;
  updated_at: Date;
};

export type InquiryColumnSupport = {
  quoted_price: boolean;
  quoted_quantity: boolean;
  quotation_notes: boolean;
  quotation_version: boolean;
};

let inquiryColumnSupportPromise: Promise<InquiryColumnSupport> | null = null;

export async function getInquiryColumnSupport(): Promise<InquiryColumnSupport> {
  inquiryColumnSupportPromise ??= prisma
    .$queryRawUnsafe<{ column_name: string }[]>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Inquiry'
          AND column_name IN ('quoted_price', 'quoted_quantity', 'quotation_notes', 'quotation_version')
      `,
    )
    .then((rows) => {
      const set = new Set(rows.map((row) => row.column_name));
      return {
        quoted_price: set.has("quoted_price"),
        quoted_quantity: set.has("quoted_quantity"),
        quotation_notes: set.has("quotation_notes"),
        quotation_version: set.has("quotation_version"),
      };
    });

  return inquiryColumnSupportPromise;
}

function quotationSelects(columns: InquiryColumnSupport) {
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
  const hasQuotation = [
    columns.quotation_version ? `i."quotation_version" > 0` : null,
    columns.quoted_price ? `i."quoted_price" IS NOT NULL` : null,
    columns.quotation_notes ? `COALESCE(i."quotation_notes", '') <> ''` : null,
  ]
    .filter(Boolean)
    .join(" OR ");

  return {
    quotedPrice,
    quotedQuantity,
    quotationNotes,
    quotationVersion,
    hasQuotation: hasQuotation || "false",
  };
}

export async function listSellerQuotationRows(sellerId: string) {
  const columns = await getInquiryColumnSupport();
  const q = quotationSelects(columns);
  return prisma.$queryRawUnsafe<TradeQuotationRow[]>(
    `
      SELECT
        i."id",
        i."buyer_id",
        i."seller_id",
        i."product_id",
        p."name" AS "product_name",
        COALESCE(bc."name", b."display_name", b."email") AS "buyer_name",
        b."email" AS "buyer_email",
        COALESCE(sc."name", s."display_name", s."email") AS "seller_name",
        s."email" AS "seller_email",
        i."quantity",
        i."target_price",
        ${q.quotedPrice} AS "quoted_price",
        ${q.quotedQuantity} AS "quoted_quantity",
        ${q.quotationNotes} AS "quotation_notes",
        ${q.quotationVersion} AS "quotation_version",
        i."status"::text AS "status",
        i."updated_at"
      FROM "Inquiry" i
      INNER JOIN "Product" p ON p."id" = i."product_id"
      INNER JOIN "User" b ON b."id" = i."buyer_id"
      LEFT JOIN "CompanyProfile" bc ON bc."user_id" = b."id"
      INNER JOIN "User" s ON s."id" = i."seller_id"
      LEFT JOIN "CompanyProfile" sc ON sc."user_id" = s."id"
      WHERE i."seller_id" = $1::uuid
        AND (${q.hasQuotation} OR i."status"::text IN ('sent','replied','negotiating','closed'))
      ORDER BY i."updated_at" DESC
      LIMIT 100
    `,
    sellerId,
  );
}

export async function listBuyerQuotationRows(buyerId: string) {
  const columns = await getInquiryColumnSupport();
  const q = quotationSelects(columns);
  return prisma.$queryRawUnsafe<TradeQuotationRow[]>(
    `
      SELECT
        i."id",
        i."buyer_id",
        i."seller_id",
        i."product_id",
        p."name" AS "product_name",
        COALESCE(bc."name", b."display_name", b."email") AS "buyer_name",
        b."email" AS "buyer_email",
        COALESCE(sc."name", s."display_name", s."email") AS "seller_name",
        s."email" AS "seller_email",
        i."quantity",
        i."target_price",
        ${q.quotedPrice} AS "quoted_price",
        ${q.quotedQuantity} AS "quoted_quantity",
        ${q.quotationNotes} AS "quotation_notes",
        ${q.quotationVersion} AS "quotation_version",
        i."status"::text AS "status",
        i."updated_at"
      FROM "Inquiry" i
      INNER JOIN "Product" p ON p."id" = i."product_id"
      INNER JOIN "User" b ON b."id" = i."buyer_id"
      LEFT JOIN "CompanyProfile" bc ON bc."user_id" = b."id"
      INNER JOIN "User" s ON s."id" = i."seller_id"
      LEFT JOIN "CompanyProfile" sc ON sc."user_id" = s."id"
      WHERE i."buyer_id" = $1::uuid
        AND (${q.hasQuotation})
      ORDER BY i."updated_at" DESC
      LIMIT 100
    `,
    buyerId,
  );
}

export async function listAdminQuotationRows() {
  const columns = await getInquiryColumnSupport();
  const q = quotationSelects(columns);
  return prisma.$queryRawUnsafe<TradeQuotationRow[]>(
    `
      SELECT
        i."id",
        i."buyer_id",
        i."seller_id",
        i."product_id",
        p."name" AS "product_name",
        COALESCE(bc."name", b."display_name", b."email") AS "buyer_name",
        b."email" AS "buyer_email",
        COALESCE(sc."name", s."display_name", s."email") AS "seller_name",
        s."email" AS "seller_email",
        i."quantity",
        i."target_price",
        ${q.quotedPrice} AS "quoted_price",
        ${q.quotedQuantity} AS "quoted_quantity",
        ${q.quotationNotes} AS "quotation_notes",
        ${q.quotationVersion} AS "quotation_version",
        i."status"::text AS "status",
        i."updated_at"
      FROM "Inquiry" i
      INNER JOIN "Product" p ON p."id" = i."product_id"
      INNER JOIN "User" b ON b."id" = i."buyer_id"
      LEFT JOIN "CompanyProfile" bc ON bc."user_id" = b."id"
      INNER JOIN "User" s ON s."id" = i."seller_id"
      LEFT JOIN "CompanyProfile" sc ON sc."user_id" = s."id"
      WHERE (${q.hasQuotation})
      ORDER BY i."updated_at" DESC
      LIMIT 100
    `,
  );
}

export async function getTradeOperationSummary() {
  const columns = await getInquiryColumnSupport();
  const q = quotationSelects(columns);
  const [quotationStats, latestQuotations, latestTradeOrders] = await Promise.all([
    prisma.$queryRawUnsafe<
      { quotation_count: number; negotiating_count: number }[]
    >(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE ${q.hasQuotation}
          )::int AS "quotation_count",
          COUNT(*) FILTER (WHERE "status"::text = 'negotiating')::int AS "negotiating_count"
        FROM "Inquiry"
      `,
    ),
    prisma.$queryRawUnsafe<TradeQuotationRow[]>(
      `
        SELECT
          i."id",
          i."buyer_id",
          i."seller_id",
          i."product_id",
          p."name" AS "product_name",
          COALESCE(bc."name", b."display_name", b."email") AS "buyer_name",
          b."email" AS "buyer_email",
          COALESCE(sc."name", s."display_name", s."email") AS "seller_name",
          s."email" AS "seller_email",
          i."quantity",
          i."target_price",
          ${q.quotedPrice} AS "quoted_price",
          ${q.quotedQuantity} AS "quoted_quantity",
          ${q.quotationNotes} AS "quotation_notes",
          ${q.quotationVersion} AS "quotation_version",
          i."status"::text AS "status",
          i."updated_at"
        FROM "Inquiry" i
        INNER JOIN "Product" p ON p."id" = i."product_id"
        INNER JOIN "User" b ON b."id" = i."buyer_id"
        LEFT JOIN "CompanyProfile" bc ON bc."user_id" = b."id"
        INNER JOIN "User" s ON s."id" = i."seller_id"
        LEFT JOIN "CompanyProfile" sc ON sc."user_id" = s."id"
        WHERE (${q.hasQuotation})
        ORDER BY i."updated_at" DESC
        LIMIT 8
      `,
    ),
    prisma.order.findMany({
      where: { metadata: { path: ["source"], equals: "trade_inquiry" }, deleted_at: null },
      include: { user: { include: { company: true } } },
      orderBy: { created_at: "desc" },
      take: 8,
    }),
  ]);

  return {
    quotationCount: quotationStats[0]?.quotation_count ?? 0,
    negotiatingCount: quotationStats[0]?.negotiating_count ?? 0,
    latestQuotations,
    latestTradeOrders,
  };
}
