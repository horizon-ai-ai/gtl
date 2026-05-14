import { ApiError } from "./api";

export type TradeProductDraft = {
  suggested_name: string;
  suggested_category: string;
  suggested_description: string;
  suggested_hs_code: string | null;
  suggested_origin_country: string | null;
  suggested_unit: string;
  suggested_moq: number;
  suggested_certifications: string[];
  detected_attributes: Record<string, string>;
  confidence: number;
};

const DEFAULT_DRAFT: TradeProductDraft = {
  suggested_name: "未命名商品",
  suggested_category: "Uncategorized",
  suggested_description: "",
  suggested_hs_code: null,
  suggested_origin_country: null,
  suggested_unit: "pcs",
  suggested_moq: 1,
  suggested_certifications: [],
  detected_attributes: {},
  confidence: 0.2,
};

function mimeFromUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function toDataUrl(file: File) {
  const mime = file.type || mimeFromUrl(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseJsonObject(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new ApiError("UPSTREAM_ERROR", "Vision model returned non-JSON draft");
  }
  return JSON.parse(match[0]) as Record<string, unknown>;
}

function normalizeDraft(raw: Record<string, unknown>): TradeProductDraft {
  const attributes =
    raw.detected_attributes && typeof raw.detected_attributes === "object" && !Array.isArray(raw.detected_attributes)
      ? Object.fromEntries(
          Object.entries(raw.detected_attributes as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" && value.trim())
            .map(([key, value]) => [key, String(value).trim()]),
        )
      : {};

  return {
    suggested_name: cleanText(raw.suggested_name, DEFAULT_DRAFT.suggested_name),
    suggested_category: cleanText(raw.suggested_category, DEFAULT_DRAFT.suggested_category),
    suggested_description: cleanText(raw.suggested_description, DEFAULT_DRAFT.suggested_description),
    suggested_hs_code: cleanText(raw.suggested_hs_code, "") || null,
    suggested_origin_country: cleanText(raw.suggested_origin_country, "") || null,
    suggested_unit: cleanText(raw.suggested_unit, DEFAULT_DRAFT.suggested_unit),
    suggested_moq:
      typeof raw.suggested_moq === "number" && Number.isFinite(raw.suggested_moq) && raw.suggested_moq > 0
        ? Math.floor(raw.suggested_moq)
        : DEFAULT_DRAFT.suggested_moq,
    suggested_certifications: Array.isArray(raw.suggested_certifications)
      ? raw.suggested_certifications
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .slice(0, 10)
      : [],
    detected_attributes: attributes,
    confidence:
      typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
        ? Math.max(0, Math.min(1, raw.confidence))
        : DEFAULT_DRAFT.confidence,
  };
}

export async function createTradeProductDraftFromImages(files: File[]) {
  if (files.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "At least one image is required");
  }

  const baseUrl = process.env.FLEXION_API_BASE_URL ?? "";
  const apiKey = process.env.FLEXION_API_KEY ?? "";
  const model = process.env.TRADE_VISION_MODEL?.trim() || "kimi-k2.5";

  if (!apiKey || !baseUrl || !baseUrl.includes("moonshot")) {
    return {
      ...DEFAULT_DRAFT,
      suggested_name: cleanText(files[0]?.name.replace(/\.[^.]+$/, ""), "未命名商品"),
      suggested_description: "尚未設定 Moonshot vision，這是依檔名建立的商品草稿。",
      detected_attributes: { source: "fallback" },
    };
  }

  const imageParts = await Promise.all(
    files.slice(0, 3).map(async (file) => ({
      type: "image_url",
      image_url: { url: await toDataUrl(file) },
    })),
  );

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Tenant-Id": "marketing-ai-platform",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "你是 B2B 貿易商品建檔助理。請根據圖片辨識商品，並只輸出 JSON 物件，不要輸出 markdown 或解釋。JSON keys 必須是 suggested_name, suggested_category, suggested_description, suggested_hs_code, suggested_origin_country, suggested_unit, suggested_moq, suggested_certifications, detected_attributes, confidence。",
        },
        {
          role: "user",
          content: [
            ...imageParts,
            {
              type: "text",
              text:
                "請辨識這是什麼 B2B 商品，為台灣中小企業建立上架草稿。描述請用繁體中文，類別請用英文可讀類別名。若無法判斷 HS code 或產地，可填 null。detected_attributes 請整理材質、外觀、用途、尺寸/規格等明顯特徵。",
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      stream: false,
    }),
  });

  if (!res.ok) {
    throw new ApiError("UPSTREAM_ERROR", `Vision draft failed: ${res.status}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new ApiError("UPSTREAM_ERROR", "Vision draft response was empty");
  }

  return normalizeDraft(parseJsonObject(content));
}
