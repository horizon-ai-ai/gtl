export type WebsiteSiteIntent =
  | "product_intro"
  | "sales_page"
  | "brand_story"
  | "company_profile";

export type WebsiteWidget =
  | {
      kind: "file";
      field: string;
      assetKind: string;
      uploadLabel: string;
      summaryLabel: string;
      required?: boolean;
      allowSkip?: boolean;
      multiple?: boolean;
    }
  | {
      kind: "product-card";
      field: "products";
      required: true;
      canUploadImages: true;
      uploadEndpoint: string;
      fileFieldName: string;
      imageField: string;
    }
  | {
      kind: "text";
      field: string;
      allowSkip?: boolean;
    }
  | {
      kind: "multi-select-thumb";
      field: string;
      allowSkip: true;
      multiple: true;
      maxSelect: number;
      options: Array<{ value: string; label: string }>;
    }
  | {
      kind: "confirm";
      field: "_confirm";
      required: true;
      options: Array<{ value: string; label: string }>;
    };

export type WebsiteCollectionStep = {
  prompt: string;
  widget: WebsiteWidget;
};

export const WEBSITE_SITE_INTENT_OPTIONS = [
  {
    value: "product_intro",
    label: "商品介紹",
    description: "適合把單一商品或主打商品說清楚。",
  },
  {
    value: "sales_page",
    label: "導購銷售",
    description: "適合強 CTA、促購、詢價或轉換。",
  },
  {
    value: "brand_story",
    label: "品牌形象",
    description: "適合建立品牌感、理念與信任。",
  },
  {
    value: "company_profile",
    label: "公司介紹",
    description: "適合公司、團隊、服務與案例介紹。",
  },
] as const satisfies ReadonlyArray<{
  value: WebsiteSiteIntent;
  label: string;
  description: string;
}>;

export const WEBSITE_STYLE_OPTIONS = [
  {
    value: "minimal-luxury",
    label: "極簡高級",
    summary: "高級、留白、質感、專注品牌本身，適合 quiet luxury 與 premium branding。",
  },
  {
    value: "tech-future",
    label: "科技未來",
    summary: "科技、創新、智慧化、未來感，適合 AI、數位介面與高科技產品。",
  },
  {
    value: "japanese-fresh",
    label: "日系清新",
    summary: "自然、溫暖、療癒、輕盈生活感，適合日常、居家、保養、食品與品牌故事。",
  },
  {
    value: "western-trend",
    label: "歐美潮流",
    summary: "潮流、個性、張力、自由感與年輕文化，適合 streetwear、fashion campaign。",
  },
  {
    value: "commercial-ecommerce",
    label: "商業電商",
    summary: "清楚、快速、好理解、強調商品價值與 CTA，適合轉換導向商品頁。",
  },
  {
    value: "fashion-editorial",
    label: "時尚雜誌",
    summary: "時尚、構圖感、品牌故事、視覺節奏，像一本高級品牌雜誌。",
  },
];

const designStyleStep: WebsiteCollectionStep = {
  prompt: "接著確認網站風格。請從下列風格選 1 到 2 個想呈現的方向；如果還沒想法，也可以略過，我會依前面內容推薦。",
  widget: {
    kind: "multi-select-thumb",
    field: "design.style",
    allowSkip: true,
    multiple: true,
    maxSelect: 2,
    options: WEBSITE_STYLE_OPTIONS,
  },
};

const logoStep = (siteIntent?: WebsiteSiteIntent): WebsiteCollectionStep => ({
  prompt:
    siteIntent === "brand_story" || siteIntent === "company_profile"
      ? "有 Logo、形象照、團隊照或公司照片的話，可以先上傳一張最重要的素材；沒有也可以略過。"
      : "有 Logo 或產品主視覺的話，可以先上傳一張最重要的素材；沒有也可以略過。",
  widget: {
    kind: "file",
    field: "assets.logoUrl",
    assetKind: "logo",
    uploadLabel: "Logo",
    summaryLabel: "Logo",
    allowSkip: true,
  },
});

const confirmStep: WebsiteCollectionStep = {
  prompt: "還有要補充的嗎？沒有的話我會先產出網站初稿。",
  widget: {
    kind: "confirm",
    field: "_confirm",
    required: true,
    options: [
      { value: "generate", label: "完成，開始生成" },
      { value: "continue", label: "我再補充" },
    ],
  },
};

