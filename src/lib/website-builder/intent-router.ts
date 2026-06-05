import type { WebsiteSiteIntent } from "./collection-script";

export type WebsiteRouteKind = "website_builder" | "design_consult" | "undecided";

const blockedNonBuilderSignals = ["網站健檢", "seo文章", "seo 文章", "網站文案建議", "網站分析"];

const directWebsiteSignals = [
  "一頁式網站",
  "一頁式網頁",
  "landing page",
  "landingpage",
  "landing頁",
  "官網",
  "網站設計",
  "網頁設計",
  "電商網站",
  "購物網站",
  "產品頁",
  "商品頁",
  "導購頁",
  "收名單頁",
  "品牌網站",
  "公司網站",
  "公司介紹頁",
  "服務介紹頁",
];

const websiteCarrierSignals = ["網站", "網頁", "頁面", "landing"];
const websiteBuilderVerbSignals = ["做", "製作", "建立", "架", "生成", "產生", "設計", "我要"];
const websitePurposeSignals = ["商品介紹", "銷售", "品牌形象", "公司介紹", "服務介紹", "產品展示", "產品介紹", "詢價"];

export function routeWebsiteKind(text: string): WebsiteRouteKind {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "undecided";
  if (blockedNonBuilderSignals.some((signal) => normalized.includes(signal))) return "design_consult";
  if (directWebsiteSignals.some((signal) => normalized.includes(signal))) return "website_builder";
  if (
    websiteCarrierSignals.some((signal) => normalized.includes(signal)) &&
    websiteBuilderVerbSignals.some((signal) => normalized.includes(signal))
  ) {
    return "website_builder";
  }
  if (
    websiteCarrierSignals.some((signal) => normalized.includes(signal)) &&
    websitePurposeSignals.some((signal) => normalized.includes(signal))
  ) {
    return "website_builder";
  }
  return "undecided";
}

export function inferWebsiteIntentFromText(text: string): WebsiteSiteIntent | null {
  if (text.includes("導購") || text.includes("銷售") || text.includes("轉換")) return "sales_page";
  if (text.includes("品牌形象") || text.includes("品牌")) return "brand_story";
  if (text.includes("公司介紹") || text.includes("公司") || text.includes("服務介紹")) return "company_profile";
  if (text.includes("商品") || text.includes("產品")) return "product_intro";
  return null;
}

export function inferWebsiteIntentFromQuickReply(quickReply: Record<string, unknown> | null): WebsiteSiteIntent | null {
  if (quickReply?.action !== "website_select_intent") return null;
  const label = typeof quickReply.label === "string" ? quickReply.label : "";
  const value = typeof quickReply.value === "string" ? quickReply.value : "";
  return inferWebsiteIntentFromText(`${label} ${value}`) || "product_intro";
}
