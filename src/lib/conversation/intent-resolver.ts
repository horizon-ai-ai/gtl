import type { DesignTaskType } from "@prisma/client";
import { flexionComplete, pickModel, type FlexionRequest } from "@/lib/flexion";

export type UserActionIntent = "ask" | "refine" | "create_new" | "generate" | "cancel" | "chitchat";
export type AssetFamily = "visual" | "text" | "video" | "ad_production" | null;

export type UserIntentResult = {
  action: UserActionIntent;
  taskType: DesignTaskType | null;
  assetFamily: AssetFamily;
  wantsGeneration: boolean;
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
  return trimmed as DesignTaskType;
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
    '  "confidence": number,',
    '  "reasoning": string',
    "}",
    "",
    "Definitions:",
    '- "generate" means the user asks the system to produce or show the deliverable now.',
    '- "create_new" means the user wants to start a task but is still briefing.',
    '- "refine" means the user adjusts an existing task or draft.',
    '- "ask" means exploring, asking, or brainstorming.',
    "",
    "Important:",
    "- If quickReplyAction is proceed_generate, action must be generate and wantsGeneration true.",
    "- If there is an active visual task and the user asks to see the actual visual output, classify as generate.",
    "- If there is an active visual task and the user requests changes to an existing draft, classify as refine and set wantsGeneration true because the system must regenerate the visual.",
    "- If the user mentions changing brand text, typography, colors, layout, icons, or preserving an existing visual direction for an active visual task, classify as refine and set wantsGeneration true.",
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
      providerConfig: params.providerConfig,
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
    });
    const parsed = safeJson(result.text);
    if (!parsed) return null;
    const action = normalizeAction(parsed.action);
    const intent: UserIntentResult = {
      action,
      taskType: normalizeTaskType(parsed.taskType),
      assetFamily: normalizeAssetFamily(parsed.assetFamily),
      wantsGeneration: parsed.wantsGeneration === true || action === "generate",
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
