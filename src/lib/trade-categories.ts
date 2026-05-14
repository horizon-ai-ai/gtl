import { prisma } from "@/lib/db";

export type TradeCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

const DEFAULT_TRADE_CATEGORIES = [
  { name: "食品", slug: "food", sort_order: 0 },
  { name: "美妝", slug: "beauty", sort_order: 1 },
  { name: "雜貨", slug: "general", sort_order: 2 },
  { name: "電器", slug: "electronics", sort_order: 3 },
  { name: "其他", slug: "other", sort_order: 4 },
];

export async function ensureTradeCategoryTable() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TradeCategory" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" TEXT NOT NULL,
      "slug" TEXT NOT NULL UNIQUE,
      "sort_order" INTEGER NOT NULL DEFAULT 0,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const category of DEFAULT_TRADE_CATEGORIES) {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "TradeCategory" ("name", "slug", "sort_order", "active")
        VALUES ($1, $2, $3, true)
        ON CONFLICT ("slug") DO UPDATE
        SET "name" = EXCLUDED."name",
            "sort_order" = EXCLUDED."sort_order";
      `,
      category.name,
      category.slug,
      category.sort_order,
    );
  }
}

export async function listTradeCategories(activeOnly = false) {
  await ensureTradeCategoryTable();
  const rows = await prisma.$queryRawUnsafe<TradeCategoryRecord[]>(
    `
      SELECT "id", "name", "slug", "sort_order", "active", "created_at", "updated_at"
      FROM "TradeCategory"
      ${activeOnly ? 'WHERE "active" = true' : ""}
      ORDER BY "sort_order" ASC, "created_at" ASC
    `,
  );
  return rows;
}

export async function createTradeCategory(name: string, slug: string, sortOrder: number) {
  await ensureTradeCategoryTable();
  const rows = await prisma.$queryRawUnsafe<TradeCategoryRecord[]>(
    `
      INSERT INTO "TradeCategory" ("name", "slug", "sort_order", "active")
      VALUES ($1, $2, $3, true)
      RETURNING "id", "name", "slug", "sort_order", "active", "created_at", "updated_at"
    `,
    name,
    slug,
    sortOrder,
  );
  return rows[0] ?? null;
}

export async function updateTradeCategory(id: string, name: string, slug: string, sortOrder: number, active: boolean) {
  await ensureTradeCategoryTable();
  const rows = await prisma.$queryRawUnsafe<TradeCategoryRecord[]>(
    `
      UPDATE "TradeCategory"
      SET "name" = $2,
          "slug" = $3,
          "sort_order" = $4,
          "active" = $5,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = $1
      RETURNING "id", "name", "slug", "sort_order", "active", "created_at", "updated_at"
    `,
    id,
    name,
    slug,
    sortOrder,
    active,
  );
  return rows[0] ?? null;
}

export async function deleteTradeCategory(id: string) {
  await ensureTradeCategoryTable();
  await prisma.$executeRawUnsafe(`DELETE FROM "TradeCategory" WHERE "id" = $1`, id);
}

export async function getActiveTradeCategories() {
  return listTradeCategories(true);
}

export function normalizeTradeCategoryName(input: string, categoryNames: string[]) {
  const value = input.trim();
  if (!value) return "其他";
  const matched = categoryNames.find((name) => name.toLowerCase() === value.toLowerCase());
  if (matched) return matched;
  const contains = categoryNames.find((name) => value.includes(name) || name.includes(value));
  return contains ?? "其他";
}