const productCollectionScript = (siteIntent?: WebsiteSiteIntent): WebsiteCollectionStep[] => [
  {
    prompt:
      siteIntent === "sales_page"
        ? "先新增或連結這次主推商品資料。可以從商品庫選既有商品，也可以新增多個商品；最好上傳 3 到 5 張產品美圖，並補商品名稱、特色、售價與導購重點。"
        : "先新增或連結這次要介紹的商品資料。可以從商品庫選既有商品，也可以新增多個商品；最好上傳 3 到 5 張產品美圖，並補商品名稱、特色與主要賣點。",
    widget: {
      kind: "product-card",
      field: "products",
      required: true,
      canUploadImages: true,
      uploadEndpoint: "/site-uploads",
      fileFieldName: "file",
      imageField: "imageUrl",
    },
  },
  {
    prompt:
      "每個商品都有自己的起點。這款商品是怎麼誕生的？又想解決什麼問題？如果還沒有想法可以略過，我會依商品特色補第一版。",
    widget: {
      kind: "text",
      field: "contentNotes.productStory",
      allowSkip: true,
    },
  },
  {
    prompt: "如果只能用三個關鍵字形容這款產品的特色和優勢，你會怎麼選？",
    widget: {
      kind: "text",
      field: "contentNotes.productKeywords",
      allowSkip: true,
    },
  },
  {
    prompt:
      "網頁上如果有真實評價會更讓人信任。目前有 KOL、網紅或使用者好評可以提供嗎？沒有可以略過，社會認同區不會亂編。",
    widget: {
      kind: "text",
      field: "contentNotes.socialProof",
      allowSkip: true,
    },
  },
  {
    prompt:
      "最後，平常客戶最常問的三個問題是什麼？我會整理成 FAQ；沒有可以略過，FAQ 不會亂編。",
    widget: {
      kind: "text",
      field: "contentNotes.faqNotes",
      allowSkip: true,
    },
  },
  designStyleStep,
  logoStep(siteIntent),
  confirmStep,
];

const imageCollectionScript = (siteIntent?: WebsiteSiteIntent): WebsiteCollectionStep[] => [
  {
    prompt:
      "為了讓網頁一打開就讓人驚艷，可以提供 3 到 5 張最能代表品牌、公司或服務的形象照片嗎？若沒有，我會依既有素材或目前內容補第一版。",
    widget: {
      kind: "file",
      field: "contentNotes.heroImages",
      assetKind: "hero_images",
      uploadLabel: "形象照片",
      summaryLabel: "形象照",
      required: false,
      allowSkip: true,
    },
  },
  {
    prompt:
      "首先，我們來聊聊你們的主力內容。你們目前主要提供哪些服務項目？如果是特定檔期，有沒有一定要放到網頁最顯眼位置的主打內容？",
    widget: {
      kind: "text",
      field: "contentNotes.serviceHighlights",
      allowSkip: true,
    },
  },
  {
    prompt:
      "有沒有哪幾項代表案例、作品或服務特色，是特別想讓新客戶看到的？可以文字描述，也可以之後補圖；若沒有，案例區會弱化或刪除，不會亂編。",
    widget: {
      kind: "file",
      field: "contentNotes.caseStudies",
      assetKind: "case_studies",
      uploadLabel: "作品/案例圖片",
      summaryLabel: "作品/案例",
      required: false,
      allowSkip: true,
    },
  },
  {
    prompt: "你們最想傳達給客戶的核心價值或經營理念是什麼？若沒有，我會根據上面提供的內容生成第一版。",
    widget: {
      kind: "text",
      field: "contentNotes.brandValues",
      allowSkip: true,
    },
  },
  {
    prompt:
      "要拉近與客戶的距離，「人」和「空間」很有說服力。可以聊聊團隊、專業證照、服務流程或工作環境；若沒有，這區會弱化或刪除，不會亂編。",
    widget: {
      kind: "file",
      field: "contentNotes.teamTrust",
      assetKind: "team_trust",
      uploadLabel: "團隊/環境照片",
      summaryLabel: "團隊/環境照",
      required: false,
      allowSkip: true,
    },
  },
  {
    prompt:
      "最後，當客戶想聯絡你們時，他們可以透過哪些管道找到你？例如官方 LINE、電話、Email、IG 或 FB。",
    widget: {
      kind: "text",
      field: "contentNotes.contactNotes",
      allowSkip: true,
    },
  },
  designStyleStep,
  logoStep(siteIntent),
  confirmStep,
];

export function getWebsiteCollectionScript(siteIntent?: WebsiteSiteIntent | null) {
  if (siteIntent === "brand_story" || siteIntent === "company_profile") {
    return imageCollectionScript(siteIntent);
  }
  return productCollectionScript(siteIntent || undefined);
}

export function websiteIntentLabel(intent: WebsiteSiteIntent) {
  return WEBSITE_SITE_INTENT_OPTIONS.find((option) => option.value === intent)?.label || "網站";
}
