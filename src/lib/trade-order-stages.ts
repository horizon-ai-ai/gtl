/**
 * Trade order display stages (spec §Phase 9 — dev spec v0.2.0).
 *
 * Maps the business-owner's 10-step header (Image 1) onto the data we
 * actually persist. Stages 1–3 derive purely from the order's status,
 * stages 4–9 from `metadata.lifecycle_stage` (set by the advance API).
 */

import { DEFAULT_TRADE_LIFECYCLE_RULES } from "./trade-lifecycle";

export type TradeStageState = "done" | "active" | "pending";

export type TradeStage = {
  /** Stable key used by the advance API. The first three are derived; the rest are lifecycle rules. */
  key:
    | "quotation_sent"
    | "quotation_read"
    | "order_created"
    | "order_confirmed"
    | "processing"
    | "shipped"
    | "in_transit"
    | "arrived_warehouse"
    | "stocked_inbound";
  label: string;
  state: TradeStageState;
  /** True when this stage falls inside the persistable lifecycle (stages 4–9). */
  advanceable: boolean;
};

/**
 * Ordered key list — the 9 stages shown to customers. (The business-owner
 * mock shows 10 including a "船運入倉" duplicate, which we collapse here
 * since stocked_inbound already represents arrival at the bonded warehouse.)
 */
export const TRADE_STAGE_KEYS: TradeStage["key"][] = [
  "quotation_sent",
  "quotation_read",
  "order_created",
  "order_confirmed",
  "processing",
  "shipped",
  "in_transit",
  "arrived_warehouse",
  "stocked_inbound",
];

const STAGE_LABELS: Record<TradeStage["key"], string> = {
  quotation_sent: "報價單已寄出",
  quotation_read: "買家已傳送讀取回條",
  order_created: "訂單已成立",
  order_confirmed: "訂單確認",
  processing: "廠商理貨中",
  shipped: "出貨",
  in_transit: "配送中",
  arrived_warehouse: "抵達倉庫",
  stocked_inbound: "船運入倉",
};

const ADVANCEABLE_KEYS = new Set<TradeStage["key"]>(
  DEFAULT_TRADE_LIFECYCLE_RULES.map((r) => r.stage_key as TradeStage["key"]),
);

/**
 * Compute the display stages for a single trade order.
 *
 * Promotion rules:
 * - quotation_sent: always done (the inquiry/quotation predates the order)
 * - quotation_read: done iff status is past 'draft' (i.e. quote_pending or later)
 * - order_created: done iff status is past 'quote_pending'
 * - order_confirmed..stocked_inbound: done iff metadata.lifecycle_stage is at or
 *   past this key in TRADE_STAGE_KEYS order
 * - The first non-done stage gets state='active'; everything after is 'pending'.
 */
export function deriveTradeStages(input: {
  status: string;
  metadata: unknown;
}): TradeStage[] {
  const meta =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, unknown>)
      : {};
  const lifecycleStage = typeof meta.lifecycle_stage === "string" ? (meta.lifecycle_stage as TradeStage["key"]) : null;

  const isPastDraft = input.status !== "draft";
  const isPastQuotePending = !["draft", "quote_pending"].includes(input.status);

  const lifecycleIndex = lifecycleStage ? TRADE_STAGE_KEYS.indexOf(lifecycleStage) : -1;

  const stages: TradeStage[] = TRADE_STAGE_KEYS.map((key) => ({
    key,
    label: STAGE_LABELS[key],
    state: "pending" as TradeStageState,
    advanceable: ADVANCEABLE_KEYS.has(key),
  }));

  // Stages 1-3: pre-lifecycle (status-driven)
  stages[0].state = "done"; // quotation_sent
  if (isPastDraft) stages[1].state = "done"; // quotation_read
  if (isPastQuotePending) stages[2].state = "done"; // order_created

  // Stages 4-9: lifecycle metadata-driven
  if (lifecycleIndex >= 0) {
    for (let i = 3; i <= lifecycleIndex; i += 1) {
      stages[i].state = "done";
    }
  }

  // First non-done -> active
  for (let i = 0; i < stages.length; i += 1) {
    if (stages[i].state !== "done") {
      stages[i].state = "active";
      break;
    }
  }

  return stages;
}

/**
 * Given current stages, what is the next advanceable stage (or null if at end)?
 * Used by the advance API and the admin "推進到下一階段" button.
 */
export function nextAdvanceableStage(stages: TradeStage[]): TradeStage | null {
  for (const s of stages) {
    if (s.state === "active" && s.advanceable) return s;
  }
  return null;
}
