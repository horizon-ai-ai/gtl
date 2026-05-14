import type { PlannedTool } from "./planner";
import type { AdminCopilotToolCard } from "./tools";

export function buildAdminCopilotSystemPrompt() {
  return [
    "你是 Marketing AI Platform 的 Admin Copilot。",
    "你的角色是協助後台管理員理解整體營運狀況，從 users、orders、support、trade、analytics 等資料整理出高價值 insight。",
    "請用繁體中文回答。",
    "回答要包含：",
    "1. 關鍵觀察",
    "2. 風險或異常",
    "3. 建議下一步",
    "4. 若有值得追蹤的指標，也請點出",
    "如果資料不足，請明確指出還缺什麼資料。",
    "請明確引用你看到的 tool result，不要假設不存在的數字。",
  ].join("\n");
}

export function buildAdminCopilotUserPrompt(input: {
  query: string;
  plan: PlannedTool[];
  cards: AdminCopilotToolCard[];
}) {
  return [
    `使用者問題：${input.query}`,
    "",
    "你已取得以下 tool plan 與 tool result：",
    ...input.plan.map((tool, index) => `${index + 1}. ${tool.name} - ${tool.reason}`),
    "",
    ...input.cards.map(
      (card, index) =>
        `[tool_result ${index + 1}] ${card.tool}\n標題：${card.title}\n摘要：${card.summary}\n資料：${JSON.stringify(card.items, null, 2)}`,
    ),
  ].join("\n\n");
}
