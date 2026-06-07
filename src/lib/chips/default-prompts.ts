/**
 * Default quick-prompt chips for the G³ hero (spec §4.4).
 *
 * Categories map onto the three brand pillars:
 *  - generate (設計):  系統化・創造・生成
 *  - growth   (行銷):  數據・邏輯推動・行銷決策
 *  - global   (貿易):  智能整合・整合與連結
 *
 * Source list: 業主 G3 介面示意說明 20260430 P.1
 */

export type ChipCategory = "generate" | "growth" | "global";

export type ChipItem = {
  id: string;
  label: string;
  /** Text injected into the composer when the chip is clicked. */
  prompt: string;
  category: ChipCategory;
};

export const DEFAULT_PROMPT_CHIPS: ChipItem[] = [
  // ── Generate / 設計 ──
  { id: "logo",           label: "品牌Logo設計",          prompt: "幫我規劃品牌 Logo 設計，請先問我品牌名稱、產業、想傳達的價值與風格偏好。", category: "generate" },
  { id: "vi",             label: "品牌識別系統（VI）",     prompt: "我需要一套品牌識別系統（VI）。請依品牌價值、應用情境列出需要交付的項目與順序。", category: "generate" },
  { id: "brand-manual",   label: "品牌標準手冊",          prompt: "幫我規劃品牌標準手冊內容架構，包含 Logo 用法、色彩、字型、版式規範等。", category: "generate" },
  { id: "namecard",       label: "名片設計",              prompt: "幫我設計名片，請問尺寸、雙面或單面、需要包含哪些聯絡資訊與設計風格？", category: "generate" },
  { id: "dm",             label: "DM設計／傳單設計",       prompt: "幫我設計 DM／傳單，請告訴我用途、目標族群與想傳達的主視覺。", category: "generate" },
  { id: "deck",           label: "簡報設計",              prompt: "幫我設計專業簡報，請提供主題、頁數與想突顯的論點。", category: "generate" },
  { id: "catalogue",      label: "型錄設計",              prompt: "幫我設計產品型錄，請說明產品線、頁數、語言版本與發放管道。", category: "generate" },
  { id: "proposal",       label: "提案設計",              prompt: "幫我設計提案文件，請說明客戶背景、提案目標與重點。", category: "generate" },
  { id: "invitation",     label: "邀請卡設計",            prompt: "幫我設計邀請卡，請告訴我活動性質、收件對象與風格基調。", category: "generate" },
  { id: "sticker",        label: "貼紙設計",              prompt: "幫我設計貼紙，請說明尺寸、材質、用途與品牌延伸需求。", category: "generate" },
  { id: "package",        label: "產品包裝設計",          prompt: "幫我做產品包裝設計，請說明產品類型、容量、目標客群與通路。", category: "generate" },
  { id: "social-graphic", label: "社群圖文設計",          prompt: "幫我設計一組社群圖文，請告訴我平台（IG / FB / LinkedIn）、主題與發佈時程。", category: "generate" },
  { id: "banner",         label: "Banner設計",            prompt: "幫我設計 Banner，請說明用途（網站 / 廣告 / 活動）與尺寸需求。", category: "generate" },
  { id: "edm",            label: "EDM設計",               prompt: "幫我設計 EDM，請說明寄送名單屬性、活動主題與 CTA。", category: "generate" },
  { id: "brand-site",     label: "品牌官網設計",          prompt: "幫我規劃品牌官網，請說明品牌定位、目標、想要的頁面結構與素材狀況。", category: "generate" },
  { id: "landing",        label: "一頁式網站",            prompt: "幫我規劃一頁式落地頁，請告訴我目標（蒐集名單 / 訂單 / 報名）、產品賣點與 CTA。", category: "generate" },
  { id: "ec-site",        label: "電商網站設計",          prompt: "幫我規劃電商網站，請說明品類、商品數、金物流與會員機制需求。", category: "generate" },
  { id: "event-form",     label: "活動報名設計",          prompt: "幫我設計活動報名頁與表單，請說明活動內容、報名欄位與通知流程。", category: "generate" },
  { id: "x-stand",        label: "X展架設計",             prompt: "幫我設計 X 展架，請告訴我場合、尺寸、主視覺與聯絡資訊。", category: "generate" },
  { id: "standee",        label: "立牌設計",              prompt: "幫我設計立牌，請說明用途、尺寸與品牌規範。", category: "generate" },
  { id: "hand-board",     label: "手拿牌設計",            prompt: "幫我設計手拿牌，請說明應用場景與想突顯的口號或視覺。", category: "generate" },
  { id: "banner-cloth",   label: "布條設計",              prompt: "幫我設計布條，請說明懸掛場合、尺寸與訴求。", category: "generate" },
  { id: "outdoor",        label: "戶外看板設計",          prompt: "幫我設計戶外看板，請說明位置、尺寸與閱讀距離。", category: "generate" },
  { id: "signage",        label: "招牌設計",              prompt: "幫我設計招牌，請說明店面風格、材質偏好與安裝環境。", category: "generate" },
  { id: "merch",          label: "周邊製作物設計",        prompt: "幫我規劃品牌周邊製作物，請說明使用情境、預算與品牌調性。", category: "generate" },
  { id: "premium",        label: "贈品品設計",            prompt: "幫我設計贈品，請說明對象、預算、實用性與品牌延伸目標。", category: "generate" },
  { id: "illustration",   label: "插畫設計",              prompt: "幫我設計品牌插畫，請說明用途、風格參考與授權需求。", category: "generate" },
  { id: "retouch",        label: "修圖服務",              prompt: "我需要修圖服務，請說明素材數量、修圖程度（去背 / 補光 / 合成）與交付格式。", category: "generate" },

  // ── Growth / 行銷 ──
  { id: "social-copy",    label: "社群文案",              prompt: "幫我寫一組社群文案，請告訴我平台、品牌語氣、主題與想達成的互動目標。", category: "growth" },
  { id: "seo",            label: "SEO文章",               prompt: "幫我規劃一篇 SEO 文章，請提供目標關鍵字、目標讀者與想觸發的行動。", category: "growth" },
  { id: "site-archive",   label: "網站建檔",              prompt: "幫我做網站內容建檔，請說明頁面數、CMS 平台與素材狀況。", category: "growth" },
  { id: "annual",         label: "整年度行銷策略",         prompt: "幫我規劃整年度行銷策略，請說明品牌目標、預算範圍與既有渠道狀況。", category: "growth" },

  // ── Global / 貿易 ──
  { id: "trade-strategy", label: "貿易拓銷策略",          prompt: "幫我規劃 B2B 貿易拓銷策略，請說明目標市場、產品線與既有客戶資料。", category: "global" },
];
