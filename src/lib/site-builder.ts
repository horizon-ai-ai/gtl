import { ApiError } from "./api";
import { flexionStream, pickModel } from "./flexion";
import type { TradeProductDraft } from "./trade-vision";

export type SitePageSection = {
  type:
    | "hero"
    | "features"
    | "products"
    | "productDetails"
    | "socialProof"
    | "closingInfo"
    | "cta"
    | "faq"
    | "testimonials"
    | "story"
    | "gallery"
    | "specs"
    | "inquiry";
  layoutVariant?: string;
  variantFamily?: "product" | "brand";
  title?: string;
  body?: string;
  image_url?: string;
  items?: Array<string | { title?: string; body?: string; image_url?: string }>;
  button_label?: string;
};

export type SiteSchema = {
  title: string;
  tagline: string;
  primary_color: string;
  logo_url?: string;
  design_style?: string;
  design_brief?: string;
  design_tokens?: {
    bg?: string;
    panel?: string;
    ink?: string;
    muted?: string;
    line?: string;
    shadow?: string;
    accent?: string;
  };
  site_intent?: string;
  product_images?: string[];
  product?: {
    linked_product_id?: string;
    linked_product_name?: string;
    linked_product_slug?: string;
    linked_product_site_url?: string;
  };
  inquiry_cta_label?: string;
  inquiry_cta_note?: string;
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
  logo_url: undefined,
  design_style: "minimal-luxury",
  design_brief: undefined,
  design_tokens: undefined,
  site_intent: "product_intro",
  product_images: [],
  product: {},
  inquiry_cta_label: "立即詢價",
  inquiry_cta_note: "想了解規格、報價或合作方式，歡迎立即詢價。",
  seo: {
    title: "Marketing Landing Page",
    description: "用 AI 快速建立你的第一個行銷網站",
  },
  integrations: {},
  sections: [
    { type: "hero", title: "品牌主標題", body: "一句話說明你的產品價值。", button_label: "立即詢價" },
    { type: "features", layoutVariant: "painpoint.p1", title: "商品亮點", items: ["亮點一", "亮點二", "亮點三"] },
    { type: "products", layoutVariant: "solution.s1", title: "精選商品", items: ["商品一", "商品二", "商品三"] },
    { type: "productDetails", layoutVariant: "details.d1", title: "規格資訊", items: ["規格一", "規格二", "規格三"] },
    { type: "closingInfo", layoutVariant: "closing.c1", title: "對這項商品有興趣？", body: "直接點擊下方按鈕，立即詢價。", button_label: "立即詢價" },
  ],
};

const SECTION_TYPES: SitePageSection["type"][] = [
  "hero",
  "features",
  "products",
  "productDetails",
  "socialProof",
  "closingInfo",
  "cta",
  "faq",
  "testimonials",
  "story",
  "gallery",
  "specs",
  "inquiry",
];

function normalizeSectionType(value: unknown): SitePageSection["type"] {
  return typeof value === "string" && SECTION_TYPES.includes(value as SitePageSection["type"])
    ? (value as SitePageSection["type"])
    : "features";
}

