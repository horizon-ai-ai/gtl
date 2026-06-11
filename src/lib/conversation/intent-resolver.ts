import { DesignTaskType } from "@prisma/client";
import { flexionComplete, pickModel, type FlexionRequest } from "@/lib/flexion";

export type UserActionIntent = "ask" | "refine" | "create_new" | "generate" | "cancel" | "chitchat";
export type AssetFamily = "visual" | "text" | "video" | "ad_production" | null;

export type UserIntentResult = {
  action: UserActionIntent;
  taskType: DesignTaskType | null;
  assetFamily: AssetFamily;
  wantsGeneration: boolean;
  outputCount: number | null;
  confidence: number;
  reasoning: string;
};

type InferUserIntentParams = {
  userMessage: string;
  recentTurns?: Array<{ role: "user" | "assistant"; content: string }>;
  activeTaskType?: string | null;
  quickReplyAction?: string | null;
  model?: string | null;
  providerConfig?: FlexionRequest["providerConfig"];
};

const ACTIONS: UserActionIntent[] = ["ask", "refine", "create_new", "generate", "cancel", "chitchat"];
const ASSET_FAMILIES: Array<Exclude<AssetFamily, null>> = ["visual", "text", "video", "ad_production"];
const TASK_TYPES = Object.values(DesignTaskType);
const cache = new Map<string, { expiresAt: number; value: UserIntentResult }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map((item) => stableJson(item)).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item)).join(",") + "}";
}

function clamp01(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function safeJson(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  const withoutFence =
    trimmed.startsWith("```json")
      ? trimmed.slice("```json".length).trim()
      : trimmed.startsWith("```")
        ? trimmed.slice("```".length).trim()
        : trimmed;
  const unfenced = withoutFence.endsWith("```")
    ? withoutFence.slice(0, withoutFence.length - "```".length).trim()
    : withoutFence;
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace ? unfenced.slice(firstBrace, lastBrace + 1) : unfenced;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeAction(value: unknown): UserActionIntent {
  return typeof value === "string" && ACTIONS.includes(value as UserActionIntent)
    ? (value as UserActionIntent)
    : "ask";
}

function normalizeAssetFamily(value: unknown): AssetFamily {
  return typeof value === "string" && ASSET_FAMILIES.includes(value as Exclude<AssetFamily, null>)
    ? (value as AssetFamily)
    : null;
}

function normalizeTaskType(value: unknown): DesignTaskType | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return TASK_TYPES.includes(trimmed as DesignTaskType) ? (trimmed as DesignTaskType) : null;
}

function normalizeOutputCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const count = Math.floor(value);
  if (count < 1) return null;
  return Math.min(count, 4);
}

