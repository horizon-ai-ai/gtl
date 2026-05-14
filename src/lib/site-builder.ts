import { ApiError } from "./api";
import { flexionStream, pickModel } from "./flexion";

export type SitePageSection = {
  type: "hero" | "features" | "cta" | "faq" | "testimonials";
  title?: string;
  body?: string;
  items?: Array<string | { title?: string; body?: string }>;
  button_label?: string;
};

export type SiteSchema = {
  title: string;
  tagline: string;
  primary_color: string;
  seo?: {
    title?: string;
    description?: string;
    og_image?: string;
  };
  integrations?: {
    ga_measurement_id?: string;
    meta_pixel_id?: string;
  };
  sections: SitePageSection[];
};

const FALLBACK_SCHEMA: SiteSchema = {
  title: "Marketing Landing Page",
  tagline: "用 AI 快速建立你的第一個行銷網站",
  primary_color: "#171717",
  seo: {
    title: "Marketing Landing Page",
    description: "用 AI 快速建立你的第一個行銷網站",
  },
  integrations: {},
  sections: [
    { type: "hero", title: "品牌主標題", body: "一句話說明你的產品價值。", button_label: "立即聯絡" },
    { type: "features", title: "核心優勢", items: ["優勢一", "優勢二", "優勢三"] },
    { type: "cta", title: "準備開始了嗎？", body: "留下聯絡方式，安排下一步。", button_label: "免費諮詢" },
  ],
};

function parseSchema(raw: string): SiteSchema {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return FALLBACK_SCHEMA;
  try {
    const json = JSON.parse(match[0]) as SiteSchema;
    return {
      title: json.title || FALLBACK_SCHEMA.title,
      tagline: json.tagline || FALLBACK_SCHEMA.tagline,
      primary_color: json.primary_color || FALLBACK_SCHEMA.primary_color,
      seo:
        json.seo && typeof json.seo === "object"
          ? {
              title: typeof json.seo.title === "string" ? json.seo.title : undefined,
              description: typeof json.seo.description === "string" ? json.seo.description : undefined,
              og_image: typeof json.seo.og_image === "string" ? json.seo.og_image : undefined,
            }
          : FALLBACK_SCHEMA.seo,
      integrations:
        json.integrations && typeof json.integrations === "object"
          ? {
              ga_measurement_id:
                typeof json.integrations.ga_measurement_id === "string"
                  ? json.integrations.ga_measurement_id
                  : undefined,
              meta_pixel_id:
                typeof json.integrations.meta_pixel_id === "string"
                  ? json.integrations.meta_pixel_id
                  : undefined,
            }
          : FALLBACK_SCHEMA.integrations,
      sections: Array.isArray(json.sections) && json.sections.length > 0 ? json.sections : FALLBACK_SCHEMA.sections,
    };
  } catch {
    return FALLBACK_SCHEMA;
  }
}

export async function generateSiteSchema(input: {
  business_name: string;
  industry?: string;
  audience?: string;
  goal?: string;
}) {
  const baseUrl = process.env.FLEXION_API_BASE_URL ?? "";
  const apiKey = process.env.FLEXION_API_KEY ?? "";
  if (!baseUrl || !apiKey) {
    return {
      ...FALLBACK_SCHEMA,
      title: input.business_name || FALLBACK_SCHEMA.title,
    };
  }

  const model = pickModel({ plan: "pro", taskHint: "normal" });
  let text = "";
  try {
    for await (const evt of flexionStream({
      model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "你是網站企劃助理。請只輸出 JSON，格式為 {title, tagline, primary_color, sections:[{type,title,body,items,button_label}] }。",
        },
        {
          role: "user",
          content: `請為以下企業產生單頁式行銷網站草稿：品牌=${input.business_name}; 產業=${input.industry ?? ""}; 目標客群=${input.audience ?? ""}; 主要目標=${input.goal ?? ""}。請使用繁體中文內容。`,
        },
      ],
    })) {
      if (evt.type === "token") {
        text += evt.delta;
      }
    }
  } catch {
    return {
      ...FALLBACK_SCHEMA,
      title: input.business_name || FALLBACK_SCHEMA.title,
    };
  }

  return parseSchema(text);
}

export function slugifySiteName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!slug) throw new ApiError("VALIDATION_ERROR", "Site name is required");
  return slug;
}
