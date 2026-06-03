import { MessageRole, MessageType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { flexionCompleteJSON, pickModel } from "@/lib/flexion";
import { slugifySiteName, type SitePageSection, type SiteSchema } from "@/lib/site-builder";
import { publishConversationEvent } from "@/lib/conversation/stream";
import { shapeMessage } from "@/lib/conversation/api";
import {
  getWebsiteCollectionScript,
  WEBSITE_STYLE_OPTIONS,
  websiteIntentLabel,
  type WebsiteCollectionStep,
  type WebsiteSiteIntent,
} from "./collection-script";
import {
  inferWebsiteIntentFromQuickReply,
  inferWebsiteIntentFromText,
  routeWebsiteKind,
} from "./intent-router";

type WebsiteBuilderMemory = {
  kind?: "website_builder" | "design_consult" | "undecided";
  siteIntent?: WebsiteSiteIntent | null;
  formInput?: Record<string, unknown>;
  currentQuestionKey?: string | null;
  preIntentStep?: "info" | "style" | "intent" | null;
  awaitingConfirmation?: boolean;
  siteId?: string | null;
};

type WebsiteProductOption = {
  productId: string;
  linkedProductId: string;
  name: string;
  shortDescription: string;
  barcode: string;
  category: string;
  specs: string;
  quantityRange: string;
  unitPrice: string;
  totalPrice: string;
  notes: string;
  origin: string;
  storageMethod: string;
  sellerInfo: string;
  specialCompliance: string;
  returnWarranty: string;
  imageUrl: string;
  imageUrls: string[];
  quoteLinked: true;
};

type WebsiteBuilderResult = {
  handled: boolean;
  assistantMessage?: Awaited<ReturnType<typeof prisma.message.create>>;
};

type WebsitePatchResult = {
  updatedSchema: SiteSchema;
  changeSummary: string;
  affectedSectionIndexes: number[];
  needsClarification?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: Array<{ label: string; value: string }>;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function quickActionsForIntentSelection() {
  return [
    {
      type: "quick_reply",
      label: "商品介紹／導購型",
      value: "我想做商品介紹／導購型一頁式網站",
      action: "website_select_intent",
    },
    {
      type: "quick_reply",
      label: "品牌形象／公司介紹型",
      value: "我想做品牌形象／公司介紹型一頁式網站",
      action: "website_select_intent",
    },
  ];
}

function projectMemory(conversation: { project_memory: Prisma.JsonValue | null }): Record<string, unknown> {
  return recordValue(conversation.project_memory);
}

function websiteMemory(conversation: { project_memory: Prisma.JsonValue | null }): WebsiteBuilderMemory {
  return recordValue(projectMemory(conversation).websiteBuilder) as WebsiteBuilderMemory;
}

function mergeWebsiteMemory(
  conversation: { project_memory: Prisma.JsonValue | null },
  patch: WebsiteBuilderMemory,
) {
  const memory = projectMemory(conversation);
  return {
    ...memory,
    websiteBuilder: {
      ...recordValue(memory.websiteBuilder),
      ...patch,
    },
  } as Prisma.InputJsonValue;
}

function fieldValue(formInput: Record<string, unknown>, field: string) {
  let current: unknown = formInput;
  for (const part of field.split(".")) {
    if (!part || !current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setFieldValue(formInput: Record<string, unknown>, field: string, value: unknown) {
  const next = { ...formInput };
  let target = next;
  const parts = field.split(".").filter(Boolean);
  for (const part of parts.slice(0, -1)) {
    const existing = target[part];
    const child = recordValue(existing);
    target[part] = { ...child };
    target = target[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (leaf) target[leaf] = value;
  return next;
}

function isMeaningful(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function isSkipRequest(text: string, action?: string) {
  if (action === "website_skip_field" || action === "website_ai_assist") return true;
  const hints = ["略過", "跳過", "沒有", "先不用", "你決定", "你建議", "沒想法", "不確定"];
  return hints.some((hint) => text.includes(hint));
}

function isGenerateRequest(text: string, action?: string) {
  if (action === "website_generate") return true;
  const hints = ["完成，開始生成", "開始生成", "產生網站", "生成網站", "產生第一版", "生成第一版", "直接做"];
  return hints.some((hint) => text.includes(hint));
}

function isFreshWebsiteRequest(text: string, action?: string) {
  if (action === "website_new" || action === "website_restart") return true;
  const hasWebsite = ["網站", "網頁", "一頁式"].some((hint) => text.includes(hint));
  if (!hasWebsite) return false;
  const resetHints = [
    "重新生成一個新的",
    "重新生一個新的",
    "重新做一個新的",
    "重新做一個",
    "重新開一個",
    "新的一頁式",
    "新的網站",
    "另一個網站",
    "另外一個網站",
    "從頭來",
    "不要沿用",
  ];
  return resetHints.some((hint) => text.includes(hint));
}

function isProductMutationRequest(text: string, action?: string) {
  if (action === "website_edit_products" || action === "website_add_product") return true;
  const hasProduct = ["商品", "產品", "品項", "貨品"].some((hint) => text.includes(hint));
  if (!hasProduct) return false;
  const mutationHints = ["新增", "增加", "加一個", "多一個", "修改", "更新", "改商品", "換商品", "補商品", "刪除", "移除"];
  return mutationHints.some((hint) => text.includes(hint));
}

function shouldCollectWebsiteInput(action?: string) {
  return [
    "website_continue_collecting",
    "website_skip_field",
    "website_ai_assist",
    "website_upload_files",
    "website_edit_products",
    "website_add_product",
  ].includes(action || "");
}

function isProductWebsiteIntent(intent: WebsiteSiteIntent) {
  return intent === "product_intro" || intent === "sales_page";
}

function websiteSupplementQuickActions() {
  return [
    {
      type: "quick_reply",
      label: "完成，開始生成",
      value: "完成，開始生成",
      action: "website_generate",
    },
    {
      type: "input",
      label: "我再補充",
      value: "我再補充：",
      action: "website_continue_collecting",
    },
  ];
}

function normalizeWebsiteStyleValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  const exact = WEBSITE_STYLE_OPTIONS.find((option) => option.value === text);
  if (exact) return exact.value;
  const byLabel = WEBSITE_STYLE_OPTIONS.find((option) => text.includes(option.label));
  if (byLabel) return byLabel.value;
  const byValue = WEBSITE_STYLE_OPTIONS.find((option) => text.includes(option.value));
  if (byValue) return byValue.value;
  if (text.includes("極簡") || text.includes("高級") || text.includes("premium") || text.includes("quiet luxury")) {
    return "minimal-luxury";
  }
  if (text.includes("科技") || text.includes("未來") || text.includes("AI") || text.includes("數位")) {
    return "tech-future";
  }
  if (text.includes("日系") || text.includes("清新") || text.includes("自然") || text.includes("療癒") || text.includes("muji")) {
    return "japanese-fresh";
  }
  if (text.includes("歐美") || text.includes("潮流") || text.includes("街頭") || text.includes("streetwear")) {
    return "western-trend";
  }
  if (text.includes("商業") || text.includes("電商") || text.includes("轉換") || text.includes("ecommerce")) {
    return "commercial-ecommerce";
  }
  if (text.includes("時尚") || text.includes("雜誌") || text.includes("fashion editorial") || text.includes("magazine")) {
    return "fashion-editorial";
  }
  if (text === "warm-editorial" || text.includes("暖米")) {
    return "minimal-luxury";
  }
  if (text === "cinematic-dark" || text.includes("電影")) {
    return "fashion-editorial";
  }
  if (text === "boutique-arch" || text.includes("精品")) {
    return "minimal-luxury";
  }
  if (text === "tech-minimal") {
    return "tech-future";
  }
  if (text === "playful-pop" || text.includes("活潑")) {
    return "western-trend";
  }
  return "";
}

function normalizeWebsiteStyleList(value: unknown) {
  const rawValues = Array.isArray(value) ? value : listValue(value);
  const normalized = rawValues
    .map(normalizeWebsiteStyleValue)
    .filter((item): item is string => item.length > 0);
  return Array.from(new Set(normalized)).slice(0, 2);
}

function buildCollectionState(siteIntent: WebsiteSiteIntent, formInput: Record<string, unknown>) {
  const script = getWebsiteCollectionScript(siteIntent);
  const missingStep = script.find((step) => {
    if (step.widget.kind === "confirm") return false;
    return !isMeaningful(fieldValue(formInput, step.widget.field));
  });
  const answered = script.filter((step) => {
    if (step.widget.kind === "confirm") return false;
    return isMeaningful(fieldValue(formInput, step.widget.field));
  }).length;
  const total = script.filter((step) => step.widget.kind !== "confirm").length;
  const currentStep =
    missingStep ||
    script.find((step) => step.widget.kind === "confirm") ||
    script[script.length - 1];

  return {
    script,
    currentStep,
    ready: !missingStep,
    progress: { answered, total },
  };
}

function buildCollectionQuickActions(step: WebsiteCollectionStep, siteIntent: WebsiteSiteIntent) {
  if (step.widget.kind === "confirm") {
    return [
      {
        type: "quick_reply",
        label: "完成，開始生成",
        value: "完成，開始生成",
        action: "website_generate",
      },
      {
        type: "input",
        label: "我再補充",
        value: "我再補充：",
        action: "website_continue_collecting",
      },
    ];
  }

  if (step.widget.kind === "product-card") {
    return [
      {
        type: "quick_reply",
        label: "先給填寫建議",
        value: "我還沒整理好商品資料，請先給我商品資料欄位的填寫建議。",
        action: "website_ai_assist",
      },
    ];
  }

  if (step.widget.kind === "multi-select-thumb") {
    return [
      ...step.widget.options.map((option) => ({
        type: "quick_reply",
        label: option.label,
        value: option.label,
        action: "website_continue_collecting",
      })),
      {
        type: "quick_reply",
        label: "略過",
        value: "這題先略過，請用適合這個網站主軸的設計風格。",
        action: "website_skip_field",
      },
    ];
  }

  const fieldLabels: Record<string, string> = {
    "contentNotes.productStory": "補商品故事",
    "contentNotes.productKeywords": "補商品關鍵字",
    "contentNotes.socialProof": "補好評或背書",
    "contentNotes.faqNotes": "補常見問題",
    "contentNotes.serviceHighlights": "補服務項目",
    "contentNotes.caseStudies": "補作品案例",
    "contentNotes.brandValues": "補品牌理念",
    "contentNotes.teamTrust": "補團隊信任",
    "contentNotes.contactNotes": "補聯絡資訊",
    "assets.logoUrl": "補品牌素材",
  };
  const label = fieldLabels[step.widget.field] ||
    (siteIntent === "sales_page"
      ? "補導購重點"
      : siteIntent === "brand_story" || siteIntent === "company_profile"
        ? "補品牌內容"
        : "補內容");
  return [
    {
      type: "input",
      label,
      value: `${label}：`,
      action: "website_continue_collecting",
    },
    {
      type: "quick_reply",
      label: "略過",
      value: "這題先略過，請依目前內容補第一版。",
      action: "website_skip_field",
    },
  ];
}

function seedFormInputForWebsiteIntent(siteIntent: WebsiteSiteIntent, formInput: Record<string, unknown>) {
  const contentNotes = recordValue(formInput.contentNotes);
  const initialMaterials = textValue(contentNotes.initialMaterials);
  const initialImages = listValue(contentNotes.initialImages);
  if (isProductWebsiteIntent(siteIntent)) {
    const products = Array.isArray(formInput.products) ? formInput.products : [];
    if (products.length > 0) return formInput;
    if (!initialMaterials && initialImages.length === 0) return formInput;
    return {
      ...formInput,
      products: [
        {
          name: initialMaterials ? initialMaterials.slice(0, 40) : "主打商品",
          shortDescription: initialMaterials || "依目前提供的商品素材整理第一版。",
          description: initialMaterials,
          imageUrl: initialImages[0],
          imageUrls: initialImages,
          quoteLinked: false,
        },
      ],
      contentNotes: {
        ...contentNotes,
        productStory: textValue(contentNotes.productStory, initialMaterials),
        productKeywords: textValue(contentNotes.productKeywords, initialMaterials),
      },
    };
  }
  return {
    ...formInput,
    contentNotes: {
      ...contentNotes,
      serviceHighlights: textValue(contentNotes.serviceHighlights, initialMaterials),
      brandValues: textValue(contentNotes.brandValues, initialMaterials),
      heroImages: initialImages.length > 0 ? initialImages : contentNotes.heroImages,
    },
  };
}

function storeWebsiteSupplement(formInput: Record<string, unknown>, text: string) {
  const contentNotes = recordValue(formInput.contentNotes);
  const previous = textValue(contentNotes.supplementNotes);
  const nextText = text.trim();
  if (!nextText || nextText === "我再補充：") return formInput;
  return {
    ...formInput,
    contentNotes: {
      ...contentNotes,
      supplementNotes: previous ? `${previous}\n${nextText}` : nextText,
    },
  };
}

function metadataBase(params: {
  mode: string;
  siteIntent?: WebsiteSiteIntent | null;
  formInput?: Record<string, unknown>;
  step?: WebsiteCollectionStep;
  ready?: boolean;
  productOptions?: WebsiteProductOption[];
  stageLabel?: string;
  stageDescription?: string;
  stageIndex?: number;
}) {
  const widgetKind = params.step?.widget.kind;
  const derivedStage =
    params.stageLabel || params.stageDescription || params.stageIndex !== undefined
      ? null
      : widgetKind === "multi-select-thumb"
        ? {
            label: "風格確認",
            description: "依據已填資訊確認網站風格方向",
            index: 2,
          }
        : widgetKind === "confirm"
          ? {
              label: "補充確認",
              description: "最後確認是否還有內容、素材或上架需求要補充",
              index: 3,
            }
          : params.siteIntent
            ? {
                label: "資訊內容確認",
                description: "依據使用者選擇的網站類別，收集對應欄位與素材",
                index: 1,
              }
            : {
                label: "類別確認",
                description: "先確認一頁式網站偏商品介紹／導購型，或品牌形象／公司介紹型",
                index: 0,
              };
  return {
    source: "conversations.messages.website-builder",
    websiteBuilder: {
      mode: params.mode,
      siteIntent: params.siteIntent ?? null,
      formInput: params.formInput ?? null,
      widget: params.step?.widget ?? null,
      productOptions: params.productOptions ?? [],
      ready: params.ready ?? false,
    },
    stepDecision: {
      version: 1,
      phase: `website_builder_${params.mode}`,
      action: params.ready ? "website_generate" : "website_continue_collecting",
      domain: "web",
      mode: params.mode,
      needsUserInput: !params.ready,
      canGenerate: Boolean(params.ready),
      shouldShowProgress: false,
      stageIndex: params.stageIndex ?? derivedStage?.index,
      stageLabel: params.stageLabel || derivedStage?.label || (params.siteIntent ? websiteIntentLabel(params.siteIntent) : "類別確認"),
      stageDescription:
        params.stageDescription ||
        derivedStage?.description ||
        (params.ready ? "資料已足夠產生網站初稿。" : "照網站模板收集內容，不進一般問答。"),
      recommendedDisplay: "website_builder",
      updatedAt: new Date().toISOString(),
    },
  };
}

async function createAssistantMessage(params: {
  conversationId: string;
  text: string;
  metadata: Prisma.InputJsonValue;
  model?: string;
}) {
  const message = await prisma.message.create({
    data: {
      conversation_id: params.conversationId,
      role: MessageRole.assistant,
      message_type: MessageType.ai,
      content: { type: "text", text: params.text },
      metadata: params.metadata,
      credits_used: BigInt(0),
      model: params.model || "website-builder-router",
    },
  });
  publishConversationEvent(params.conversationId, "message.completed", shapeMessage(message));
  return message;
}

function storeSubmittedInput(params: {
  siteIntent: WebsiteSiteIntent;
  formInput: Record<string, unknown>;
  currentQuestionKey?: string | null;
  text: string;
  action?: string;
  productData?: Record<string, unknown> | null;
  uploadedImageUrls?: string[];
}) {
  const state = buildCollectionState(params.siteIntent, params.formInput);
  const currentStep =
    params.currentQuestionKey
      ? state.script.find((step) => step.widget.field === params.currentQuestionKey)
      : state.currentStep;
  if (!currentStep || currentStep.widget.kind === "confirm") return params.formInput;
  const field = currentStep.widget.field;
  const uploadedImageUrls = params.uploadedImageUrls ?? [];
  const productData = recordValue(params.productData);
  const selectedProductItems: Record<string, unknown>[] = Array.isArray(productData.productIds)
    ? productData.productIds
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((id) => ({
          productId: id,
          linkedProductId: id,
          quoteLinked: true,
        }))
    : [];
  const productItems = Array.isArray(productData.products)
    ? productData.products.map(recordValue)
    : [];
  const submittedProducts = [...selectedProductItems, ...productItems];
  if (currentStep.widget.kind === "product-card" && submittedProducts.length > 0) {
    const products = Array.isArray(params.formInput.products) ? params.formInput.products : [];
    const nextProducts = submittedProducts.map((item) => {
      const indexes = Array.isArray(item.imageFileIndexes)
        ? item.imageFileIndexes.filter((value): value is number => typeof value === "number")
        : [];
      const imageUrls = indexes
        .map((index) => uploadedImageUrls[index])
        .filter((value): value is string => typeof value === "string" && value.length > 0);
      const nextImageUrls = uniqueList([...listValue(item.imageUrls), ...imageUrls]);
      return {
        ...item,
        imageUrl: textValue(item.imageUrl) || nextImageUrls[0],
        imageUrls: nextImageUrls,
        quoteLinked: true,
      };
    });
    return {
      ...params.formInput,
      products: mergeProductItems(products, nextProducts, productData.mode),
    };
  }
  if (currentStep.widget.kind === "product-card" && Object.keys(productData).length > 0) {
    const products = Array.isArray(params.formInput.products) ? params.formInput.products : [];
    const nextImageUrls = uniqueList([...listValue(productData.imageUrls), ...uploadedImageUrls]);
    return {
      ...params.formInput,
      products: mergeProductItems(products, [
        {
          ...productData,
          imageUrl: textValue(productData.imageUrl) || nextImageUrls[0],
          imageUrls: nextImageUrls,
          quoteLinked: true,
        },
      ], productData.mode),
    };
  }
  if (uploadedImageUrls.length > 0 && currentStep.widget.kind === "file") {
    const existing = fieldValue(params.formInput, field);
    const nextValue = currentStep.widget.multiple
      ? [
          ...(Array.isArray(existing) ? existing.filter((value): value is string => typeof value === "string") : []),
          ...uploadedImageUrls,
        ]
      : uploadedImageUrls[0];
    return setFieldValue(params.formInput, field, nextValue);
  }
  if (uploadedImageUrls.length > 0 && currentStep.widget.kind === "product-card") {
    const products = Array.isArray(params.formInput.products) ? params.formInput.products : [];
    return {
      ...params.formInput,
      products: mergeProductItems(products, [
        {
          name: params.text.slice(0, 80) || "上傳商品",
          description: params.text,
          imageUrl: uploadedImageUrls[0],
          imageUrls: uploadedImageUrls,
        },
      ]),
    };
  }
  if (isSkipRequest(params.text, params.action)) {
    return setFieldValue(params.formInput, field, "由 AI 依目前上下文補第一版");
  }
  if (currentStep.widget.kind === "multi-select-thumb") {
    const existing = normalizeWebsiteStyleList(fieldValue(params.formInput, field));
    const next = normalizeWebsiteStyleValue(params.text);
    const values = next ? Array.from(new Set([...existing, next])).slice(0, currentStep.widget.maxSelect) : existing;
    return setFieldValue(params.formInput, field, values.length > 0 ? values : ["minimal-luxury"]);
  }
  if (currentStep.widget.kind === "product-card") {
    const products = Array.isArray(params.formInput.products) ? params.formInput.products : [];
    return {
      ...params.formInput,
      products: mergeProductItems(products, [
        {
          name: params.text.slice(0, 80),
          description: params.text,
        },
      ]),
    };
  }
  return setFieldValue(params.formInput, field, params.text);
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function listValue(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  if (typeof value === "string" && value.trim().length > 0) return [value.trim()];
  return [];
}

function isLikelyImageUrl(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return false;
  const path = text.split("?")[0].split("#")[0];
  const isRemoteOrUpload =
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("/uploads/") ||
    text.startsWith("/api/");
  if (!isRemoteOrUpload) return false;
  return (
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".png") ||
    path.endsWith(".webp") ||
    path.endsWith(".gif") ||
    path.endsWith(".avif") ||
    text.startsWith("/uploads/")
  );
}

function narrativeValue(value: unknown, fallback = "") {
  const text = textValue(value);
  return text && !isLikelyImageUrl(text) ? text : fallback;
}

function narrativeList(value: unknown) {
  return listValue(value).filter((item) => !isLikelyImageUrl(item));
}

function imageUrlList(value: unknown) {
  return listValue(value).filter(isLikelyImageUrl);
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).slice(0, 12);
}

function firstExistingText(values: unknown[]) {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return "";
}

function specText(specs: Record<string, unknown>, keys: string[]) {
  return firstExistingText(keys.map((key) => specs[key]));
}

function sellerLabel(product: {
  seller?: { display_name?: string | null; company?: { name?: string | null } | null } | null;
}) {
  return firstExistingText([product.seller?.company?.name, product.seller?.display_name]);
}

function priceLabel(product: { price_min?: number | null; price_max?: number | null; currency?: string | null; unit?: string | null }) {
  const currency = product.currency || "USD";
  const unit = product.unit || "pcs";
  if (typeof product.price_min === "number" && typeof product.price_max === "number" && product.price_min !== product.price_max) {
    return `${currency} ${product.price_min}-${product.price_max} / ${unit}`;
  }
  if (typeof product.price_min === "number") return `${currency} ${product.price_min} / ${unit}`;
  if (typeof product.price_max === "number") return `${currency} ${product.price_max} / ${unit}`;
  return "";
}

function productOptionFromDbProduct(product: {
  id: string;
  name: string;
  description?: string | null;
  hs_code?: string | null;
  category?: string | null;
  images: string[];
  specs?: Prisma.JsonValue | null;
  moq: number;
  unit: string;
  price_min?: number | null;
  price_max?: number | null;
  currency: string;
  origin_country?: string | null;
  certifications: string[];
  lead_time_days?: number | null;
  seller?: { display_name?: string | null; company?: { name?: string | null } | null } | null;
}): WebsiteProductOption {
  const specs = recordValue(product.specs);
  const dimensions = [
    specText(specs, ["product_spec_text"]),
    specText(specs, ["unit_length_cm"]) ? `長 ${specText(specs, ["unit_length_cm"])} cm` : "",
    specText(specs, ["unit_width_cm"]) ? `寬 ${specText(specs, ["unit_width_cm"])} cm` : "",
    specText(specs, ["unit_height_cm"]) ? `高 ${specText(specs, ["unit_height_cm"])} cm` : "",
    specText(specs, ["unit_weight_kg"]) ? `重量 ${specText(specs, ["unit_weight_kg"])} kg` : "",
    specText(specs, ["carton_quantity"]) ? `箱入數 ${specText(specs, ["carton_quantity"])}` : "",
    specText(specs, ["carton_net_weight_kg"]) ? `淨重 ${specText(specs, ["carton_net_weight_kg"])} kg` : "",
    specText(specs, ["carton_gross_weight_kg"]) ? `毛重 ${specText(specs, ["carton_gross_weight_kg"])} kg` : "",
  ].filter(Boolean).join(" / ");
  const storage = [
    specText(specs, ["storage_method"]),
    specText(specs, ["temp_control"]),
    specText(specs, ["shelf_life"]),
    specText(specs, ["storage_days"]) ? `保存 ${specText(specs, ["storage_days"])} ${specText(specs, ["storage_unit"])}` : "",
  ].filter(Boolean).join(" / ");
  const compliance = [
    specText(specs, ["ingredients"]),
    specText(specs, ["allergens"]),
    specText(specs, ["nutrition_label"]),
    specText(specs, ["permit_no"]),
    specText(specs, ["food_registration_no"]),
    specText(specs, ["liability_insurance"]),
    specText(specs, ["tax_category"]),
    ...product.certifications,
  ].filter(Boolean).join(" / ");

  return {
    productId: product.id,
    linkedProductId: product.id,
    name: product.name,
    shortDescription: firstExistingText([
      product.description,
      specs.feature_description,
      specs.full_description,
      specs.marketing_claim,
    ]),
    barcode: specText(specs, ["barcode"]) || product.hs_code || "",
    category: product.category || "",
    specs: dimensions,
    quantityRange: specText(specs, ["quantity_range"]) || (product.moq ? `至少 ${product.moq} ${product.unit}` : ""),
    unitPrice: priceLabel(product),
    totalPrice: specText(specs, ["total_price"]) || "依採購數量與報價單計算",
    notes: firstExistingText([
      specs.remarks,
      specs.marketing_claim,
      specs.feature_description,
      product.lead_time_days ? `交期約 ${product.lead_time_days} 天` : "",
    ]),
    origin: product.origin_country || "",
    storageMethod: storage,
    sellerInfo: specText(specs, ["seller_info"]) || sellerLabel(product),
    specialCompliance: compliance,
    returnWarranty: firstExistingText([
      specs.return_policy,
      specs.warranty_policy,
      "依報價單、退換貨與售後保固條款確認",
    ]),
    imageUrl: product.images[0] || "",
    imageUrls: product.images,
    quoteLinked: true,
  };
}

async function listOwnedProductOptions(userId: string) {
  const products = await prisma.product.findMany({
    where: { seller_id: userId, deleted_at: null },
    include: {
      seller: {
        select: {
          display_name: true,
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { updated_at: "desc" },
    take: 50,
  });
  return products.map(productOptionFromDbProduct);
}

function productIdentity(product: Record<string, unknown>) {
  return firstExistingText([product.linkedProductId, product.productId, product.id]);
}

function mergeProductItems(existingProducts: unknown[], nextProducts: Record<string, unknown>[], mode?: unknown) {
  if (mode === "replace") return nextProducts;
  const merged = existingProducts.map(recordValue);
  for (const product of nextProducts) {
    const identity = productIdentity(product);
    const existingIndex = identity
      ? merged.findIndex((item) => productIdentity(item) === identity)
      : -1;
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...product,
        imageUrls: uniqueList([
          ...listValue(merged[existingIndex].imageUrls),
          ...listValue(product.imageUrls),
        ]),
      };
    } else {
      merged.push(product);
    }
  }
  return merged;
}

async function hydrateLinkedProducts(formInput: Record<string, unknown>, userId: string) {
  const products = Array.isArray(formInput.products) ? formInput.products.map(recordValue) : [];
  const linkedIds = products.map(productIdentity).filter((id) => id.length > 0);
  if (linkedIds.length === 0) return formInput;
  const dbProducts = await prisma.product.findMany({
    where: {
      seller_id: userId,
      deleted_at: null,
      id: { in: Array.from(new Set(linkedIds)) },
    },
    include: {
      seller: {
        select: {
          display_name: true,
          company: { select: { name: true } },
        },
      },
    },
  });
  const optionsById = new Map(dbProducts.map((product) => [product.id, productOptionFromDbProduct(product)]));
  return {
    ...formInput,
    products: products.map((product) => {
      const option = optionsById.get(productIdentity(product));
      if (!option) return product;
      return {
        ...option,
        ...product,
        imageUrl: textValue(product.imageUrl) || option.imageUrl,
        imageUrls: uniqueList([...option.imageUrls, ...listValue(product.imageUrls)]),
      };
    }),
  };
}

function collectedProducts(formInput: Record<string, unknown>) {
  return Array.isArray(formInput.products) ? formInput.products.map(recordValue) : [];
}

function productName(product: Record<string, unknown>, index: number) {
  return textValue(product.name, `商品 ${index + 1}`);
}

function productDescription(product: Record<string, unknown>) {
  return (
    textValue(product.shortDescription) ||
    textValue(product.description) ||
    textValue(product.notes) ||
    "依目前商品資料整理第一版介紹文案。"
  );
}

function productImageUrls(products: Record<string, unknown>[], contentNotes: Record<string, unknown>) {
  const productImages = products.flatMap((product) => [
    textValue(product.imageUrl),
    ...listValue(product.imageUrls),
  ]);
  return uniqueList([
    ...productImages,
    ...listValue(contentNotes.heroImages),
  ]);
}

function selectedStyle(formInput: Record<string, unknown>) {
  const design = recordValue(formInput.design);
  const styles = normalizeWebsiteStyleList(design.style);
  return styles[0] || "minimal-luxury";
}

function stylePrimaryColor(style: string) {
  const colors: Record<string, string> = {
    "minimal-luxury": "#2b2620",
    "tech-future": "#5ad7ff",
    "japanese-fresh": "#8f9f73",
    "western-trend": "#111111",
    "commercial-ecommerce": "#126c52",
    "fashion-editorial": "#17120f",
  };
  return colors[normalizeWebsiteStyleValue(style) || style] || colors["minimal-luxury"];
}

function styleProfilePrompt(style: string) {
  const key = normalizeWebsiteStyleValue(style) || "minimal-luxury";
  const profiles: Record<string, string> = {
    "minimal-luxury": [
      "風格：極簡高級。",
      "核心理念：高級、留白、質感、專注品牌本身；降低干擾感，讓畫面有呼吸感與沉穩節奏。",
      "字體：細體、優雅、高字距；無襯線搭配高級襯線字；乾淨、不厚重。",
      "UI：極簡按鈕、細線條、低陰影、卡片感低、少 icon、圓角偏小或直角。",
      "圖片：高質感攝影、柔光、乾淨背景、editorial/campaign 視覺。",
      "關鍵字：minimal luxury, premium, editorial, elegant, whitespace, refined, sophisticated, quiet luxury。",
      "禁止：高彩度、資訊爆量、促銷感、過多 icon、卡通插畫、霓虹、複雜陰影、過度科技感。",
    ].join("\n"),
    "tech-future": [
      "風格：科技未來。",
      "核心理念：科技、創新、智慧化、未來感；強調數位體驗與專業感。",
      "字體：俐落現代無襯線、偏細體或中黑體、字距略寬。",
      "UI：Glassmorphism、科技卡片、發光邊框、半透明元素、線性 icon、幾何數位圖示。",
      "圖片：抽象科技光效、數位介面、AI 生成圖形、Dashboard、3D 科技場景。",
      "關鍵字：futuristic, ai technology, modern ui, glassmorphism, digital experience, high tech, dashboard, innovation。",
      "禁止：復古、手繪、鄉村、大量花紋、過度卡通、資訊雜亂、低解析科技素材。",
    ].join("\n"),
    "japanese-fresh": [
      "風格：日系清新。",
      "核心理念：自然、溫暖、療癒、輕盈、生活感；降低商業壓迫感。",
      "字體：乾淨細字、柔和無襯線、高行距、適度留白。",
      "UI：簡約按鈕、柔和區塊、低對比、細線條、圓角、自然幾何。",
      "圖片：自然光攝影、日常場景、木質布料材質、暖光、柔焦、真實生活感。",
      "關鍵字：japanese minimal, natural lifestyle, soft aesthetic, organic, warm light, airy layout, healing, muji style。",
      "禁止：強烈霓虹、高對比、大量科技光效、資訊爆量、厚重陰影、強促銷、街頭潮流。",
    ].join("\n"),
    "western-trend": [
      "風格：歐美潮流。",
      "核心理念：潮流、個性、張力、自由感、年輕文化；強烈品牌識別。",
      "字體：粗體、大字體、高對比字重；可用歐美街頭、運動、時尚字體。",
      "UI：高對比按鈕、粗線條、潮流圖形元素、貼紙感、視覺裝飾。",
      "圖片：街頭攝影、運動感、潮流時尚、高對比光影、動態姿勢、拼貼、閃光燈感。",
      "關鍵字：streetwear, bold typography, trendy, fashion campaign, dynamic layout, urban style, youth culture, high contrast。",
      "禁止：過度留白、過於安靜、傳統企業感、低對比、過度溫柔療癒、老派、制式電商。",
    ].join("\n"),
    "commercial-ecommerce": [
      "風格：商業電商。",
      "核心理念：清楚、快速、好理解、強調商品價值；降低思考成本，目的為購買與詢價轉換。",
      "字體：高可讀性無襯線、層級明顯；價格、標題、優惠資訊辨識度高。",
      "UI：按鈕明顯、購物流程清楚、功能 icon、卡片式設計、標籤與優惠視覺。",
      "圖片：商品情境照、去背商品圖、使用結果、商業攝影、廣告構圖。",
      "關鍵字：ecommerce, conversion focused, product showcase, shopping experience, cta driven, product banner, online store。",
      "禁止：過度留白、資訊不足、動線不清、過度藝術化、弱 CTA、實驗性 UI、過度高冷精品感。",
    ].join("\n"),
    "fashion-editorial": [
      "風格：時尚雜誌。",
      "核心理念：時尚、構圖感、品牌故事、視覺節奏；像高級品牌雜誌。",
      "字體：高級襯線搭配簡約無襯線；大字級對比、字距、版面呼吸感、editorial typography。",
      "UI：UI 存在感低，內容導向與品牌展示；極簡細線條 icon。",
      "圖片：fashion photography、campaign 視覺、情緒攝影、光影、姿態、氛圍。",
      "關鍵字：fashion editorial, magazine layout, editorial typography, luxury branding, campaign aesthetic, storytelling, high fashion。",
      "禁止：強促銷、資訊爆量、過度科技 UI、傳統企業感、卡通插畫、大量功能 icon、制式電商。",
    ].join("\n"),
  };
  return profiles[key] || profiles["minimal-luxury"];
}

function fallbackThemeTokens(style: string, accent: string) {
  const key = normalizeWebsiteStyleValue(style) || "minimal-luxury";
  const themes: Record<string, { bg: string; panel: string; ink: string; muted: string; line: string; shadow: string }> = {
    "minimal-luxury": {
      bg: "#f7f4ef",
      panel: "#fffdf8",
      ink: "#211d18",
      muted: "#756d63",
      line: "rgba(33,29,24,.12)",
      shadow: "0 22px 64px rgba(33,29,24,.08)",
    },
    "tech-future": {
      bg: "#071115",
      panel: "#0d1b21",
      ink: "#effbff",
      muted: "#a7bdc5",
      line: "rgba(90,215,255,.18)",
      shadow: "0 28px 84px rgba(32,185,220,.18)",
    },
    "japanese-fresh": {
      bg: "#f7f4ec",
      panel: "#fffdf6",
      ink: "#20221d",
      muted: "#737565",
      line: "rgba(97,103,79,.12)",
      shadow: "0 24px 70px rgba(100,105,80,.09)",
    },
    "western-trend": {
      bg: "#f3f0e9",
      panel: "#fffaf0",
      ink: "#111111",
      muted: "#5b5650",
      line: "rgba(17,17,17,.18)",
      shadow: "0 24px 72px rgba(17,17,17,.14)",
    },
    "commercial-ecommerce": {
      bg: "#f3f7f2",
      panel: "#ffffff",
      ink: "#14211b",
      muted: "#5f6f66",
      line: "rgba(18,108,82,.16)",
      shadow: "0 24px 70px rgba(18,108,82,.12)",
    },
    "fashion-editorial": {
      bg: "#11100e",
      panel: "#1a1714",
      ink: "#f8f1e7",
      muted: "#c8bba8",
      line: "rgba(248,241,231,.16)",
      shadow: "0 34px 90px rgba(0,0,0,.34)",
    },
  };
  return { accent, ...(themes[key] || themes["minimal-luxury"]) };
}

function styleThemeTokens(schema: SiteSchema, accent: string) {
  const fallback = fallbackThemeTokens(schema.design_style || "", accent);
  const tokens = schema.design_tokens || {};
  const theme = {
    accent: tokens.accent || accent || fallback.accent,
    bg: tokens.bg || fallback.bg,
    panel: tokens.panel || fallback.panel,
    ink: tokens.ink || fallback.ink,
    muted: tokens.muted || fallback.muted,
    line: tokens.line || fallback.line,
    shadow: tokens.shadow || fallback.shadow,
  };
  return `--accent:${escapeHtml(theme.accent)};--bg:${escapeHtml(theme.bg)};--panel:${escapeHtml(theme.panel)};--ink:${escapeHtml(theme.ink)};--muted:${escapeHtml(theme.muted)};--line:${escapeHtml(theme.line)};--shadow:${escapeHtml(theme.shadow)}`;
}

type WebsiteTemplateFamily = "product" | "brand";

type WebsiteLayoutPlan = {
  family: WebsiteTemplateFamily;
  hero: "hero.h1" | "hero.h2" | "hero.h3";
  painpoint: "painpoint.p1" | "painpoint.p2" | "painpoint.p3";
  solution: "solution.s1" | "solution.s2" | "solution.s3";
  details: "details.d1" | "details.d2" | "details.d3";
  proof: "proof.sp1" | "proof.sp2" | "proof.sp3";
  closing: "closing.c1" | "closing.c2" | "closing.c3";
};

function websiteTemplateFamily(siteIntent: WebsiteSiteIntent): WebsiteTemplateFamily {
  return siteIntent === "brand_story" || siteIntent === "company_profile" ? "brand" : "product";
}

function layoutPlanFor(siteIntent: WebsiteSiteIntent, style: string): WebsiteLayoutPlan {
  const family = websiteTemplateFamily(siteIntent);
  const byStyle: Record<string, Omit<WebsiteLayoutPlan, "family">> = {
    "minimal-luxury": {
      hero: "hero.h1",
      painpoint: "painpoint.p1",
      solution: "solution.s1",
      details: "details.d1",
      proof: "proof.sp1",
      closing: "closing.c1",
    },
    "tech-future": {
      hero: "hero.h2",
      painpoint: "painpoint.p2",
      solution: "solution.s3",
      details: "details.d2",
      proof: "proof.sp3",
      closing: "closing.c2",
    },
    "japanese-fresh": {
      hero: "hero.h1",
      painpoint: "painpoint.p1",
      solution: "solution.s3",
      details: "details.d1",
      proof: "proof.sp1",
      closing: "closing.c3",
    },
    "western-trend": {
      hero: "hero.h3",
      painpoint: "painpoint.p3",
      solution: "solution.s1",
      details: "details.d3",
      proof: "proof.sp3",
      closing: "closing.c3",
    },
    "commercial-ecommerce": {
      hero: "hero.h2",
      painpoint: "painpoint.p2",
      solution: "solution.s2",
      details: "details.d2",
      proof: "proof.sp2",
      closing: "closing.c2",
    },
    "fashion-editorial": {
      hero: "hero.h3",
      painpoint: "painpoint.p1",
      solution: "solution.s1",
      details: "details.d3",
      proof: "proof.sp2",
      closing: "closing.c1",
    },
  };
  const plan = byStyle[normalizeWebsiteStyleValue(style) || style] || byStyle["minimal-luxury"];
  if (siteIntent === "sales_page") {
    return {
      family,
      ...plan,
      solution: plan.solution === "solution.s1" ? "solution.s2" : plan.solution,
      closing: plan.closing === "closing.c1" ? "closing.c2" : plan.closing,
    };
  }
  return { family, ...plan };
}

const HERO_VARIANTS = ["hero.h1", "hero.h2", "hero.h3"] as const;
const PAINPOINT_VARIANTS = ["painpoint.p1", "painpoint.p2", "painpoint.p3"] as const;
const SOLUTION_VARIANTS = ["solution.s1", "solution.s2", "solution.s3"] as const;
const DETAILS_VARIANTS = ["details.d1", "details.d2", "details.d3"] as const;
const PROOF_VARIANTS = ["proof.sp1", "proof.sp2", "proof.sp3"] as const;
const CLOSING_VARIANTS = ["closing.c1", "closing.c2", "closing.c3"] as const;

type WebsiteVisualDirection = {
  primaryColor?: string;
  designBrief?: string;
  designTokens?: SiteSchema["design_tokens"];
  layoutPlan?: Partial<WebsiteLayoutPlan>;
};

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function normalizeCssColor(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  if (text.startsWith("#") || text.startsWith("rgb") || text.startsWith("hsl")) return text;
  return "";
}

function normalizeDesignTokens(value: unknown): SiteSchema["design_tokens"] {
  const record = recordValue(value);
  return {
    bg: normalizeCssColor(record.bg) || undefined,
    panel: normalizeCssColor(record.panel) || undefined,
    ink: normalizeCssColor(record.ink) || undefined,
    muted: normalizeCssColor(record.muted) || undefined,
    accent: normalizeCssColor(record.accent) || undefined,
    line: typeof record.line === "string" && record.line.trim() ? record.line.trim() : undefined,
    shadow: typeof record.shadow === "string" && record.shadow.trim() ? record.shadow.trim() : undefined,
  };
}

function normalizeVisualLayoutPlan(value: unknown, fallback: WebsiteLayoutPlan): WebsiteLayoutPlan {
  const record = recordValue(value);
  return {
    family: fallback.family,
    hero: oneOf(record.hero, HERO_VARIANTS, fallback.hero),
    painpoint: oneOf(record.painpoint, PAINPOINT_VARIANTS, fallback.painpoint),
    solution: oneOf(record.solution, SOLUTION_VARIANTS, fallback.solution),
    details: oneOf(record.details, DETAILS_VARIANTS, fallback.details),
    proof: oneOf(record.proof, PROOF_VARIANTS, fallback.proof),
    closing: oneOf(record.closing, CLOSING_VARIANTS, fallback.closing),
  };
}

async function buildVisualDirection(params: {
  siteIntent: WebsiteSiteIntent;
  formInput: Record<string, unknown>;
  products: Record<string, unknown>[];
  contentNotes: Record<string, unknown>;
  style: string;
  fallbackLayoutPlan: WebsiteLayoutPlan;
}): Promise<WebsiteVisualDirection> {
  const styleKey = normalizeWebsiteStyleValue(params.style) || "minimal-luxury";
  const fallbackTokens = fallbackThemeTokens(styleKey, stylePrimaryColor(styleKey));
  try {
    const result = await flexionCompleteJSON<{
      primaryColor?: unknown;
      designBrief?: unknown;
      designTokens?: unknown;
      layoutPlan?: unknown;
    }>({
      model: pickModel({ plan: "pro", taskHint: "complex" }),
      temperature: 0.75,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content: [
            "你是高階品牌網站 art director。請只輸出 JSON。",
            "你要根據風格規格、品牌/商品資料、圖片素材，動態產生一頁式網站的視覺方向。",
            "不要套固定色票；請依內容選擇有質感且可讀的 palette。",
            "不要改文案，不要生成 HTML，只輸出視覺 token 與 layout variant。",
            "可用 layout variant：hero.h1/h2/h3, painpoint.p1/p2/p3, solution.s1/s2/s3, details.d1/d2/d3, proof.sp1/sp2/sp3, closing.c1/c2/c3。",
            "designTokens 必須給 bg, panel, ink, muted, line, shadow, accent。line/shadow 可用 rgba 或 CSS shadow 字串。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            styleKey,
            styleProfile: styleProfilePrompt(styleKey),
            siteIntent: params.siteIntent,
            products: params.products.slice(0, 5),
            contentNotes: params.contentNotes,
            currentFallback: {
              primaryColor: fallbackTokens.accent,
              designTokens: fallbackTokens,
              layoutPlan: params.fallbackLayoutPlan,
            },
            expectedJson: {
              primaryColor: "#000000",
              designBrief: "一句話描述此網站的視覺策略與節奏。",
              designTokens: {
                bg: "#ffffff",
                panel: "#ffffff",
                ink: "#111111",
                muted: "#666666",
                line: "rgba(17,17,17,.12)",
                shadow: "0 20px 60px rgba(0,0,0,.08)",
                accent: "#111111",
              },
              layoutPlan: {
                hero: "hero.h1",
                painpoint: "painpoint.p1",
                solution: "solution.s1",
                details: "details.d1",
                proof: "proof.sp1",
                closing: "closing.c1",
              },
            },
          }),
        },
      ],
    });

    const primaryColor = normalizeCssColor(result.data.primaryColor) || normalizeCssColor(recordValue(result.data.designTokens).accent);
    return {
      primaryColor: primaryColor || undefined,
      designBrief: typeof result.data.designBrief === "string" ? result.data.designBrief.trim() : undefined,
      designTokens: normalizeDesignTokens(result.data.designTokens),
      layoutPlan: normalizeVisualLayoutPlan(result.data.layoutPlan, params.fallbackLayoutPlan),
    };
  } catch {
    return {
      primaryColor: fallbackTokens.accent,
      designBrief: styleProfilePrompt(styleKey).split("\n")[0],
      designTokens: fallbackTokens,
      layoutPlan: params.fallbackLayoutPlan,
    };
  }
}

function quoteLine(label: string, value: unknown) {
  const text = textValue(value);
  return text ? `${label}：${text}` : "";
}

function productQuoteBody(product: Record<string, unknown>) {
  return [
    quoteLine("分類", product.category),
    quoteLine("國際條碼", product.barcode),
    quoteLine("規格", product.specs),
    quoteLine("數量", product.quantityRange),
    quoteLine("單價", product.unitPrice),
    quoteLine("總價", product.totalPrice),
    quoteLine("備註", product.notes),
    quoteLine("產地", product.origin),
    quoteLine("保存方式", product.storageMethod),
    quoteLine("賣家資訊", product.sellerInfo),
    quoteLine("特殊商品標示", product.specialCompliance),
    quoteLine("退換貨與售後保固", product.returnWarranty),
  ].filter(Boolean).join("\n");
}

function productSections(params: {
  siteIntent: WebsiteSiteIntent;
  products: Record<string, unknown>[];
  contentNotes: Record<string, unknown>;
  images: string[];
  layoutPlan: WebsiteLayoutPlan;
}) {
  const firstProduct = params.products[0] || {};
  const firstName = productName(firstProduct, 0);
  const title = params.siteIntent === "sales_page"
    ? `${firstName} 導購銷售頁`
    : `${firstName} 商品介紹頁`;
  const heroTitle = params.siteIntent === "sales_page"
    ? `讓客戶快速理解 ${firstName} 的價值並完成詢價`
    : `把 ${firstName} 的商品價值說清楚`;
  const productItems = params.products.map((product, index) => ({
    title: productName(product, index),
    body: productDescription(product),
    image_url: textValue(product.imageUrl) || listValue(product.imageUrls)[0],
  }));
  const sections: SitePageSection[] = [
    {
      type: "hero",
      layoutVariant: params.layoutPlan.hero,
      variantFamily: params.layoutPlan.family,
      title: heroTitle,
      body: productDescription(firstProduct),
      image_url: params.images[0],
      button_label: "立即詢價",
    },
    {
      type: "features",
      layoutVariant: params.layoutPlan.painpoint,
      variantFamily: params.layoutPlan.family,
      title: params.siteIntent === "sales_page" ? "主推商品與轉換重點" : "商品亮點",
      body: textValue(params.contentNotes.productKeywords, "依商品資料整理成可直接放進一頁式網站的賣點。"),
      items: productItems,
    },
    {
      type: "products",
      layoutVariant: params.layoutPlan.solution,
      variantFamily: params.layoutPlan.family,
      title: params.siteIntent === "sales_page" ? "精選方案與成交理由" : "精選商品",
      body: textValue(params.contentNotes.productStory, "把商品價值、使用情境與可採購理由拆成更容易閱讀的網站區塊。"),
      items: productItems,
    },
    {
      type: "productDetails",
      layoutVariant: params.layoutPlan.details,
      variantFamily: params.layoutPlan.family,
      title: "商品規格與報價資訊",
      body: "以下內容會和報價單資料連動，方便後續整理詢價與成交資訊。",
      items: params.products.map((product, index) => ({
        title: productName(product, index),
        body: productQuoteBody(product),
        image_url: textValue(product.imageUrl) || listValue(product.imageUrls)[0],
      })),
    },
  ];

  const story = textValue(params.contentNotes.productStory);
  if (story) {
    sections.push({
      type: "story",
      layoutVariant: params.layoutPlan.details,
      variantFamily: params.layoutPlan.family,
      title: "商品故事與使用情境",
      body: story,
      image_url: params.images[1],
    });
  }

  const proof = textValue(params.contentNotes.socialProof);
  sections.push({
    type: "socialProof",
    layoutVariant: params.layoutPlan.proof,
    variantFamily: params.layoutPlan.family,
    title: "信任背書與採購判斷",
    body: proof || "整理評價、認證、案例或可驗證資訊，讓客戶在詢價前更容易建立信任。",
    items: proof
      ? [proof]
      : params.products.slice(0, 3).map((product, index) => ({
          title: index === 0 ? "商品資料完整" : index === 1 ? "規格清楚可比對" : "可直接進入詢價",
          body: productDescription(product),
          image_url: textValue(product.imageUrl) || listValue(product.imageUrls)[0],
        })),
  });

  const faq = textValue(params.contentNotes.faqNotes);
  if (faq) {
    sections.push({
      type: "faq",
      title: "常見問題",
      items: [faq],
    });
  }

  sections.push({
    type: "closingInfo",
    layoutVariant: params.layoutPlan.closing,
    variantFamily: params.layoutPlan.family,
    title: "需要完整報價單？",
    body: "已依商品名稱、規格、數量、產地、保存方式、賣家資訊與售後條款整理成可詢價的一頁式內容；價格未填寫時，網站不會強制顯示。",
    button_label: "索取報價",
  });

  return { title, sections };
}

function brandSections(params: {
  siteIntent: WebsiteSiteIntent;
  contentNotes: Record<string, unknown>;
  images: string[];
  layoutPlan: WebsiteLayoutPlan;
}) {
  const serviceHighlights = narrativeValue(params.contentNotes.serviceHighlights);
  const brandValues = narrativeValue(params.contentNotes.brandValues);
  const caseStudyTexts = narrativeList(params.contentNotes.caseStudies);
  const caseStudyImages = imageUrlList(params.contentNotes.caseStudies);
  const teamTrust = narrativeValue(params.contentNotes.teamTrust);
  const teamTrustImages = imageUrlList(params.contentNotes.teamTrust);
  const brandImages = uniqueList([...params.images, ...caseStudyImages, ...teamTrustImages]);
  const caseStudySummary = caseStudyTexts[0] || "";
  const title = params.siteIntent === "company_profile" ? "公司介紹網站" : "品牌形象網站";
  const heroTitle = params.siteIntent === "company_profile"
    ? "讓客戶快速理解你的服務、案例與合作方式"
    : "把品牌理念、風格與信任感一次說清楚";
  const sections: SitePageSection[] = [
    {
      type: "hero",
      layoutVariant: params.layoutPlan.hero,
      variantFamily: params.layoutPlan.family,
      title: heroTitle,
      body: serviceHighlights || brandValues || "依目前素材整理品牌形象與服務亮點。",
      image_url: brandImages[0],
      button_label: "聯絡我們",
    },
  ];

  sections.push({
    type: "features",
    layoutVariant: params.layoutPlan.painpoint,
    variantFamily: params.layoutPlan.family,
    title: "服務與主打內容",
    body: serviceHighlights || "整理品牌最重要的服務、作品方向與合作價值，避免落入一般問答式介紹。",
  });

  sections.push({
    type: "products",
    layoutVariant: params.layoutPlan.solution,
    variantFamily: params.layoutPlan.family,
    title: params.siteIntent === "company_profile" ? "服務方案與合作入口" : "品牌風格與內容主軸",
    body:
      serviceHighlights ||
      brandValues ||
      "用三個可理解的角度呈現品牌能提供的服務、風格與合作方式。",
    items: [
      {
        title: "定位清楚",
        body: brandValues || "把品牌理念轉成可閱讀的網站敘事。",
        image_url: brandImages[0],
      },
      {
        title: "服務可理解",
        body: serviceHighlights || "讓客戶快速知道你能提供什麼。",
        image_url: brandImages[1],
      },
      {
        title: "案例可延展",
        body: caseStudySummary || "保留後續放入作品與案例的位置。",
        image_url: caseStudyImages[0] || brandImages[2],
      },
    ],
  });

  if (caseStudyImages.length > 0 || caseStudyTexts.length > 0) {
    sections.push({
      type: "gallery",
      layoutVariant: params.layoutPlan.proof,
      variantFamily: params.layoutPlan.family,
      title: "作品與案例",
      items: (caseStudyImages.length > 0 ? caseStudyImages : brandImages).slice(0, 6).map((image, index) => ({
        title: `案例 ${index + 1}`,
        body: caseStudyTexts[index] || "可作為網站中段的作品展示素材。",
        image_url: image,
      })),
    });
  }

  sections.push({
    type: "productDetails",
    layoutVariant: params.layoutPlan.details,
    variantFamily: params.layoutPlan.family,
    title: "品牌理念",
    body: brandValues || "把品牌理念、視覺語氣與服務態度整理成一段可放進網站中段的核心敘事。",
    image_url: brandImages[1],
  });

  sections.push({
    type: "socialProof",
    layoutVariant: params.layoutPlan.proof,
    variantFamily: params.layoutPlan.family,
    title: "團隊與信任基礎",
    body: teamTrust || caseStudySummary || "保留作品案例、團隊資歷、合作成果或客戶背書的位置，方便後續補素材。",
    image_url: teamTrustImages[0] || brandImages[2],
    items: [
      {
        title: "團隊與信任基礎",
        body: teamTrust || caseStudySummary || "補上團隊資歷、合作成果、客戶背書或代表案例。",
        image_url: teamTrustImages[0] || brandImages[2],
      },
    ],
  });

  sections.push({
    type: "closingInfo",
    layoutVariant: params.layoutPlan.closing,
    variantFamily: params.layoutPlan.family,
    title: "想了解合作方式？",
    body: textValue(params.contentNotes.contactNotes, "留下需求後，我們可以依服務內容與案例方向安排下一步。"),
    button_label: "聯絡我們",
  });

  return { title, sections };
}

async function buildGeneratedSiteSchema(params: {
  siteIntent: WebsiteSiteIntent;
  formInput: Record<string, unknown>;
}) {
  const contentNotes = recordValue(params.formInput.contentNotes);
  const assets = recordValue(params.formInput.assets);
  const products = collectedProducts(params.formInput);
  const images = productImageUrls(products, contentNotes);
  const style = selectedStyle(params.formInput);
  const fallbackLayoutPlan = layoutPlanFor(params.siteIntent, style);
  const visualDirection = await buildVisualDirection({
    siteIntent: params.siteIntent,
    formInput: params.formInput,
    products,
    contentNotes,
    style,
    fallbackLayoutPlan,
  });
  const layoutPlan = visualDirection.layoutPlan
    ? normalizeVisualLayoutPlan(visualDirection.layoutPlan, fallbackLayoutPlan)
    : fallbackLayoutPlan;
  const generated = params.siteIntent === "product_intro" || params.siteIntent === "sales_page"
    ? productSections({ siteIntent: params.siteIntent, products, contentNotes, images, layoutPlan })
    : brandSections({ siteIntent: params.siteIntent, contentNotes, images, layoutPlan });
  const firstProduct = products[0] || {};
  const title = textValue(generated.title, websiteIntentLabel(params.siteIntent));
  const tagline = products.length > 0
    ? productDescription(firstProduct)
    : textValue(contentNotes.serviceHighlights) ||
      textValue(contentNotes.brandValues) ||
      "依模板資料產生的一頁式網站初稿。";

  return {
    title,
    tagline,
    primary_color: visualDirection.primaryColor || stylePrimaryColor(style),
    logo_url: textValue(assets.logoUrl) || undefined,
    design_style: style,
    design_brief: visualDirection.designBrief,
    design_tokens: visualDirection.designTokens,
    site_intent: params.siteIntent,
    product_images: images,
    product: {
      linked_product_name: products.length > 0 ? productName(firstProduct, 0) : undefined,
    },
    inquiry_cta_label: params.siteIntent === "sales_page" ? "索取報價" : "立即詢價",
    inquiry_cta_note: params.siteIntent === "brand_story" || params.siteIntent === "company_profile"
      ? textValue(contentNotes.contactNotes, "想了解服務內容、作品案例或合作方式，歡迎聯絡我們。")
      : "想了解規格、報價、MOQ、交期或合作方式，歡迎立即詢價。",
    seo: {
      title,
      description: tagline,
      og_image: images[0],
    },
    integrations: {},
    sections: generated.sections,
  } satisfies SiteSchema;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sectionItemsHtml(items: SitePageSection["items"] | undefined) {
  if (!items || items.length === 0) return "";
  return items.map((item) => {
    if (typeof item === "string") {
      return `<article class="card"><p>${escapeHtml(item)}</p></article>`;
    }
    return [
      `<article class="card">`,
      item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title || "網站圖片")}" loading="lazy">` : "",
      `<div class="card-body">`,
      item.title ? `<h3>${escapeHtml(item.title)}</h3>` : "",
      item.body ? `<p>${escapeHtml(item.body)}</p>` : "",
      `</div>`,
      `</article>`,
    ].join("");
  }).join("");
}

function sectionVariantClass(section: SitePageSection) {
  const value = section.layoutVariant || section.type;
  return `variant-${value.replaceAll(".", "-")}`;
}

function sectionFamilyClass(section: SitePageSection) {
  return section.variantFamily === "brand" ? "family-brand" : "family-product";
}

function sectionEyebrow(section: SitePageSection) {
  const labels: Record<SitePageSection["type"], string> = {
    hero: "Hero",
    features: "Painpoint",
    products: "Solution",
    productDetails: "Details",
    socialProof: "Proof",
    closingInfo: "Decision",
    cta: "Action",
    faq: "FAQ",
    testimonials: "Voices",
    story: "Story",
    gallery: "Works",
    specs: "Specs",
    inquiry: "Inquiry",
  };
  return labels[section.type] || section.type;
}

function sectionTone(index: number) {
  return index % 2 === 0 ? "quiet" : "contrast";
}

function sectionItemRecords(section: SitePageSection) {
  return (section.items || []).map((item, index) => {
    if (typeof item === "string") {
      return {
        title: `${sectionEyebrow(section)} ${index + 1}`,
        body: isLikelyImageUrl(item) ? "" : item,
        image_url: isLikelyImageUrl(item) ? item : "",
      };
    }
    const titleText = item.title || `${sectionEyebrow(section)} ${index + 1}`;
    const bodyText = item.body || "";
    const titleIsImage = isLikelyImageUrl(titleText);
    const bodyIsImage = isLikelyImageUrl(bodyText);
    return {
      title: titleIsImage ? `${sectionEyebrow(section)} ${index + 1}` : titleText,
      body: bodyIsImage ? "" : bodyText,
      image_url: item.image_url || (titleIsImage ? titleText : "") || (bodyIsImage ? bodyText : ""),
    };
  });
}

function firstSectionImage(section: SitePageSection, fallback = "") {
  return section.image_url || sectionItemRecords(section).find((item) => item.image_url)?.image_url || fallback;
}

function imageOrMark(src: string, label: string, className: string) {
  return src
    ? `<figure class="${className}"><img src="${escapeHtml(src)}" alt="${escapeHtml(label)}" loading="lazy"></figure>`
    : `<figure class="${className} image-mark"><span>${escapeHtml(label.slice(0, 2))}</span></figure>`;
}

function sectionHeaderHtml(section: SitePageSection, fallbackTitle: string) {
  const body = narrativeValue(section.body);
  return [
    `<div class="module-head">`,
    `<p class="eyebrow">${escapeHtml(sectionEyebrow(section))}</p>`,
    `<h2>${escapeHtml(section.title || fallbackTitle)}</h2>`,
    body ? `<p>${escapeHtml(body)}</p>` : "",
    `</div>`,
  ].join("");
}

function renderHeroModule(section: SitePageSection, schema: SiteSchema, heroImage: string) {
  const variant = section.layoutVariant || "hero.h1";
  const family = section.variantFamily === "brand" ? "brand" : "product";
  const title = section.title || schema.title;
  const body = section.body || schema.tagline;
  const image = section.image_url || heroImage;
  const cta = section.button_label || schema.inquiry_cta_label || "立即詢價";
  const mark = schema.logo_url
    ? `<img class="hero-logo" src="${escapeHtml(schema.logo_url)}" alt="${escapeHtml(schema.title)} logo">`
    : `<span class="hero-mark">${escapeHtml(schema.title.slice(0, 2))}</span>`;

  if (variant === "hero.h2") {
    return [
      `<section class="site-module hero-module hero-overlay family-${family} ${sectionVariantClass(section)}">`,
      imageOrMark(image, title, "hero-bg"),
      `<div class="hero-overlay-card">`,
      `<div class="hero-brand">${mark}<span>${escapeHtml(schema.title)}</span></div>`,
      `<p class="eyebrow">${escapeHtml(family === "brand" ? "Brand Story" : "Launch")}</p>`,
      `<h1>${escapeHtml(title)}</h1>`,
      `<p>${escapeHtml(body)}</p>`,
      `<a class="button" href="#inquiry">${escapeHtml(cta)}</a>`,
      `</div>`,
      `</section>`,
    ].join("");
  }

  if (variant === "hero.h3") {
    return [
      `<section class="site-module hero-module hero-stacked family-${family} ${sectionVariantClass(section)}">`,
      `<div class="hero-stacked-top"><div class="hero-brand">${mark}<span>${escapeHtml(schema.title)}</span></div><span>${escapeHtml(schema.design_style || "")}</span></div>`,
      imageOrMark(image, title, "hero-wide-media"),
      `<div class="hero-stacked-copy">`,
      `<p class="eyebrow">${escapeHtml(family === "brand" ? "Editorial Identity" : "Product Focus")}</p>`,
      `<h1>${escapeHtml(title)}</h1>`,
      `<p>${escapeHtml(body)}</p>`,
      `<a class="button" href="#inquiry">${escapeHtml(cta)}</a>`,
      `</div>`,
      `</section>`,
    ].join("");
  }

  return [
    `<section class="site-module hero-module hero-split family-${family} ${sectionVariantClass(section)}">`,
    `<div class="hero-copy">`,
    `<div class="hero-brand">${mark}<span>${escapeHtml(schema.title)}</span></div>`,
    `<p class="eyebrow">${escapeHtml(family === "brand" ? "Identity System" : "Commerce Page")}</p>`,
    `<h1>${escapeHtml(title)}</h1>`,
    `<p>${escapeHtml(body)}</p>`,
    `<a class="button" href="#inquiry">${escapeHtml(cta)}</a>`,
    `</div>`,
    `<div class="hero-visual-wrap">`,
    imageOrMark(image, title, "hero-main-media"),
    `<div class="hero-floating-note">${escapeHtml(family === "brand" ? "品牌敘事 / 服務 / 信任" : "商品 / 規格 / 詢價")}</div>`,
    `</div>`,
    `</section>`,
  ].join("");
}

function renderPainpointModule(section: SitePageSection, index: number, heroImage: string) {
  const variant = section.layoutVariant || "painpoint.p1";
  const family = section.variantFamily === "brand" ? "brand" : "product";
  const items = sectionItemRecords(section);
  const image = firstSectionImage(section, heroImage);
  const rows = items.length > 0 ? items : [{ title: "重點一", body: section.body || "整理目前資料成可閱讀的重點。", image_url: image }];

  if (variant === "painpoint.p2") {
    const left = rows.slice(0, 3);
    const right = rows.slice(3, 6);
    return [
      `<section class="site-module content-module painpoint-compare family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "服務內容" : "痛點與解法"),
      `<div class="compare-board">`,
      `<div><span>${escapeHtml(family === "brand" ? "現在能提供" : "客戶在意")}</span>${left.map((item) => `<p>${escapeHtml(item.title)}<small>${escapeHtml(item.body)}</small></p>`).join("")}</div>`,
      `<div><span>${escapeHtml(family === "brand" ? "網站要呈現" : "頁面要回答")}</span>${(right.length ? right : left).map((item) => `<p>${escapeHtml(item.title)}<small>${escapeHtml(item.body)}</small></p>`).join("")}</div>`,
      `</div>`,
      `</section>`,
    ].join("");
  }

  if (variant === "painpoint.p3") {
    return [
      `<section class="site-module content-module painpoint-stat family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "案例與感受" : "核心判斷"),
      `<div class="stat-layout">`,
      `<div class="stat-circle"><strong>${escapeHtml(rows[0]?.title || "01")}</strong><span>${escapeHtml(rows[0]?.body || section.body || "")}</span></div>`,
      `<div class="polaroid-stack">${rows.slice(0, 3).map((item, itemIndex) => imageOrMark(item.image_url || image, item.title, `polaroid p-${itemIndex}`)).join("")}</div>`,
      `</div>`,
      `</section>`,
    ].join("");
  }

  return [
    `<section class="site-module content-module painpoint-list family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
    `<div>`,
    sectionHeaderHtml(section, family === "brand" ? "服務內容" : "商品亮點"),
    `<div class="bullet-list">${rows.slice(0, 5).map((item, itemIndex) => `<article><span>${String(itemIndex + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div></article>`).join("")}</div>`,
    `</div>`,
    imageOrMark(image, section.title || "網站圖片", "side-media"),
    `</section>`,
  ].join("");
}

function renderSolutionModule(section: SitePageSection, index: number, heroImage: string) {
  const variant = section.layoutVariant || "solution.s1";
  const family = section.variantFamily === "brand" ? "brand" : "product";
  const items = sectionItemRecords(section);
  const rows = items.length > 0 ? items : [{ title: section.title || "方案", body: section.body || "", image_url: firstSectionImage(section, heroImage) }];
  const image = firstSectionImage(section, heroImage);

  if (variant === "solution.s2") {
    const focus = rows[0];
    return [
      `<section class="site-module content-module solution-focus family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "服務方案" : "主推商品"),
      `<div class="focus-layout">`,
      `<aside><span>01</span><strong>${escapeHtml(family === "brand" ? "定位" : "主賣點")}</strong><p>${escapeHtml(section.body || focus.body)}</p></aside>`,
      `<article class="focus-card">${imageOrMark(focus.image_url || image, focus.title, "focus-media")}<h3>${escapeHtml(focus.title)}</h3><p>${escapeHtml(focus.body)}</p></article>`,
      `<aside><span>02</span><strong>${escapeHtml(family === "brand" ? "合作入口" : "詢價理由")}</strong><p>${escapeHtml(rows[1]?.body || "把下一步行動放在清楚的位置。")}</p></aside>`,
      `</div>`,
      `</section>`,
    ].join("");
  }

  if (variant === "solution.s3") {
    return [
      `<section class="site-module content-module solution-list family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "流程與服務" : "方案摘要"),
      `<div class="solution-list-grid">`,
      `<div class="solution-bullets">${rows.slice(0, 4).map((item, itemIndex) => `<article><span>${String(itemIndex + 1).padStart(2, "0")}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join("")}</div>`,
      imageOrMark(image, section.title || "主視覺", "solution-large"),
      `</div>`,
      `</section>`,
    ].join("");
  }

  return [
    `<section class="site-module content-module solution-cards family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
    sectionHeaderHtml(section, family === "brand" ? "品牌風格與內容主軸" : "精選商品"),
    `<div class="card-grid">${rows.map((item, itemIndex) => `<article class="module-card" style="--i:${itemIndex}">${imageOrMark(item.image_url, item.title, "card-media")}<div><span>${String(itemIndex + 1).padStart(2, "0")}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div></article>`).join("")}</div>`,
    `</section>`,
  ].join("");
}

function renderDetailsModule(section: SitePageSection, index: number, heroImage: string) {
  const variant = section.layoutVariant || "details.d1";
  const family = section.variantFamily === "brand" ? "brand" : "product";
  const items = sectionItemRecords(section);
  const rows = items.length > 0 ? items : [{ title: section.title || "細節", body: section.body || "", image_url: firstSectionImage(section, heroImage) }];
  const image = firstSectionImage(section, heroImage);

  if (variant === "details.d2") {
    return [
      `<section class="site-module content-module details-grid family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "核心價值" : "產品細節"),
      `<div class="detail-grid">${rows.slice(0, 8).map((item) => `<article><span>${escapeHtml(item.title.slice(0, 1))}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join("")}</div>`,
      `</section>`,
    ].join("");
  }

  if (variant === "details.d3") {
    return [
      `<section class="site-module content-module details-editorial family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "品牌聲明" : "重點細節"),
      `<div class="editorial-stack">${rows.slice(0, 4).map((item, itemIndex) => `<article><div><span>${String(itemIndex + 1).padStart(2, "0")}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div>${imageOrMark(item.image_url || image, item.title, "detail-media")}</article>`).join("")}</div>`,
      `</section>`,
    ].join("");
  }

  return [
    `<section class="site-module content-module details-stagger family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
    sectionHeaderHtml(section, family === "brand" ? "價值支柱" : "規格與報價資訊"),
    `<div class="stagger-list">${rows.slice(0, 6).map((item, itemIndex) => `<article>${imageOrMark(item.image_url || image, item.title, "detail-media")}<div><span>${String(itemIndex + 1).padStart(2, "0")}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></div></article>`).join("")}</div>`,
    `</section>`,
  ].join("");
}

function renderProofModule(section: SitePageSection, index: number, heroImage: string) {
  const variant = section.layoutVariant || "proof.sp1";
  const family = section.variantFamily === "brand" ? "brand" : "product";
  const rows = sectionItemRecords(section);
  const items = rows.length > 0 ? rows : [{ title: section.title || "信任背書", body: narrativeValue(section.body), image_url: firstSectionImage(section, heroImage) }];
  const image = firstSectionImage(section, heroImage);

  if (variant === "proof.sp2") {
    return [
      `<section class="site-module content-module proof-mosaic family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "作品案例" : "專業背書"),
      `<div class="mosaic-grid">${items.slice(0, 5).map((item, itemIndex) => imageOrMark(item.image_url || image, item.title, `mosaic-item mosaic-${itemIndex}`)).join("")}</div>`,
      `</section>`,
    ].join("");
  }

  if (variant === "proof.sp3") {
    return [
      `<section class="site-module content-module proof-timeline family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "服務流程" : "成果紀錄"),
      `<div class="timeline">${items.slice(0, 4).map((item, itemIndex) => `<article><span>${String(itemIndex + 1).padStart(2, "0")}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join("")}</div>`,
      `</section>`,
    ].join("");
  }

  return [
    `<section class="site-module content-module proof-cards family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
    sectionHeaderHtml(section, family === "brand" ? "客戶與案例" : "評價與信任"),
    `<div class="quote-stack">${items.slice(0, 4).map((item) => `<blockquote><p>${escapeHtml(item.body || item.title)}</p><cite>${escapeHtml(item.title)}</cite></blockquote>`).join("")}</div>`,
    `</section>`,
  ].join("");
}

function renderClosingModule(section: SitePageSection, index: number) {
  const variant = section.layoutVariant || "closing.c1";
  const family = section.variantFamily === "brand" ? "brand" : "product";
  const rows = sectionItemRecords(section);
  const items = rows.length > 0 ? rows : [
    { title: "下一步", body: section.body || "留下需求後，我們會整理下一步資訊。", image_url: "" },
    { title: "行動", body: section.button_label || "立即詢價", image_url: "" },
  ];
  const cta = section.button_label || "立即詢價";

  if (variant === "closing.c2") {
    return [
      `<section class="site-module content-module closing-panel family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "合作前確認" : "購買前確認"),
      `<div class="faq-panel">${items.slice(0, 5).map((item) => `<details open><summary>${escapeHtml(item.title)}</summary><p>${escapeHtml(item.body)}</p></details>`).join("")}</div>`,
      `<a class="button" href="#inquiry">${escapeHtml(cta)}</a>`,
      `</section>`,
    ].join("");
  }

  if (variant === "closing.c3") {
    return [
      `<section class="site-module content-module closing-cards family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
      sectionHeaderHtml(section, family === "brand" ? "常見合作問題" : "常見採購問題"),
      `<div class="closing-card-grid">${items.slice(0, 6).map((item) => `<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join("")}</div>`,
      `<a class="button" href="#inquiry">${escapeHtml(cta)}</a>`,
      `</section>`,
    ].join("");
  }

  return [
    `<section class="site-module content-module closing-table family-${family} tone-${sectionTone(index)} ${sectionVariantClass(section)}">`,
    sectionHeaderHtml(section, family === "brand" ? "合作資訊" : "報價資訊"),
    `<div class="info-table">${items.slice(0, 8).map((item) => `<div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></div>`).join("")}</div>`,
    `<a class="button" href="#inquiry">${escapeHtml(cta)}</a>`,
    `</section>`,
  ].join("");
}

function renderGenericModule(section: SitePageSection, index: number) {
  return [
    `<section class="site-module content-module generic-module ${sectionVariantClass(section)} ${sectionFamilyClass(section)} tone-${sectionTone(index)}">`,
    sectionHeaderHtml(section, section.title || sectionEyebrow(section)),
    section.image_url ? imageOrMark(section.image_url, section.title || "網站圖片", "section-image") : "",
    section.items?.length ? `<div class="card-grid">${sectionItemsHtml(section.items)}</div>` : "",
    section.button_label ? `<a class="button" href="#inquiry">${escapeHtml(section.button_label)}</a>` : "",
    `</section>`,
  ].join("");
}

function renderSiteModule(section: SitePageSection, schema: SiteSchema, index: number, heroImage: string) {
  if (section.type === "hero") return renderHeroModule(section, schema, heroImage);
  if (section.type === "features") return renderPainpointModule(section, index, heroImage);
  if (section.type === "products") return renderSolutionModule(section, index, heroImage);
  if (section.type === "productDetails") return renderDetailsModule(section, index, heroImage);
  if (section.type === "socialProof") return renderProofModule(section, index, heroImage);
  if (section.type === "closingInfo") return renderClosingModule(section, index);
  return renderGenericModule(section, index);
}

export function renderWebsiteHtml(schema: SiteSchema) {
  const styleKey = normalizeWebsiteStyleValue(schema.design_style) || schema.design_style || "minimal-luxury";
  const accent = schema.primary_color || stylePrimaryColor(styleKey);
  const logoUrl = schema.logo_url || "";
  const heroImage = schema.product_images?.[0] || schema.sections.find((section) => section.image_url)?.image_url || "";
  const sections = schema.sections.map((section, index) => renderSiteModule(section, schema, index, heroImage)).join("");

  return [
    `<!doctype html>`,
    `<html lang="zh-Hant">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(schema.seo?.title || schema.title)}</title>`,
    `<meta name="description" content="${escapeHtml(schema.seo?.description || schema.tagline)}">`,
    `<style>`,
    `:root{${styleThemeTokens(schema, accent)}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Sans TC","PingFang TC",ui-sans-serif,system-ui,sans-serif;line-height:1.68}.site-shell{min-height:100vh;overflow:hidden}.site-nav{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:28px clamp(20px,5vw,72px)}.brand{display:flex;align-items:center;gap:12px;font-weight:700;letter-spacing:.02em}.brand-logo{width:34px;height:34px;object-fit:contain;border-radius:10px;border:1px solid var(--line);background:var(--panel);padding:4px}.nav-pill{border:1px solid var(--line);border-radius:999px;padding:10px 16px;color:var(--muted);text-decoration:none;font-size:14px}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:var(--accent);font-size:12px;font-weight:700}.button{display:inline-flex;align-items:center;justify-content:center;margin-top:24px;border-radius:999px;background:var(--accent);color:#fff;text-decoration:none;padding:14px 24px;font-weight:700;box-shadow:0 18px 40px color-mix(in srgb,var(--accent) 26%,transparent)}.inquiry{padding:80px clamp(20px,6vw,92px);background:#111;color:#fff}.inquiry p{max-width:760px;color:#d8d3ca}.inquiry .button{background:#fff;color:#111}.theme-fashion-editorial .nav-pill,.theme-fashion-editorial .brand,.theme-tech-future .nav-pill,.theme-tech-future .brand{color:var(--ink)}.theme-fashion-editorial .button,.theme-tech-future .button{color:#15120f}.theme-minimal-luxury .button{border-radius:2px}.theme-japanese-fresh .button{border-radius:999px}.theme-western-trend .button{border-radius:0;text-transform:uppercase}.theme-commercial-ecommerce .button{border-radius:10px}.theme-tech-future .site-module h1,.theme-tech-future .site-module h2{font-family:"Noto Sans TC",ui-sans-serif,system-ui,sans-serif;letter-spacing:-.01em}.theme-fashion-editorial .site-module h1,.theme-fashion-editorial .site-module h2{font-family:Georgia,"Noto Serif TC",serif}`,
    `.site-module{position:relative;padding:clamp(72px,8vw,128px) clamp(20px,6vw,92px);border-top:1px solid var(--line)}.site-module h1,.site-module h2{font-family:Georgia,"Noto Serif TC",serif;letter-spacing:-.025em}.module-head{max-width:860px;margin-bottom:34px}.module-head h2{font-size:clamp(34px,5vw,68px);line-height:1.04;margin:8px 0 14px}.module-head p:not(.eyebrow){color:var(--muted);font-size:18px;white-space:pre-line}.content-module:nth-of-type(odd){background:var(--panel)}.content-module:nth-of-type(even){background:var(--bg)}.hero-module{min-height:calc(100svh - 92px)}.hero-logo,.brand-logo{display:block}.hero-brand{display:inline-flex;align-items:center;gap:12px;font-weight:700}.hero-logo{width:40px;height:40px;object-fit:contain;border-radius:12px;background:var(--panel);padding:5px}.hero-mark{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:color-mix(in srgb,var(--accent) 14%,var(--panel));color:var(--accent);font-weight:700}.hero-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.86fr);gap:clamp(32px,6vw,86px);align-items:center}.hero-split h1{font-size:clamp(52px,7vw,106px);line-height:.94;margin:24px 0}.hero-split p{font-size:clamp(18px,2vw,24px);color:var(--muted)}.hero-main-media img,.hero-main-media,.image-mark{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:46px 46px 14px 14px;box-shadow:var(--shadow);background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.image-mark{display:grid;place-items:center;color:var(--accent);font-size:54px;font-weight:700}.hero-floating-note{position:absolute;right:8%;bottom:8%;max-width:220px;border:1px solid var(--line);border-radius:999px;background:var(--panel);padding:14px 18px;color:var(--muted);box-shadow:var(--shadow)}.hero-visual-wrap{position:relative}.hero-overlay{display:grid;place-items:center;isolation:isolate;color:#fff;overflow:hidden}.hero-bg{position:absolute;inset:0;z-index:-2;margin:0}.hero-bg img,.hero-bg.image-mark{width:100%;height:100%;aspect-ratio:auto;border-radius:0;filter:saturate(.9) brightness(.62);object-fit:cover}.hero-overlay:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(135deg,rgba(0,0,0,.2),rgba(0,0,0,.64))}.hero-overlay-card{max-width:880px;border:1px solid rgba(255,255,255,.24);border-radius:38px;background:rgba(15,12,10,.48);padding:clamp(34px,7vw,90px);text-align:center;backdrop-filter:blur(18px)}.hero-overlay-card h1{font-size:clamp(48px,7vw,104px);line-height:.95;margin:24px 0}.hero-overlay-card p:not(.eyebrow){color:rgba(255,255,255,.82);font-size:20px}.hero-stacked{padding-top:12px}.hero-stacked-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;color:var(--muted)}.hero-wide-media img,.hero-wide-media.image-mark{width:100%;aspect-ratio:16/7;object-fit:cover;border-radius:24px 24px 0 0}.hero-stacked-copy{display:grid;grid-template-columns:.72fr 1fr;gap:34px;align-items:end;background:#15120f;color:#fff;border-radius:0 0 36px 36px;padding:clamp(30px,5vw,64px)}.hero-stacked-copy h1{font-size:clamp(42px,5.8vw,88px);line-height:.98}.hero-stacked-copy p:not(.eyebrow){color:#ded8ce}.bullet-list{display:grid;gap:14px}.bullet-list article{display:grid;grid-template-columns:54px 1fr;gap:18px;padding:18px 0;border-top:1px solid var(--line)}.bullet-list span,.solution-bullets span,.stagger-list span,.editorial-stack span{color:var(--accent);font-weight:700}.painpoint-list{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.78fr);gap:48px;align-items:center}.side-media img,.side-media.image-mark{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:999px 999px 26px 26px;box-shadow:var(--shadow)}.compare-board{display:grid;grid-template-columns:1fr 1fr;gap:20px}.compare-board>div{border:1px solid var(--line);border-radius:28px;background:rgba(255,255,255,.08);padding:26px}.compare-board span{display:block;color:var(--accent);font-weight:700;margin-bottom:16px}.compare-board p{margin:0 0 16px;font-size:20px}.compare-board small{display:block;color:var(--muted);font-size:14px}.stat-layout{display:grid;grid-template-columns:minmax(260px,.75fr) 1fr;gap:48px;align-items:center}.stat-circle{display:grid;place-items:center;text-align:center;aspect-ratio:1;border-radius:999px;background:color-mix(in srgb,var(--accent) 16%,var(--panel));padding:42px}.stat-circle strong{font-family:Georgia,"Noto Serif TC",serif;font-size:clamp(42px,6vw,82px);line-height:1}.stat-circle span{color:var(--muted)}.polaroid-stack{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.polaroid img,.polaroid.image-mark{width:100%;aspect-ratio:3/4;object-fit:cover;border:12px solid #fff;border-bottom-width:42px;box-shadow:var(--shadow);transform:rotate(-3deg)}.p-1 img,.p-1.image-mark{transform:translateY(36px) rotate(4deg)}.p-2 img,.p-2.image-mark{transform:rotate(-1deg)}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px}.module-card{overflow:hidden;border:1px solid var(--line);border-radius:24px;background:var(--panel);box-shadow:var(--shadow)}.module-card>div{padding:22px}.card-media img,.card-media.image-mark{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:0}.focus-layout{display:grid;grid-template-columns:.7fr 1.15fr .7fr;gap:22px;align-items:center}.focus-layout aside,.focus-card{border:1px solid var(--line);border-radius:28px;background:var(--panel);padding:26px;box-shadow:var(--shadow)}.focus-media img,.focus-media.image-mark{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:20px}.solution-list-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(300px,1.1fr);gap:38px;align-items:center}.solution-bullets article{display:grid;grid-template-columns:48px 1fr;gap:18px;padding:18px 0;border-bottom:1px solid var(--line)}.solution-large img,.solution-large.image-mark{width:100%;aspect-ratio:5/4;object-fit:cover;border-radius:36px;box-shadow:var(--shadow)}.stagger-list{display:grid;gap:30px}.stagger-list article{display:grid;grid-template-columns:minmax(220px,.62fr) 1fr;gap:32px;align-items:center}.stagger-list article:nth-child(even){grid-template-columns:1fr minmax(220px,.62fr)}.stagger-list article:nth-child(even) figure{order:2}.detail-media img,.detail-media.image-mark{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:28px;box-shadow:var(--shadow)}.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.detail-grid article{border:1px solid var(--line);border-radius:24px;background:var(--panel);padding:26px}.detail-grid article span{display:grid;place-items:center;width:48px;height:48px;border-radius:999px;background:color-mix(in srgb,var(--accent) 14%,var(--panel));color:var(--accent);font-weight:700}.editorial-stack{display:grid;gap:24px}.editorial-stack article{display:grid;grid-template-columns:1fr minmax(240px,.8fr);gap:28px;align-items:center;border-top:1px solid var(--line);padding-top:24px}.mosaic-grid{display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:180px;gap:16px}.mosaic-item img,.mosaic-item.image-mark{width:100%;height:100%;object-fit:cover;border-radius:26px}.mosaic-0{grid-column:span 2;grid-row:span 2}.timeline{display:grid;gap:18px;max-width:940px}.timeline article{display:grid;grid-template-columns:80px 1fr;gap:22px;border-bottom:1px solid var(--line);padding-bottom:18px}.timeline span{font-family:Georgia,"Noto Serif TC",serif;font-size:38px;color:var(--accent)}.quote-stack{display:grid;gap:18px;max-width:860px;margin-left:auto}.quote-stack blockquote{margin:0;border:1px solid var(--line);border-radius:16px 36px 36px 36px;background:var(--panel);padding:28px;box-shadow:var(--shadow)}.quote-stack p{font-size:20px;margin:0 0 14px}.quote-stack cite{color:var(--muted);font-style:normal}.info-table{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:28px;overflow:hidden;background:var(--panel);margin-bottom:28px}.info-table div{display:grid;grid-template-columns:160px 1fr;gap:16px;padding:20px;border-bottom:1px solid var(--line)}.info-table strong{color:var(--accent)}.faq-panel{max-width:880px;border:1px solid rgba(255,255,255,.16);border-radius:32px;background:rgba(255,255,255,.08);padding:18px;margin-bottom:28px}.faq-panel details{border-bottom:1px solid rgba(255,255,255,.14);padding:18px}.faq-panel summary{cursor:pointer;font-weight:700}.closing-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-bottom:28px}.closing-card-grid article{border:1px solid var(--line);border-radius:22px;background:var(--panel);padding:24px}.family-brand .module-card,.family-brand .detail-grid article,.family-brand .closing-card-grid article{border-radius:38px 38px 14px 14px}.family-product .module-card,.family-product .focus-card,.family-product .detail-grid article{border-radius:18px}.tone-contrast,.variant-painpoint-p2,.variant-details-d2,.variant-closing-c2{background:#15120f;color:#fff}.tone-contrast .module-head p,.tone-contrast p,.tone-contrast small,.variant-painpoint-p2 .module-head p,.variant-details-d2 .module-head p,.variant-closing-c2 .module-head p{color:#d8d3ca}.tone-contrast .module-card,.tone-contrast .focus-card,.tone-contrast .detail-grid article,.tone-contrast .closing-card-grid article{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.14);box-shadow:none}@media(max-width:760px){.hero-split,.hero-stacked-copy,.painpoint-list,.compare-board,.stat-layout,.focus-layout,.solution-list-grid,.stagger-list article,.stagger-list article:nth-child(even),.editorial-stack article,.info-table,.info-table div{grid-template-columns:1fr}.stagger-list article:nth-child(even) figure{order:0}.mosaic-grid{grid-template-columns:1fr;grid-auto-rows:auto}.mosaic-0{grid-column:auto;grid-row:auto}.mosaic-item img,.mosaic-item.image-mark{aspect-ratio:4/3;height:auto}.polaroid-stack{grid-template-columns:1fr}.polaroid img,.polaroid.image-mark,.p-1 img,.p-1.image-mark,.p-2 img,.p-2.image-mark{transform:none}.site-module{padding:56px 20px}.hero-split h1,.hero-overlay-card h1{font-size:clamp(42px,13vw,68px)}}`,
    `</style>`,
    `</head>`,
    `<body>`,
    `<main class="site-shell theme-${escapeHtml(styleKey)}">`,
    `<nav class="site-nav"><div class="brand">${logoUrl ? `<img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(schema.title)} logo">` : ""}<span>${escapeHtml(schema.title)}</span></div><a class="nav-pill" href="#inquiry">${escapeHtml(schema.inquiry_cta_label || "立即詢價")}</a></nav>`,
    sections,
    `<section id="inquiry" class="inquiry"><p class="eyebrow">Inquiry</p><h2>${escapeHtml(schema.inquiry_cta_label || "立即詢價")}</h2><p>${escapeHtml(schema.inquiry_cta_note || "想了解規格、報價或合作方式，歡迎立即詢價。")}</p><a class="button" href="#">${escapeHtml(schema.inquiry_cta_label || "立即詢價")}</a></section>`,
    `</main>`,
    `</body>`,
    `</html>`,
  ].join("");
}

function normalizePatchedSiteSchema(value: unknown, fallback: SiteSchema) {
  const record = recordValue(value);
  const sections = Array.isArray(record.sections)
    ? record.sections.map((section) => {
        const raw = recordValue(section);
        const items = Array.isArray(raw.items)
          ? raw.items.filter((item) => typeof item === "string" || (item && typeof item === "object" && !Array.isArray(item)))
          : undefined;
        const variantFamily: SitePageSection["variantFamily"] =
          raw.variantFamily === "product" || raw.variantFamily === "brand"
            ? raw.variantFamily
            : undefined;
        return {
          type: textValue(raw.type, "features") as SitePageSection["type"],
          layoutVariant: textValue(raw.layoutVariant) || undefined,
          variantFamily,
          title: textValue(raw.title) || undefined,
          body: textValue(raw.body) || undefined,
          image_url: textValue(raw.image_url) || undefined,
          button_label: textValue(raw.button_label) || undefined,
          items: items as SitePageSection["items"],
        };
      })
    : fallback.sections;

  return {
    title: textValue(record.title, fallback.title),
    tagline: textValue(record.tagline, fallback.tagline),
    primary_color: textValue(record.primary_color, fallback.primary_color),
    logo_url: textValue(record.logo_url, fallback.logo_url || ""),
    design_style: normalizeWebsiteStyleValue(record.design_style) || normalizeWebsiteStyleValue(fallback.design_style) || "minimal-luxury",
    design_brief: textValue(record.design_brief, fallback.design_brief || ""),
    design_tokens:
      record.design_tokens && typeof record.design_tokens === "object"
        ? normalizeDesignTokens(record.design_tokens)
        : fallback.design_tokens,
    site_intent: textValue(record.site_intent, fallback.site_intent || ""),
    product_images: listValue(record.product_images).length > 0 ? listValue(record.product_images) : fallback.product_images,
    product: recordValue(record.product),
    inquiry_cta_label: textValue(record.inquiry_cta_label, fallback.inquiry_cta_label),
    inquiry_cta_note: textValue(record.inquiry_cta_note, fallback.inquiry_cta_note),
    seo: {
      ...fallback.seo,
      ...recordValue(record.seo),
    },
    integrations: {
      ...fallback.integrations,
      ...recordValue(record.integrations),
    },
    sections: sections.length > 0 ? sections : fallback.sections,
  } satisfies SiteSchema;
}

async function patchGeneratedSiteSchema(params: {
  schema: SiteSchema;
  instruction: string;
  imageUrls?: string[];
}) {
  try {
    const result = await flexionCompleteJSON<{
      needsClarification?: boolean;
      clarificationQuestion?: string;
      clarificationOptions?: Array<{ label: string; value: string }>;
      changeSummary?: string;
      affectedSectionIndexes?: number[];
      updatedSchema?: unknown;
    }>({
      model: pickModel({ plan: "pro", taskHint: "complex" }),
      temperature: 0.1,
      max_tokens: 4500,
      messages: [
        {
          role: "system",
          content: [
            "你是網站視覺與內容編輯器，功能等同 SiteEditorV2 的文字層 patch。",
            "你只輸出 JSON，不要輸出說明。",
            "輸入會包含目前一頁式網站 schema、使用者修改指令、可能的新圖片 URL。",
            "請判斷使用者要修改的真實位置，直接回傳完整 updatedSchema。",
            "必須保留 SiteSchema 結構：title, tagline, primary_color, logo_url, design_style, design_brief, design_tokens, site_intent, product_images, product, inquiry_cta_label, inquiry_cta_note, seo, integrations, sections。",
            "sections 每個項目只能使用 type,layoutVariant,variantFamily,title,body,image_url,items,button_label。",
            "保留既有 layoutVariant 與 variantFamily，除非使用者明確要求改版型。",
            "如果指令不清楚才回 needsClarification=true，並提供 clarificationQuestion 和 2 到 3 個 clarificationOptions。",
            "不要捏造客戶沒提供的評價、法規字號或聯絡資料。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            currentSchema: params.schema,
            userInstruction: params.instruction,
            uploadedImageUrls: params.imageUrls || [],
            expectedJson: {
              needsClarification: false,
              clarificationQuestion: "",
              clarificationOptions: [],
              changeSummary: "一句話描述改了什麼",
              affectedSectionIndexes: [0],
              updatedSchema: params.schema,
            },
          }),
        },
      ],
    });

    if (result.data.needsClarification) {
      return {
        updatedSchema: params.schema,
        changeSummary: result.data.changeSummary || "需要再確認要修改的位置。",
        affectedSectionIndexes: [],
        needsClarification: true,
        clarificationQuestion: result.data.clarificationQuestion || "你想修改網站的哪個區塊？",
        clarificationOptions: result.data.clarificationOptions || [],
      } satisfies WebsitePatchResult;
    }

    return {
      updatedSchema: normalizePatchedSiteSchema(result.data.updatedSchema, params.schema),
      changeSummary: result.data.changeSummary || "網站已依你的指令更新。",
      affectedSectionIndexes: Array.isArray(result.data.affectedSectionIndexes)
        ? result.data.affectedSectionIndexes.filter((index): index is number => typeof index === "number")
        : [],
    } satisfies WebsitePatchResult;
  } catch {
    return {
      updatedSchema: params.schema,
      changeSummary: "目前網站編輯模型尚未成功回應，我沒有套用任何修改。",
      affectedSectionIndexes: [],
      needsClarification: true,
      clarificationQuestion: "網站編輯模型暫時沒有成功回應。請再送一次同樣的修改指令，我會重新嘗試。",
      clarificationOptions: [],
    } satisfies WebsitePatchResult;
  }
}

async function createEditedWebsiteMessage(params: {
  conversation: { id: string; project_memory: Prisma.JsonValue | null };
  userId: string;
  siteId: string;
  siteIntent: WebsiteSiteIntent;
  formInput: Record<string, unknown>;
  instruction: string;
}) {
  const site = await prisma.site.findFirst({
    where: { id: params.siteId, user_id: params.userId, deleted_at: null },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!site?.versions[0]) return null;

  const previousSchema = site.versions[0].schema as unknown as SiteSchema;
  const patch = await patchGeneratedSiteSchema({
    schema: previousSchema,
    instruction: params.instruction,
  });
  if (patch.needsClarification) {
    const message = await createAssistantMessage({
      conversationId: params.conversation.id,
      text: patch.clarificationQuestion || patch.changeSummary,
      metadata: {
        source: "conversations.messages.website-builder.edit",
        phase: "website_builder",
        status: "needs_input",
        websiteBuilder: {
          mode: "edit_clarification",
          siteIntent: params.siteIntent,
          siteId: params.siteId,
          formInput: params.formInput,
        },
        quickActions: (patch.clarificationOptions || []).map((option) => ({
          type: "quick_reply",
          label: option.label,
          value: option.value,
          action: "website_edit",
          siteId: params.siteId,
        })),
      } as Prisma.InputJsonValue,
      model: "website-builder-editor",
    });
    return message;
  }
  const schema = patch.updatedSchema;
  const html = renderWebsiteHtml(schema);
  const nextVersion = site.versions[0].version + 1;
  const version = await prisma.siteVersion.create({
    data: {
      site_id: site.id,
      version: nextVersion,
      schema: schema as unknown as Prisma.InputJsonValue,
    },
  });
  const updatedSite = await prisma.site.update({
    where: { id: site.id },
    data: {
      name: schema.title || site.name,
      description: schema.tagline || site.description,
      theme: { primary_color: schema.primary_color },
      current_version_id: version.id,
    },
  });

  await prisma.conversation.update({
    where: { id: params.conversation.id },
    data: {
      last_message_at: new Date(),
      project_memory: mergeWebsiteMemory(params.conversation, {
        kind: "website_builder",
        siteIntent: params.siteIntent,
        formInput: params.formInput,
        siteId: updatedSite.id,
        awaitingConfirmation: false,
        currentQuestionKey: null,
      }),
    },
  });

  const message = await prisma.message.create({
    data: {
      conversation_id: params.conversation.id,
      role: MessageRole.assistant,
      message_type: MessageType.generation_result,
      content: {
        type: "website_html",
        status: "completed",
        text: `網站已更新：${schema.title}`,
        siteId: updatedSite.id,
        schema,
        previewHtml: html,
        htmlCode: html,
        rawHtml: html,
      } as Prisma.InputJsonValue,
      metadata: {
        type: "generation_result",
        source: "conversations.messages.website-builder.edit",
        phase: "website_builder",
        status: "completed",
        domain: "web",
        taskType: "landing_page",
        templateLabel: websiteIntentLabel(params.siteIntent),
        stepDecision: {
          version: 1,
          phase: "website_builder_generated",
          action: "website_generated",
          domain: "web",
          mode: "generated",
          needsUserInput: false,
          canGenerate: true,
          shouldShowProgress: false,
          stageIndex: 4,
          stageLabel: "產出初稿",
          stageDescription: "網站初稿已產出，可預覽、查看 HTML 或繼續修改",
          recommendedDisplay: "website_builder",
          updatedAt: new Date().toISOString(),
        },
        siteId: updatedSite.id,
        versionNumber: nextVersion,
        expectedOutputCount: 1,
        receivedOutputCount: 1,
        artifactReady: true,
        artifact: {
          kind: "website_html",
          title: schema.title,
          mimeType: "text/html",
          siteId: updatedSite.id,
          siteSpec: schema as SiteSchema,
          previewHtml: html,
          rawHtml: html,
          htmlCode: html,
          exportUrl: `/site-preview/${updatedSite.id}`,
          changeSummary: patch.changeSummary,
          generatedAt: new Date().toISOString(),
        },
        outputGroups: [
          {
            type: "website",
            title: "網站結果",
            items: [
              {
                id: `${updatedSite.id}-v${nextVersion}`,
                label: schema.title,
                content: patch.changeSummary,
                artifactKind: "website_html",
                openTarget: "artifact",
                siteId: updatedSite.id,
                schema: schema as SiteSchema,
                previewHtml: html,
                htmlCode: html,
                rawHtml: html,
                openUrl: `/site-preview/${updatedSite.id}`,
              },
            ],
          },
        ],
        websiteBuilder: {
          mode: "generated",
          siteIntent: params.siteIntent,
          siteId: updatedSite.id,
          exportUrl: `/site-preview/${updatedSite.id}`,
          formInput: params.formInput,
        },
        quickActions: [
          {
            type: "input",
            label: "繼續修改",
            value: "我要修改網站：",
            action: "website_edit",
          },
          {
            type: "quick_reply",
            label: "新增/修改商品",
            value: "我要新增或修改商品資料。",
            action: "website_edit_products",
          },
          {
            type: "quick_reply",
            label: "建立新網站",
            value: "我要重新生成一個新的網站。",
            action: "website_new",
          },
          {
            type: "website_view_code",
            label: "查看 HTML",
            value: "查看 HTML",
            action: "website_view_code",
          },
        ],
      } as Prisma.InputJsonValue,
      credits_used: BigInt(0),
      model: "website-builder-editor",
    },
  });
  publishConversationEvent(params.conversation.id, "generation.result.completed", shapeMessage(message));
  return message;
}

async function createGeneratedWebsite(params: {
  conversation: { id: string; project_memory: Prisma.JsonValue | null; title: string | null };
  userId: string;
  siteIntent: WebsiteSiteIntent;
  formInput: Record<string, unknown>;
}) {
  publishConversationEvent(params.conversation.id, "generation.result.updated", {
    status: "processing",
    phase: "website_builder",
  });

  const formInput = await hydrateLinkedProducts(params.formInput, params.userId);
  const schema = await buildGeneratedSiteSchema({
    siteIntent: params.siteIntent,
    formInput,
  });
  const html = renderWebsiteHtml(schema);
  const baseName = schema.title || websiteIntentLabel(params.siteIntent);
  const baseSlug = slugifySiteName(baseName);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.site.findUnique({ where: { slug } })) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }

  const site = await prisma.site.create({
    data: {
      user_id: params.userId,
      slug,
      name: baseName,
      description: schema.tagline || null,
      theme: { primary_color: schema.primary_color },
      versions: {
        create: {
          version: 1,
          schema: schema as unknown as Prisma.InputJsonValue,
        },
      },
    },
    include: { versions: true },
  });

  const currentVersion = site.versions[0];
  const updatedSite = currentVersion
    ? await prisma.site.update({
        where: { id: site.id },
        data: { current_version_id: currentVersion.id },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      })
    : site;

  await prisma.conversation.update({
    where: { id: params.conversation.id },
    data: {
      last_message_at: new Date(),
      project_memory: mergeWebsiteMemory(params.conversation, {
        kind: "website_builder",
        siteIntent: params.siteIntent,
        formInput,
        siteId: updatedSite.id,
        awaitingConfirmation: false,
        currentQuestionKey: null,
      }),
      ...(params.conversation.title === "新對話" || params.conversation.title === "New Conversation"
        ? { title: baseName.slice(0, 32) }
        : {}),
    },
  });

  const message = await prisma.message.create({
    data: {
      conversation_id: params.conversation.id,
      role: MessageRole.assistant,
      message_type: MessageType.generation_result,
      content: {
        type: "website_html",
        status: "completed",
        text: `網站初稿已生成：${baseName}`,
        siteId: updatedSite.id,
        schema,
        previewHtml: html,
        htmlCode: html,
        rawHtml: html,
      },
      metadata: {
        type: "generation_result",
        source: "conversations.messages.website-builder.generate",
        phase: "website_builder",
        status: "completed",
        domain: "web",
        taskType: "landing_page",
        templateLabel: websiteIntentLabel(params.siteIntent),
        stepDecision: {
          version: 1,
          phase: "website_builder_generated",
          action: "website_generated",
          domain: "web",
          mode: "generated",
          needsUserInput: false,
          canGenerate: true,
          shouldShowProgress: false,
          stageIndex: 4,
          stageLabel: "產出初稿",
          stageDescription: "網站初稿已產出，可預覽、查看 HTML 或繼續修改",
          recommendedDisplay: "website_builder",
          updatedAt: new Date().toISOString(),
        },
        siteId: updatedSite.id,
        versionNumber: 1,
        expectedOutputCount: 1,
        receivedOutputCount: 1,
        artifact: {
          kind: "website_html",
          title: baseName,
          mimeType: "text/html",
          siteId: updatedSite.id,
          siteSpec: schema as SiteSchema,
          previewHtml: html,
          rawHtml: html,
          htmlCode: html,
          exportUrl: `/site-preview/${updatedSite.id}`,
          generatedAt: new Date().toISOString(),
        },
        outputGroups: [
          {
            type: "website",
            title: "一頁式網站",
            items: [
              {
                id: updatedSite.id,
                label: baseName,
                content: "已產生可預覽的一頁式網站 HTML。",
                artifactKind: "website_html",
                openTarget: "artifact",
                siteId: updatedSite.id,
                schema: schema as SiteSchema,
                previewHtml: html,
                htmlCode: html,
                rawHtml: html,
                openUrl: `/site-preview/${updatedSite.id}`,
              },
            ],
          },
        ],
        websiteBuilder: {
          mode: "generated",
          siteIntent: params.siteIntent,
          siteId: updatedSite.id,
          exportUrl: `/site-preview/${updatedSite.id}`,
          formInput,
        },
        quickActions: [
          {
            type: "input",
            label: "修改網站內容",
            value: "我要修改網站內容：",
            action: "website_edit",
          },
          {
            type: "quick_reply",
            label: "同資料重生",
            value: "依目前方向重新生成網站。",
            action: "website_generate",
          },
          {
            type: "quick_reply",
            label: "新增/修改商品",
            value: "我要新增或修改商品資料。",
            action: "website_edit_products",
          },
          {
            type: "quick_reply",
            label: "建立新網站",
            value: "我要重新生成一個新的網站。",
            action: "website_new",
          },
          {
            type: "website_view_code",
            label: "查看 HTML",
            value: "查看 HTML",
            action: "website_view_code",
          },
        ],
      } as Prisma.InputJsonValue,
      credits_used: BigInt(0),
      model: "website-builder",
    },
  });
  publishConversationEvent(params.conversation.id, "generation.result.completed", shapeMessage(message));
  return message;
}

export async function handleWebsiteBuilderTurn(params: {
  conversation: {
    id: string;
    user_id: string;
    title: string | null;
    project_memory: Prisma.JsonValue | null;
  };
  userId: string;
  text: string;
  quickReply: Record<string, unknown> | null;
  uploadedImageUrls?: string[];
}): Promise<WebsiteBuilderResult> {
  const memory = websiteMemory(params.conversation);
  const action = typeof params.quickReply?.action === "string" ? params.quickReply.action : undefined;
  const freshRequest = isFreshWebsiteRequest(params.text, action);
  const selectedIntent =
    inferWebsiteIntentFromQuickReply(params.quickReply) ||
    (action === "website_continue_collecting" ? null : inferWebsiteIntentFromText(params.text));
  const route = memory.kind === "website_builder" ? "website_builder" : routeWebsiteKind(params.text);
  if (
    route !== "website_builder" &&
    !selectedIntent &&
    action !== "website_generate" &&
    !freshRequest &&
    !isProductMutationRequest(params.text, action)
  ) {
    return { handled: false };
  }

  const activeIntent = selectedIntent || memory.siteIntent || null;
  if (freshRequest) {
    const formInput: Record<string, unknown> = {};
    const updatedMemory = mergeWebsiteMemory(params.conversation, {
      kind: "website_builder",
      siteIntent: null,
      formInput,
      currentQuestionKey: null,
      preIntentStep: null,
      awaitingConfirmation: false,
      siteId: null,
    });
    const assistantMessage = await createAssistantMessage({
      conversationId: params.conversation.id,
      text: "好，這次我會開一個新的網站流程，不沿用上一版網站內容。先確認這頁主要任務是哪一類：商品介紹／導購型，或品牌形象／公司介紹型？",
      metadata: {
        ...metadataBase({
          mode: "entry",
          formInput,
          stageLabel: "類別確認",
          stageDescription: "先確認一頁式網站偏商品介紹／導購型，或品牌形象／公司介紹型",
          stageIndex: 0,
        }),
        quickActions: quickActionsForIntentSelection(),
      } as Prisma.InputJsonValue,
    });
    await prisma.conversation.update({
      where: { id: params.conversation.id },
      data: { project_memory: updatedMemory, last_message_at: new Date() },
    });
    return { handled: true, assistantMessage };
  }

  if (activeIntent && isProductWebsiteIntent(activeIntent) && isProductMutationRequest(params.text, action)) {
    const formInput = recordValue(memory.formInput);
    const productStep = getWebsiteCollectionScript(activeIntent).find((step) => step.widget.kind === "product-card");
    if (productStep) {
      const productOptions = await listOwnedProductOptions(params.userId);
      const nextMemory = mergeWebsiteMemory(params.conversation, {
        kind: "website_builder",
        siteIntent: activeIntent,
        formInput,
        currentQuestionKey: productStep.widget.field,
        awaitingConfirmation: false,
      });
      const assistantMessage = await createAssistantMessage({
        conversationId: params.conversation.id,
        text: "可以，這裡改商品資料。你可以從資料庫商品加入，也可以新增多個商品；送出後我會把網站流程接回來。",
        metadata: {
          ...metadataBase({
            mode: "collecting",
            siteIntent: activeIntent,
            formInput,
            step: productStep,
            ready: false,
            productOptions,
          }),
          quickActions: buildCollectionQuickActions(productStep, activeIntent),
        } as Prisma.InputJsonValue,
      });
      await prisma.conversation.update({
        where: { id: params.conversation.id },
        data: { project_memory: nextMemory, last_message_at: new Date() },
      });
      return { handled: true, assistantMessage };
    }
  }

  if (selectedIntent && !memory.siteIntent) {
    const formInput = recordValue(memory.formInput);
    const state = buildCollectionState(selectedIntent, formInput);
    const step = state.currentStep;
    const productOptions = step.widget.kind === "product-card" ? await listOwnedProductOptions(params.userId) : [];
    const nextMemory = mergeWebsiteMemory(params.conversation, {
      kind: "website_builder",
      siteIntent: selectedIntent,
      formInput,
      currentQuestionKey: step.widget.field,
      preIntentStep: null,
      awaitingConfirmation: state.ready,
    });
    const assistantMessage = await createAssistantMessage({
      conversationId: params.conversation.id,
      text: `OK，走${websiteIntentLabel(selectedIntent)}型。${step.prompt}`,
      metadata: {
        ...metadataBase({
          mode: state.ready ? "confirming" : "collecting",
          siteIntent: selectedIntent,
          formInput,
          step,
          ready: state.ready,
          productOptions,
        }),
        quickActions: buildCollectionQuickActions(step, selectedIntent),
      } as Prisma.InputJsonValue,
    });
    await prisma.conversation.update({
      where: { id: params.conversation.id },
      data: { project_memory: nextMemory, last_message_at: new Date() },
    });
    return { handled: true, assistantMessage };
  }

  if (
    activeIntent &&
    memory.awaitingConfirmation &&
    action !== "website_generate" &&
    action !== "website_select_intent" &&
    !memory.siteId
  ) {
    const formInput = seedFormInputForWebsiteIntent(activeIntent, storeWebsiteSupplement(recordValue(memory.formInput), params.text));
    const nextMemory = mergeWebsiteMemory(params.conversation, {
      kind: "website_builder",
      siteIntent: activeIntent,
      formInput,
      currentQuestionKey: "_confirm",
      preIntentStep: null,
      awaitingConfirmation: true,
    });
    const assistantMessage = await createAssistantMessage({
      conversationId: params.conversation.id,
      text: "收到，我已把補充內容併入這次網站 brief。還有要補充的嗎？沒有的話就可以產出網站初稿。",
      metadata: {
        ...metadataBase({
          mode: "confirming",
          siteIntent: activeIntent,
          formInput,
          ready: true,
          stageLabel: "補充確認",
          stageDescription: "最後確認是否還有商品、品牌、風格、版型或上架需求要補充",
          stageIndex: 3,
        }),
        quickActions: websiteSupplementQuickActions(),
      } as Prisma.InputJsonValue,
    });
    await prisma.conversation.update({
      where: { id: params.conversation.id },
      data: { project_memory: nextMemory, last_message_at: new Date() },
    });
    return { handled: true, assistantMessage };
  }

  if (
    activeIntent &&
    memory.siteId &&
    action !== "website_generate" &&
    action !== "website_select_intent" &&
    !shouldCollectWebsiteInput(action)
  ) {
    if (action === "website_view_code") {
      const site = await prisma.site.findFirst({
        where: { id: memory.siteId, user_id: params.userId, deleted_at: null },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      });
      const schema = site?.versions[0]?.schema as unknown as SiteSchema | undefined;
      if (site && schema) {
        const html = renderWebsiteHtml(schema);
        const assistantMessage = await createAssistantMessage({
          conversationId: params.conversation.id,
          text: "HTML 已準備好，可以在右側結果面板切到 HTML 查看。",
          metadata: {
            type: "generation_result",
            source: "conversations.messages.website-builder.view-code",
            phase: "website_builder",
            status: "completed",
            siteId: site.id,
            artifactReady: true,
            artifact: {
              kind: "website_html",
              title: schema.title,
              mimeType: "text/html",
              siteId: site.id,
              siteSpec: schema,
              previewHtml: html,
              rawHtml: html,
              htmlCode: html,
              exportUrl: `/site-preview/${site.id}`,
            },
            outputGroups: [
              {
                type: "website",
                title: "網站結果",
                items: [
                  {
                    id: site.id,
                    label: schema.title,
                    artifactKind: "website_html",
                    siteId: site.id,
                    schema,
                    previewHtml: html,
                    htmlCode: html,
                    rawHtml: html,
                    openUrl: `/site-preview/${site.id}`,
                  },
                ],
              },
            ],
            websiteBuilder: {
              mode: "generated",
              siteIntent: activeIntent,
              siteId: site.id,
              formInput: recordValue(memory.formInput),
            },
            quickActions: [],
          } as Prisma.InputJsonValue,
        });
        return { handled: true, assistantMessage };
      }
    }
    const editedMessage = await createEditedWebsiteMessage({
      conversation: params.conversation,
      userId: params.userId,
      siteId: memory.siteId,
      siteIntent: activeIntent,
      formInput: recordValue(memory.formInput),
      instruction: params.text,
    });
    if (editedMessage) return { handled: true, assistantMessage: editedMessage };
  }
  if (!activeIntent) {
    const formInput = recordValue(memory.formInput);
    const nextMemory = mergeWebsiteMemory(params.conversation, {
      kind: "website_builder",
      siteIntent: null,
      formInput,
      currentQuestionKey: null,
      preIntentStep: null,
      awaitingConfirmation: false,
    });
    const assistantMessage = await createAssistantMessage({
      conversationId: params.conversation.id,
      text: "嗨！很高興能幫你規劃新網頁。在開始搜集資料之前，想先確認這個網站最主要的任務是什麼？",
      metadata: {
        ...metadataBase({
          mode: "entry",
          formInput,
          stageLabel: "類別確認",
          stageDescription: "先確認一頁式網站偏商品介紹／導購型，或品牌形象／公司介紹型",
          stageIndex: 0,
        }),
        quickActions: quickActionsForIntentSelection(),
      } as Prisma.InputJsonValue,
    });
    await prisma.conversation.update({
      where: { id: params.conversation.id },
      data: { project_memory: nextMemory, last_message_at: new Date() },
    });
    return { handled: true, assistantMessage };
  }

  let formInput = recordValue(memory.formInput);
  if (memory.siteIntent && action !== "website_generate" && action !== "website_select_intent") {
    formInput = storeSubmittedInput({
      siteIntent: activeIntent,
      formInput,
      currentQuestionKey: memory.currentQuestionKey,
      text: params.text,
      action,
      productData: recordValue(params.quickReply?.productData),
      uploadedImageUrls: params.uploadedImageUrls,
    });
  }

  const state = buildCollectionState(activeIntent, formInput);
  if (isGenerateRequest(params.text, action) && (state.ready || memory.awaitingConfirmation)) {
    const assistantMessage = await createGeneratedWebsite({
      conversation: params.conversation,
      userId: params.userId,
      siteIntent: activeIntent,
      formInput,
    });
    return { handled: true, assistantMessage };
  }

  const step = state.currentStep;
  const productOptions = step.widget.kind === "product-card" ? await listOwnedProductOptions(params.userId) : [];
  const nextMemory = mergeWebsiteMemory(params.conversation, {
    kind: "website_builder",
    siteIntent: activeIntent,
    formInput,
    currentQuestionKey: step.widget.field,
    awaitingConfirmation: state.ready,
  });
  const intro =
    action === "website_select_intent" || selectedIntent
      ? `OK，走${websiteIntentLabel(activeIntent)}型。`
      : "";
  const assistantMessage = await createAssistantMessage({
    conversationId: params.conversation.id,
    text: `${intro}${step.prompt}`,
    metadata: {
      ...metadataBase({
        mode: state.ready ? "confirming" : "collecting",
        siteIntent: activeIntent,
        formInput,
        step,
        ready: state.ready,
        productOptions,
      }),
      quickActions: buildCollectionQuickActions(step, activeIntent),
    } as Prisma.InputJsonValue,
  });
  await prisma.conversation.update({
    where: { id: params.conversation.id },
    data: {
      project_memory: nextMemory,
      last_message_at: new Date(),
      ...(params.conversation.title === "新對話" || params.conversation.title === "New Conversation"
        ? { title: params.text.slice(0, 32) }
        : {}),
    },
  });
  return { handled: true, assistantMessage };
}