function systemPrompt() {
  return [
    "You are a multilingual intent classifier for a creative and marketing AI assistant.",
    "Interpret by semantics, not by keyword matching.",
    "Return strict JSON only.",
    "",
    "Shape:",
    "{",
    '  "action": "ask" | "refine" | "create_new" | "generate" | "cancel" | "chitchat",',
    '  "taskType": string | null,',
    '  "assetFamily": "visual" | "text" | "video" | "ad_production" | null,',
    '  "wantsGeneration": boolean,',
    '  "outputCount": number | null,',
    '  "confidence": number,',
    '  "reasoning": string',
    "}",
    "",
    "Allowed taskType enum values. Return one of these exact values or null:",
    TASK_TYPES.join(", "),
    "",
    "Task mapping examples:",
    "- logo / logo design / brand mark / wordmark / 商標 / 字標 -> taskType logo, assetFamily visual.",
    "- 品牌識別 / VI / 視覺識別 -> taskType vi, assetFamily visual.",
    "- 一頁式網站 / landing page / 活動頁 / 商品介紹頁 -> taskType landing_page, assetFamily visual.",
    "- 品牌官網 / corporate website -> taskType brand_website, assetFamily visual.",
    "- 電商網站 / ecommerce / shopping page -> taskType ecommerce_website, assetFamily visual.",
    "- SEO article / SEO 文章 / 行銷文章 / 部落格文章 / 長文 -> taskType seo_article, assetFamily text.",
    "- social copy / 社群文案 / IG 貼文 / FB 貼文 / LINE OA 文案 -> taskType social_copy, assetFamily text.",
    "- 年度行銷策略 / marketing plan -> taskType annual_marketing_strategy, assetFamily text.",
    "- 廣告投放策略 / ads strategy -> taskType ads_strategy, assetFamily text.",
    "",
    "Definitions:",
    '- "generate" means the user asks the system to produce or show the deliverable now.',
    '- "create_new" means the user wants to start a task but is still briefing.',
    '- "refine" means the user adjusts an existing task or draft.',
    '- "ask" means exploring, asking, or brainstorming.',
    "",
    "Important:",
    "- If quickReplyAction is proceed_generate, action must be generate and wantsGeneration true.",
    "- If quickReplyAction is choose_direction, the user is selecting a direction/angle, not approving final generation yet. Classify as refine or ask with wantsGeneration false unless the message also explicitly asks to generate now.",
    "- If the user asks to generate/produce/create/show/output a version now, do not keep asking. Classify as generate and wantsGeneration true. Examples: 產生第一版, 生成一版, 直接做第一版, 幫我寫出來, 出三張圖, 生成三張 Logo.",
    "- If the user asks for multiple visual outputs, set outputCount to the requested count, capped at 4. Otherwise outputCount must be null.",
    "- For text deliverables, distinguish advice from delivery: if the user asks the assistant to write, produce, generate, draft, output, or create the actual SEO article, social copy set, ad strategy, marketing plan, report, or other text artifact now, classify as generate, assetFamily text, wantsGeneration true.",
    "- If the user only asks for topic ideas, direction options, research, examples, critique, or what they should prepare next, classify as ask, not generate.",
    "- Task switching is allowed inside one conversation. If activeTaskType is visual but the user asks for a text deliverable, switch to the text taskType; do not refine the visual task. If the user asks to produce the text now, action generate; if they only start briefing, action create_new.",
    "- If activeTaskType is text but the user asks for logo/VI/image/design output, switch to the visual taskType; do not refine the text task. If they ask to produce it now, action generate.",
    "- If an active text task exists and the user supplies missing brief material without asking for the deliverable yet, classify as ask or refine with wantsGeneration false.",
    "- If an active text task exists and the user asks to adjust a previous version, rewrite a section, keep the current structure, make it longer/shorter, or regenerate another version, classify as refine and set wantsGeneration true.",
    "- If there is an active visual task and the user asks to see the actual visual output, classify as generate.",
    "- If there is an active visual task and the user explicitly requests regeneration of an existing draft, classify as refine and set wantsGeneration true because the system must regenerate the visual.",
    "- If there is an active visual task and the user only supplies missing brief material such as brand name, slogan, product name, reference notes, typography preference, colors, layout preference, or icons, classify as refine with wantsGeneration false unless they clearly ask to generate/regenerate/show the output now.",
    "- If the user is only asking for advice or options, classify as ask unless they clearly ask for output now.",
  ].join("\n");
}

export async function inferConversationIntent(params: InferUserIntentParams): Promise<UserIntentResult | null> {
  const message = params.userMessage.trim();
  if (!message) return null;
  const cacheKey = stableJson({
    m: message,
    r: (params.recentTurns ?? []).slice(-4),
    t: params.activeTaskType ?? null,
    q: params.quickReplyAction ?? null,
  });
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const result = await flexionComplete({
      model: params.model || pickModel({ plan: "free", taskHint: "fast" }),
      messages: [
        { role: "system", content: systemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            userMessage: message,
            recentTurns: (params.recentTurns ?? []).slice(-4),
            activeTaskType: params.activeTaskType ?? null,
            quickReplyAction: params.quickReplyAction ?? null,
          }),
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 600,
      providerConfig: params.providerConfig,
    });
    const parsed = safeJson(result.text);
    if (!parsed) return null;
    const action = normalizeAction(parsed.action);
    const intent: UserIntentResult = {
      action,
      taskType: normalizeTaskType(parsed.taskType),
      assetFamily: normalizeAssetFamily(parsed.assetFamily),
      wantsGeneration: parsed.wantsGeneration === true || action === "generate",
      outputCount: normalizeOutputCount(parsed.outputCount),
      confidence: clamp01(parsed.confidence),
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
    cache.set(cacheKey, { value: intent, expiresAt: Date.now() + CACHE_TTL_MS });
    while (cache.size > CACHE_MAX) {
      const first = cache.keys().next().value;
      if (!first) break;
      cache.delete(first);
    }
    return intent;
  } catch (error) {
    console.warn("[intent-resolver] inferConversationIntent failed:", error);
    return null;
  }
}
