import { prisma } from "@/lib/db";

export type TradeLifecycleRule = {
  stage_key: string;
  label: string;
  day_offset: number;
  sort_order: number;
  active: boolean;
};

export const DEFAULT_TRADE_LIFECYCLE_RULES: TradeLifecycleRule[] = [
  { stage_key: "order_confirmed", label: "訂單確認", day_offset: 0, sort_order: 0, active: true },
  { stage_key: "processing", label: "理貨中", day_offset: 3, sort_order: 1, active: true },
  { stage_key: "shipped", label: "出貨", day_offset: 7, sort_order: 2, active: true },
  { stage_key: "in_transit", label: "配送中", day_offset: 10, sort_order: 3, active: true },
  { stage_key: "arrived_warehouse", label: "抵達倉庫", day_offset: 18, sort_order: 4, active: true },
  { stage_key: "stocked_inbound", label: "船運入倉", day_offset: 21, sort_order: 5, active: true },
];

export async function ensureTradeLifecycleTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TradeLifecycleRule" (
      "stage_key" TEXT PRIMARY KEY,
      "label" TEXT NOT NULL,
      "day_offset" INTEGER NOT NULL DEFAULT 0,
      "sort_order" INTEGER NOT NULL DEFAULT 0,
      "active" BOOLEAN NOT NULL DEFAULT true
    );
  `);

  for (const rule of DEFAULT_TRADE_LIFECYCLE_RULES) {
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "TradeLifecycleRule" ("stage_key", "label", "day_offset", "sort_order", "active")
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT ("stage_key") DO UPDATE
        SET "label" = EXCLUDED."label"
      `,
      rule.stage_key,
      rule.label,
      rule.day_offset,
      rule.sort_order,
      rule.active,
    );
  }
}

export async function listTradeLifecycleRules() {
  await ensureTradeLifecycleTable();
  return prisma.$queryRawUnsafe<TradeLifecycleRule[]>(
    `SELECT "stage_key", "label", "day_offset", "sort_order", "active"
     FROM "TradeLifecycleRule"
     ORDER BY "sort_order" ASC`,
  );
}

export async function updateTradeLifecycleRule(stageKey: string, dayOffset: number, active: boolean) {
  await ensureTradeLifecycleTable();
  await prisma.$executeRawUnsafe(
    `UPDATE "TradeLifecycleRule"
     SET "day_offset" = $2, "active" = $3
     WHERE "stage_key" = $1`,
    stageKey,
    dayOffset,
    active,
  );
}

export function buildTradeLifecycleTimeline(createdAt: Date | string, rules: TradeLifecycleRule[]) {
  const base = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return rules
    .filter((rule) => rule.active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((rule) => ({
      ...rule,
      estimated_at: new Date(base.getTime() + rule.day_offset * 24 * 60 * 60 * 1000),
    }));
}
