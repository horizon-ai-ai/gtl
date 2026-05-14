export type AdminCopilotToolName =
  | "get_daily_briefing"
  | "get_order_summary"
  | "get_support_summary"
  | "get_trade_summary"
  | "get_analytics_summary"
  | "get_analytics_dashboard_detail"
  | "get_upgrade_candidates"
  | "get_user_summary";

export type PlannedTool = {
  name: AdminCopilotToolName;
  reason: string;
};

export const ADMIN_COPILOT_TOOLS: Array<{
  name: AdminCopilotToolName;
  description: string;
}> = [
  { name: "get_daily_briefing", description: "整體營運摘要，包含新用戶、訂單、工單、詢價等高階指標。" },
  { name: "get_order_summary", description: "訂單狀態、GMV、近期訂單與營收結構。" },
  { name: "get_support_summary", description: "客服工單狀態、風險、近期工單與人工處理負載。" },
  { name: "get_trade_summary", description: "trade 商品、詢價、近期成交線索與詢價狀態。" },
  { name: "get_analytics_summary", description: "GA/analytics 連線、最近同步、insights 與 analytics tool 使用概況。" },
  { name: "get_analytics_dashboard_detail", description: "GA dashboard 明細，包含 overview、sources、top pages、conversions。" },
  { name: "get_upgrade_candidates", description: "可能升級方案的用戶名單與使用跡象。" },
  { name: "get_user_summary", description: "針對指定 email 或特定用戶做整體摘要。" },
];

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

export function fallbackPlanAdminCopilotTools(query: string): PlannedTool[] {
  const normalized = query.toLowerCase();
  const plan: PlannedTool[] = [];

  if (hasAny(normalized, ["今日", "今天", "daily", "摘要", "總覽", "overview", "brief"])) {
    plan.push({ name: "get_daily_briefing", reason: "使用者想看後台整體營運摘要" });
  }
  if (hasAny(normalized, ["訂單", "gmv", "營收", "revenue", "order"])) {
    plan.push({ name: "get_order_summary", reason: "問題涉及訂單、營收或 GMV" });
  }
  if (hasAny(normalized, ["工單", "客服", "support", "ticket", "人工"])) {
    plan.push({ name: "get_support_summary", reason: "問題涉及工單處理與客服風險" });
  }
  if (hasAny(normalized, ["貿易", "trade", "詢價", "inquiry", "商品"])) {
    plan.push({ name: "get_trade_summary", reason: "問題涉及 trade 模組、商品或詢價" });
  }
  if (hasAny(normalized, ["流量", "analytics", "ga", "ga4", "來源", "轉換", "traffic", "channel", "page"])) {
    plan.push({ name: "get_analytics_summary", reason: "問題涉及流量、GA、來源或轉換分析" });
    plan.push({ name: "get_analytics_dashboard_detail", reason: "需要 dashboard 層級的來源、頁面與轉換明細" });
  }
  if (hasAny(normalized, ["升級", "方案", "付費", "upgrade", "plan", "arpu"])) {
    plan.push({ name: "get_upgrade_candidates", reason: "問題涉及升級機會或付費策略" });
  }
  if (hasAny(normalized, ["用戶", "使用者", "user", "@"])) {
    plan.push({ name: "get_user_summary", reason: "問題涉及特定用戶或用戶整體狀態" });
  }

  if (plan.length === 0) {
    return [
      { name: "get_daily_briefing", reason: "預設提供整體營運摘要" },
      { name: "get_support_summary", reason: "預設補充客服風險" },
      { name: "get_trade_summary", reason: "預設補充 trade 狀態" },
      { name: "get_analytics_summary", reason: "預設補充流量與 analytics 連線狀態" },
    ];
  }

  return Array.from(new Map(plan.map((item) => [item.name, item])).values());
}

export function buildPlanningPrompt(query: string) {
  return [
    "你是 Admin Copilot 的 tool planner。",
    "你的任務是根據管理員問題，從可用工具中挑選最需要的 1 到 4 個。",
    "只能回傳 JSON，不要輸出 markdown，不要解釋。",
    '格式必須是：{"tools":[{"name":"tool_name","reason":"原因"}]}',
    "若沒有完全對應的工具，請選最接近的工具。",
    "",
    "可用工具：",
    ...ADMIN_COPILOT_TOOLS.map((tool) => `- ${tool.name}: ${tool.description}`),
    "",
    `管理員問題：${query}`,
  ].join("\n");
}

export function parsePlannedTools(raw: string): PlannedTool[] {
  try {
    const json = JSON.parse(raw) as { tools?: Array<{ name?: string; reason?: string }> };
    if (!Array.isArray(json.tools)) return [];
    const validNames = new Set(ADMIN_COPILOT_TOOLS.map((tool) => tool.name));
    return json.tools
      .filter((tool): tool is { name: AdminCopilotToolName; reason?: string } => Boolean(tool.name && validNames.has(tool.name as AdminCopilotToolName)))
      .slice(0, 4)
      .map((tool) => ({
        name: tool.name,
        reason: tool.reason?.trim() || "LLM 判定此工具與問題最相關",
      }));
  } catch {
    return [];
  }
}