function parseSchema(raw: string): SiteSchema {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return FALLBACK_SCHEMA;
  try {
    const json = JSON.parse(match[0]) as SiteSchema;
      return {
        title: json.title || FALLBACK_SCHEMA.title,
        tagline: json.tagline || FALLBACK_SCHEMA.tagline,
        primary_color: json.primary_color || FALLBACK_SCHEMA.primary_color,
        logo_url:
          typeof json.logo_url === "string" && json.logo_url.trim()
            ? json.logo_url.trim()
            : FALLBACK_SCHEMA.logo_url,
        design_style:
          typeof json.design_style === "string" && json.design_style.trim()
            ? json.design_style.trim()
            : FALLBACK_SCHEMA.design_style,
        design_brief:
          typeof json.design_brief === "string" && json.design_brief.trim()
            ? json.design_brief.trim()
            : FALLBACK_SCHEMA.design_brief,
        design_tokens:
          json.design_tokens && typeof json.design_tokens === "object"
            ? {
                bg: typeof json.design_tokens.bg === "string" ? json.design_tokens.bg : undefined,
                panel: typeof json.design_tokens.panel === "string" ? json.design_tokens.panel : undefined,
                ink: typeof json.design_tokens.ink === "string" ? json.design_tokens.ink : undefined,
                muted: typeof json.design_tokens.muted === "string" ? json.design_tokens.muted : undefined,
                line: typeof json.design_tokens.line === "string" ? json.design_tokens.line : undefined,
                shadow: typeof json.design_tokens.shadow === "string" ? json.design_tokens.shadow : undefined,
                accent: typeof json.design_tokens.accent === "string" ? json.design_tokens.accent : undefined,
              }
            : FALLBACK_SCHEMA.design_tokens,
        site_intent:
          typeof json.site_intent === "string" && json.site_intent.trim()
            ? json.site_intent.trim()
            : FALLBACK_SCHEMA.site_intent,
        product_images: Array.isArray(json.product_images)
          ? json.product_images
              .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              .slice(0, 8)
          : FALLBACK_SCHEMA.product_images,
        product:
          json.product && typeof json.product === "object"
            ? {
                linked_product_id:
                  typeof json.product.linked_product_id === "string" ? json.product.linked_product_id : undefined,
                linked_product_name:
                  typeof json.product.linked_product_name === "string" ? json.product.linked_product_name : undefined,
                linked_product_slug:
                  typeof json.product.linked_product_slug === "string" ? json.product.linked_product_slug : undefined,
                linked_product_site_url:
                  typeof json.product.linked_product_site_url === "string"
                    ? json.product.linked_product_site_url
                    : undefined,
              }
            : FALLBACK_SCHEMA.product,
        inquiry_cta_label:
          typeof json.inquiry_cta_label === "string" && json.inquiry_cta_label.trim()
            ? json.inquiry_cta_label.trim()
            : FALLBACK_SCHEMA.inquiry_cta_label,
        inquiry_cta_note:
          typeof json.inquiry_cta_note === "string" && json.inquiry_cta_note.trim()
            ? json.inquiry_cta_note.trim()
            : FALLBACK_SCHEMA.inquiry_cta_note,
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
        sections:
          Array.isArray(json.sections) && json.sections.length > 0
            ? json.sections.map((section) => {
                const raw = section as Record<string, unknown>;
                return {
                  type: normalizeSectionType(raw.type),
                  layoutVariant: typeof raw.layoutVariant === "string" ? raw.layoutVariant : undefined,
                  variantFamily:
                    raw.variantFamily === "product" || raw.variantFamily === "brand"
                      ? raw.variantFamily
                      : undefined,
                  title: typeof raw.title === "string" ? raw.title : undefined,
                  body: typeof raw.body === "string" ? raw.body : undefined,
                  image_url: typeof raw.image_url === "string" ? raw.image_url : undefined,
                  button_label: typeof raw.button_label === "string" ? raw.button_label : undefined,
                  items: Array.isArray(raw.items)
                    ? raw.items.filter(
                        (item) =>
                          typeof item === "string" ||
                          (typeof item === "object" && item !== null && !Array.isArray(item)),
                      ) as SitePageSection["items"]
                    : undefined,
                } satisfies SitePageSection;
              })
            : FALLBACK_SCHEMA.sections,
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
  description?: string;
  product_notes?: string;
  product_image_urls?: string[];
  product_draft?: Partial<TradeProductDraft> | null;
}) {
  const baseUrl = process.env.FLEXION_API_BASE_URL ?? "";
  const apiKey = process.env.FLEXION_API_KEY ?? "";
  if (!baseUrl || !apiKey) {
    return {
      ...FALLBACK_SCHEMA,
      title: input.business_name || FALLBACK_SCHEMA.title,
      tagline: input.product_notes || input.description || FALLBACK_SCHEMA.tagline,
      product_images: input.product_image_urls ?? [],
      sections: [
        {
          type: "hero",
          title: input.product_draft?.suggested_name || input.business_name || FALLBACK_SCHEMA.title,
          body: input.product_notes || input.description || "主打商品的一句話介紹。",
          image_url: input.product_image_urls?.[0],
          button_label: "立即詢價",
        },
        {
          type: "story",
          title: "商品亮點",
          items: [
            input.product_draft?.suggested_description || "以 AI 自動生成商品亮點內容。",
            ...(Object.entries(input.product_draft?.detected_attributes ?? {})
              .slice(0, 3)
              .map(([key, value]) => `${key}：${value}`) || []),
          ],
        },
        {
          type: "cta",
          title: "立即詢價",
          body: "若想了解報價、MOQ、交期或合作方式，請立即詢價。",
          button_label: "立即詢價",
        },
      ],
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
            "你是商品頁企劃助理。請只輸出 JSON。格式為 {title, tagline, primary_color, product_images, inquiry_cta_label, inquiry_cta_note, sections:[{type,title,body,image_url,items,button_label}] }。請產出一頁式商品網站，內容使用繁體中文，最後一定要有可引導詢價的 CTA 區塊。",
        },
        {
          role: "user",
          content: `請為以下商品與品牌產生單頁式商品網站草稿：
品牌=${input.business_name}
網站描述=${input.description ?? ""}
產業=${input.industry ?? ""}
目標客群=${input.audience ?? ""}
主要目標=${input.goal ?? ""}
商品補充說明=${input.product_notes ?? ""}
商品圖片 URLs=${(input.product_image_urls ?? []).join(", ")}
圖片辨識商品名稱=${input.product_draft?.suggested_name ?? ""}
圖片辨識商品描述=${input.product_draft?.suggested_description ?? ""}
圖片辨識商品類別=${input.product_draft?.suggested_category ?? ""}
圖片辨識特徵=${JSON.stringify(input.product_draft?.detected_attributes ?? {})}

需求：
1. 這是一頁式商品頁，不是一般公司形象頁。
2. 請把商品圖片作為主視覺來源。
3. 版面節奏要適合行動裝置瀏覽。
4. 最底下要有一個「立即詢價」按鈕的 CTA。
5. sections 至少包含 hero、商品亮點/特色、規格或購買資訊、底部詢價 CTA。
6. 若有圖片 URL，請適度放進 hero 或 gallery/story 區塊的 image_url / items.image_url。
請使用繁體中文內容。`,
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
