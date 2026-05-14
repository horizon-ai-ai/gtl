export type SuggestedOrderItem = {
  name: string;
  quantity: number;
  unit: string;
  hint?: string;
};

export type RecommendedAction = "create_order_draft" | "handoff_to_human";

const ORDER_HINTS = [
  "報價",
  "下單",
  "訂單",
  "購買",
  "採購",
  "交期",
  "付款",
  "出貨",
  "數量",
  "規格",
  "合約",
];

const HUMAN_HINTS = [
  "人工",
  "真人",
  "業務",
  "客服",
  "專人",
  "聯絡我",
  "跟進",
  "電話",
  "回電",
];

const ITEM_PATTERNS = [
  /(?:商品|產品|品項|項目)[：:\s]*([^\n，,。]+)/g,
  /([A-Za-z0-9\u4e00-\u9fa5\-_/]{2,40})[，,\s]*數量[：:\s]*(\d+)/g,
  /MOQ[：:\s]*(\d+)[\s]*([A-Za-z\u4e00-\u9fa5]+)?/gi,
];

export function detectRecommendedActions(text: string): RecommendedAction[] {
  const actions = new Set<RecommendedAction>();
  if (ORDER_HINTS.some((hint) => text.includes(hint))) actions.add("create_order_draft");
  if (HUMAN_HINTS.some((hint) => text.includes(hint))) actions.add("handoff_to_human");
  return Array.from(actions);
}

export function extractSuggestedItems(text: string): SuggestedOrderItem[] {
  const items: SuggestedOrderItem[] = [];
  const seen = new Set<string>();

  for (const pattern of ITEM_PATTERNS) {
    for (const match of Array.from(text.matchAll(pattern))) {
      const rawName = (match[1] ?? "").trim();
      if (!rawName) continue;
      const name = rawName.replace(/^[\-\*\d.\s]+/, "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const quantity =
        typeof match[2] === "string" && match[2].trim() ? Number.parseInt(match[2], 10) || 1 : 1;
      const unit = typeof match[3] === "string" && match[3].trim() ? match[3].trim() : "件";
      items.push({
        name,
        quantity,
        unit,
        hint: "由 chat 摘要自動拆解",
      });
    }
  }

  if (items.length === 0 && text.trim()) {
    const firstLine = text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length >= 4);
    if (firstLine) {
      items.push({
        name: firstLine.slice(0, 40),
        quantity: 1,
        unit: "案",
        hint: "請手動補完整品項內容",
      });
    }
  }

  return items.slice(0, 5);
}
