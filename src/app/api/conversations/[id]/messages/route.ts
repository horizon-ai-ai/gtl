import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DesignTaskStatus, DesignTaskType, MessageRole, MessageType, type DesignTask, type Message, type Prisma } from "@prisma/client";

import { handleError, ok } from "@/lib/api";
import { assertCreditsAvailable, consumeCredits } from "@/lib/credits";
import { prisma } from "@/lib/db";
import { detectRecommendedActions, extractSuggestedItems } from "@/lib/chat-handoff";
import {
  activateDesignTask,
  getOwnedConversation,
  getTaskTitle,
  parseDesignTaskType,
  requireSessionUser,
  resolveRequestedModel,
  resolveTaskCreateInput,
  shapeDesignTask,
  shapeMessage,
  toInputJson,
} from "@/lib/conversation/api";
import {
  getSchema,
  resolveDefaultExecutionStrategy,
  resolveTaskDomain,
} from "@/lib/conversation/schema-registry";
import { inferConversationIntent, type UserIntentResult } from "@/lib/conversation/intent-resolver";
import { dispatchImageGeneration } from "@/lib/conversation/generation-dispatcher";
import { publishConversationEvent } from "@/lib/conversation/stream";
import { marketingIntelligence, type MarketingIntelligencePack } from "@/lib/conversation/marketing-intelligence";
import { flexionComplete, flexionStream, pickModel, rawToCredits } from "@/lib/flexion";
import { handleWebsiteBuilderTurn } from "@/lib/website-builder/orchestrator";
import { routeWebsiteKind } from "@/lib/website-builder/intent-router";
import { saveSiteFiles } from "@/lib/site-assets";
import { appendCustomerInput, cleanTaskSummary } from "@/lib/project-brief";

const CONVERSATION_SYSTEM_PROMPT = [
  "你是 GTL 的設計與行銷顧問助理，請以繁體中文回覆。",
  "你不是問卷機器。不要一次列出大量問題，不要把 schema 欄位整包丟給使用者。",
  "每一輪最多問 1 個主要問題，必要時可附 1 個很短補充問題。",
  "G3 設計需求流程必須依序走：Step 1 資訊內容確認、Step 2 設計感覺確認、Step 3 規格與形式確認、Step 4 補充確認、Step 5 產出初稿。",
  "最多只連續收集 3 到 5 輪。使用者答不完整、表示不知道、要求你決定，或已走到補充確認後，請停止追問，直接提出你的建議方向與可執行第一版。",
  "設計任務開場先確認要放上的資訊內容或請客戶上傳素材，再確認整體設計感覺；不要一開始問完整品牌理念、個性、客群、使用場景清單。",
  "使用者沒想法時，請給風格方向與參考靈感平台/圖片方向讓客戶挑，例如 Pinterest、Behance、Dribbble、Freepik 對應的風格用途。",
  "使用者沒想法或叫你決定時，請先提出你的推薦方向與理由，再補下一個最小缺口。",
  "如果已足夠產生合理第一版，整理 brief 並建議可以產生。",
].join("\n");

type G3FlowStep = {
  designStep: "feeling" | "info" | "spec" | "supplement" | "done";
  stageIndex: number;
  stageLabel: string;
  stageDescription: string;
  instruction: string;
};

const G3_FEELING_OPTIONS = [
  { label: "專業穩重", value: "我想要專業穩重的感覺。" },
  { label: "高級精品", value: "我想要高級精品、留白、有質感的感覺。" },
  { label: "科技感", value: "我想要科技感、俐落、智慧化的感覺。" },
  { label: "簡約乾淨", value: "我想要簡約乾淨、清楚好讀的感覺。" },
  { label: "溫暖親切", value: "我想要溫暖親切、舒服生活感的感覺。" },
  { label: "創意活潑", value: "我想要創意活潑、有記憶點的感覺。" },
];

const G3_INFO_OPTIONS = [
  { label: "補品牌/公司名", value: "我先補品牌或公司名稱：" },
  { label: "補聯絡資訊", value: "我先補需要放上的電話、Email、地址或社群：" },
  { label: "補 Logo/QR Code", value: "我有 Logo、QR Code 或品牌素材要補充。" },
  {
    label: "請你先整理",
    value: "我資料還不完整，請你先依目前內容整理建議。",
    action: "ask_ai_recommendation",
  },
];

const G3_SPEC_OPTIONS = [
  { label: "單面/雙面", value: "規格形式：我想做單面或雙面。" },
  { label: "橫式/直式", value: "規格形式：我想做橫式或直式。" },
  { label: "尺寸先建議", value: "尺寸我還不確定，請你先依常見用途建議。" },
  { label: "有印刷/輸出", value: "這次有印刷或輸出需求，數量和條件我接著補。" },
];

const G3_SUPPLEMENT_OPTIONS = [
  { label: "補充參考圖", value: "我想補充參考圖或喜歡的風格。" },
  { label: "補充限制", value: "我想補充避免事項或一定要保留的內容。" },
  { label: "產生第一版", value: "目前先這樣，請產生第一版。", action: "proceed_generate" },
];

function g3FlowStep(clarificationCount: number, canGenerate = false): G3FlowStep {
  if (canGenerate || clarificationCount >= 4) {
    return {
      designStep: "done",
      stageIndex: 4,
      stageLabel: "產出初稿",
      stageDescription: "需求已可整理成第一版，資訊不足處用合理假設補齊",
      instruction: [
        "現在是 G3 Step 5：產出初稿。",
        "不要再問一串問題。請整理目前已知需求，提出可執行第一版，並明確提供「產生第一版」行動。",
      ].join("\n"),
    };
  }
  if (clarificationCount >= 3) {
    return {
      designStep: "supplement",
      stageIndex: 3,
      stageLabel: "補充確認",
      stageDescription: "最後確認是否還有參考圖、限制或輸出條件要補充",
      instruction: [
        "現在是 G3 Step 4：詢問客戶是否還有要補充的。",
        "請只做最後一次補充確認，不要重開基本資料問卷。",
        "若客戶沒有補充或不確定，請直接整理建議並準備產生第一版。",
      ].join("\n"),
    };
  }
  if (clarificationCount >= 2) {
    return {
      designStep: "spec",
      stageIndex: 2,
      stageLabel: "規格與形式確認",
      stageDescription: "確認單雙面、橫直式、尺寸、印刷/輸出等會影響落地的形式",
      instruction: [
        "現在是 G3 Step 3：規格與形式確認。",
        "請詢問單雙面、橫直式、尺寸或印刷輸出中最影響本任務的一項即可。",
        "可以提供常見選項讓客戶點選，不要一次列完整規格表。",
      ].join("\n"),
    };
  }
  if (clarificationCount >= 1) {
    return {
      designStep: "feeling",
      stageIndex: 1,
      stageLabel: "設計感覺確認",
      stageDescription: "確認整體設計感覺，並引導客戶可傳喜歡的照片或參考圖",
      instruction: [
        "現在是 G3 Step 2：設計感覺確認。",
        "請詢問使用者希望整體設計風格給人的感覺，並給 4 到 6 個可選方向。",
        "可引導客戶上傳喜歡的照片或參考圖。",
        "若客戶沒想法，請提供風格＋參考平台方向讓客戶挑：Pinterest（日系、韓系、情境感）、Behance（美式商業風格）、Dribbble（歐美 UI 科技風）、Freepik（模板商業風格）。",
      ].join("\n"),
    };
  }
  return {
    designStep: "info",
    stageIndex: 0,
    stageLabel: "資訊內容確認",
    stageDescription: "先確認要放上的公司名稱、姓名、職稱、電話、Email、地址、Logo、QR Code、社群或其他素材",
    instruction: [
      "現在是 G3 Step 1：資訊內容確認。",
      "請先詢問這次成品需要放哪些資訊內容，例如公司名稱、姓名、職稱、電話、Email、地址、Logo、QR Code、社群或商品/活動文字。",
      "可引導客戶上傳 Logo、參考圖、品牌素材或既有文案。",
      "請給可點選選項，不要一次要求使用者補完所有欄位。",
    ].join("\n"),
  };
}

function g3QuickActions(params: { taskId?: string | null; clarificationCount: number; canGenerate?: boolean }) {
  const withTask = (items: Array<{ label: string; value: string; action?: string }>) =>
    items.map((item) => ({
      ...item,
      action: item.action || "provide_core_info",
      taskId: params.taskId ?? undefined,
    }));
  if (params.canGenerate || params.clarificationCount >= 4) {
    return withTask(G3_SUPPLEMENT_OPTIONS);
  }
  if (params.clarificationCount >= 3) return withTask(G3_SUPPLEMENT_OPTIONS);
  if (params.clarificationCount >= 2) return withTask(G3_SPEC_OPTIONS);
  if (params.clarificationCount >= 1) {
    return withTask([
      ...G3_FEELING_OPTIONS,
      {
        label: "我沒想法",
        value: "我還沒想法，請你先給我幾個風格方向和參考靈感讓我挑。",
        action: "ask_ai_recommendation",
      },
    ]);
  }
  return withTask(G3_INFO_OPTIONS);
}

function messageContentToText(message: Message) {
  const content = message.content as { text?: unknown } | string;
  if (typeof content === "string") return content;
  if (typeof content?.text === "string") return content.text;
  return JSON.stringify(content);
}

async function buildTaskContext(taskId: string | null | undefined) {
  if (!taskId) return { task: null, context: "" };
  const task = await prisma.designTask.findUnique({ where: { id: taskId } });
  if (!task) return { task: null, context: "" };
  const schema = await getSchema(task.task_type);
  const fields = (schema.requirements ?? [])
    .filter((field) => field.required !== false)
    .slice(0, 6)
    .map((field) => `- ${field.label}: ${field.question}`)
    .join("\n");

  return {
    task,
    context: [
      `目前任務：${schema.displayName} (${task.task_type})`,
      `任務標題：${task.title}`,
      task.collected_data ? `已收集資料：${JSON.stringify(task.collected_data)}` : "",
      fields ? `內部需求欄位參考，不可整包列給使用者：\n${fields}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

function buildRecentTurns(history: Message[]) {
  return history
    .filter((message) => message.role === MessageRole.user || message.role === MessageRole.assistant)
    .slice(-12)
    .map((message) => ({
      role: message.role === MessageRole.user ? ("user" as const) : ("assistant" as const),
      content: messageContentToText(message),
    }));
}

async function recordCustomerInputForTask(task: DesignTask | null, text: string) {
  if (!task) return task;
  const collectedData = appendCustomerInput(task.collected_data, text);
  return prisma.designTask.update({
    where: { id: task.id },
    data: {
      collected_data: toInputJson(collectedData),
      last_activity_at: new Date(),
    },
  });
}

function buildStepDecision(params: {
  taskType?: string | null;
  taskId?: string | null;
  canGenerate: boolean;
  needsUserInput: boolean;
  clarificationCount?: number;
  nextActions?: Array<{ label: string; value?: string; action?: string }>;
}) {
  const g3Step = g3FlowStep(params.clarificationCount ?? 0, params.canGenerate);
  const nextActions =
    params.nextActions ??
    (params.canGenerate
      ? [{ label: "產生第一版", action: "proceed_generate", value: "產生第一版" }]
      : []);

  return {
    version: 1,
    phase: params.canGenerate ? "confirming" : "collecting",
    action: params.canGenerate ? "proceed_generate" : "continue",
    domain: "design",
    mode: params.canGenerate ? "organize" : "continue",
    taskType: params.taskType ?? null,
    targetTaskId: params.taskId ?? null,
    userAct: "requesting",
    designStep: g3Step.designStep,
    stageIndex: g3Step.stageIndex,
    stageLabel: g3Step.stageLabel,
    stageDescription: g3Step.stageDescription,
    needsUserInput: params.needsUserInput,
    canGenerate: params.canGenerate,
    shouldShowProgress: false,
    isSoftFlow: true,
    source: "pass1",
    reason: "src_conversation_flow",
    nextTurnHint: null,
    nextActions,
    recommendedDisplay: "consultant_text",
    updatedAt: new Date().toISOString(),
  };
}

function bodyQuickReply(body: Record<string, unknown>) {
  const metadata = body.metadata && typeof body.metadata === "object"
    ? (body.metadata as Record<string, unknown>)
    : {};
  return metadata.quickReply && typeof metadata.quickReply === "object"
    ? (metadata.quickReply as Record<string, unknown>)
    : null;
}

function conversationProjectMemory(conversation: { project_memory: Prisma.JsonValue | null }) {
  return conversation.project_memory && typeof conversation.project_memory === "object" && !Array.isArray(conversation.project_memory)
    ? (conversation.project_memory as Record<string, unknown>)
    : {};
}

function hintedTaskTypeFromText(text: string): DesignTaskType | null {
  const candidates: Array<{ taskType: DesignTaskType; hints: string[] }> = [
    { taskType: DesignTaskType.logo, hints: ["logo", "Logo", "LOGO", "品牌標誌", "品牌Logo", "商標", "字標"] },
    { taskType: DesignTaskType.vi, hints: ["VI", "vi", "品牌識別", "識別系統"] },
    { taskType: DesignTaskType.brand_guideline, hints: ["品牌手冊", "品牌標準", "品牌規範", "guideline"] },
    { taskType: DesignTaskType.business_card, hints: ["名片", "business card"] },
    { taskType: DesignTaskType.dm, hints: ["DM", "dm", "傳單", "摺頁"] },
    { taskType: DesignTaskType.poster, hints: ["海報", "poster"] },
    { taskType: DesignTaskType.catalog, hints: ["型錄", "產品型錄", "catalog"] },
    { taskType: DesignTaskType.menu, hints: ["菜單", "menu", "餐牌"] },
    { taskType: DesignTaskType.packaging, hints: ["包裝", "包裝設計"] },
    { taskType: DesignTaskType.social_post, hints: ["社群圖", "貼文圖", "社群貼文圖"] },
    { taskType: DesignTaskType.banner, hints: ["banner", "橫幅", "廣告圖"] },
    { taskType: DesignTaskType.edm, hints: ["EDM", "edm", "電子報"] },
    { taskType: DesignTaskType.social_copy, hints: ["社群文案", "貼文文案", "小編文案", "IG文案", "FB文案"] },
    { taskType: DesignTaskType.seo_article, hints: ["SEO文章", "seo文章", "部落格文章", "行銷文章", "文章"] },
    { taskType: DesignTaskType.ads_strategy, hints: ["廣告策略", "投放策略", "廣告企劃"] },
    { taskType: DesignTaskType.annual_marketing_strategy, hints: ["年度行銷", "行銷策略", "行銷企劃"] },
  ];
  return candidates.find((candidate) => candidate.hints.some((hint) => text.includes(hint)))?.taskType ?? null;
}

function isFreshTaskRequest(text: string) {
  const hints = ["新的", "重新", "重做", "再開", "另一個", "另外一個", "從頭", "不要沿用"];
  return hints.some((hint) => text.includes(hint));
}

function shouldEscapeWebsiteBuilderForTask(text: string, action: string) {
  if (action.startsWith("website_")) return false;
  const hintedTaskType = hintedTaskTypeFromText(text);
  if (!hintedTaskType) return false;
  const websiteTaskTypes: DesignTaskType[] = [
    DesignTaskType.brand_website,
    DesignTaskType.landing_page,
    DesignTaskType.ecommerce_website,
  ];
  return !websiteTaskTypes.includes(hintedTaskType);
}

function isWebsiteBuilderRequest(params: {
  text: string;
  body: Record<string, unknown>;
  conversation: { project_memory: Prisma.JsonValue | null };
}) {
  const quickReply = bodyQuickReply(params.body);
  const action = typeof quickReply?.action === "string" ? quickReply.action : "";
  const websiteActions = [
    "website_select_intent",
    "website_continue_collecting",
    "website_skip_field",
    "website_ai_assist",
    "website_generate",
    "website_upload_files",
    "website_edit",
    "website_view_code",
    "website_new",
    "website_restart",
    "website_edit_products",
    "website_add_product",
  ];
  const projectMemory = conversationProjectMemory(params.conversation);
  const websiteBuilder =
    projectMemory.websiteBuilder && typeof projectMemory.websiteBuilder === "object"
      ? (projectMemory.websiteBuilder as Record<string, unknown>)
      : {};
  if (websiteBuilder.kind === "website_builder" && shouldEscapeWebsiteBuilderForTask(params.text, action)) {
    return false;
  }
  return (
    websiteActions.includes(action) ||
    websiteBuilder.kind === "website_builder" ||
    routeWebsiteKind(params.text) === "website_builder"
  );
}

function bodyTargetGeneration(body: Record<string, unknown>) {
  const metadata = body.metadata && typeof body.metadata === "object"
    ? (body.metadata as Record<string, unknown>)
    : {};
  const target = metadata.targetGeneration && typeof metadata.targetGeneration === "object"
    ? (metadata.targetGeneration as Record<string, unknown>)
    : null;
  return typeof target?.messageId === "string" && target.messageId.trim()
    ? target.messageId.trim()
    : null;
}

function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function imageUrlsFromAttachments(attachments: unknown[]) {
  return attachments
    .filter((attachment): attachment is Record<string, unknown> => Boolean(attachment) && typeof attachment === "object")
    .filter((attachment) => attachment.type === "image" || (typeof attachment.mimeType === "string" && attachment.mimeType.startsWith("image/")))
    .map((attachment) => (typeof attachment.url === "string" ? attachment.url : ""))
    .filter(Boolean);
}

function attachmentType(file: File): "image" | "video" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

function isSupportedConversationFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/pdf") return true;
  if (file.type === "application/postscript") return true;
  if (file.type === "application/illustrator") return true;
  if (file.type === "application/vnd.adobe.illustrator") return true;
  if (file.type === "image/vnd.adobe.photoshop") return true;
  const name = file.name.toLowerCase();
  return [".ai", ".eps", ".pdf", ".psd", ".svg"].some((extension) => name.endsWith(extension));
}

function normalizeMessageAttachments(attachments: unknown[]) {
  return attachments
    .filter((attachment): attachment is Record<string, unknown> => Boolean(attachment) && typeof attachment === "object")
    .map((attachment) => ({
      url: typeof attachment.url === "string" ? attachment.url : "",
      type:
        attachment.type === "image" || attachment.type === "video" || attachment.type === "file"
          ? attachment.type
          : typeof attachment.mimeType === "string" && attachment.mimeType.startsWith("image/")
            ? "image"
            : "file",
      originalName: typeof attachment.originalName === "string" ? attachment.originalName : null,
      mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : null,
      assetKind: typeof attachment.assetKind === "string" ? attachment.assetKind : null,
      field: typeof attachment.field === "string" ? attachment.field : null,
    }))
    .filter((attachment) => attachment.url);
}

async function parseMessageBody(req: NextRequest, userId: string) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const attachments = Array.isArray(body.attachments)
      ? normalizeMessageAttachments(body.attachments)
      : [];
    return {
      body: {
        ...body,
        attachments,
        metadata: {
          ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
          ...(attachments.length > 0 ? { attachments } : {}),
        },
      },
      uploadedImageUrls: imageUrlsFromAttachments(attachments),
    };
  }

  const formData = await req.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0 && isSupportedConversationFile(value))
    .slice(0, 8);
  const metadata = parseJsonField(formData.get("metadata"));
  const designTaskIds = parseJsonField(formData.get("designTaskIds"));
  const uploadedUrls = files.length > 0
    ? await saveSiteFiles(files, userId, "conversation")
    : [];

  const attachments = uploadedUrls.map((url, index) => {
    const file = files[index];
    return {
      url,
      type: file ? attachmentType(file) : "file",
      originalName: file?.name || null,
      mimeType: file?.type || null,
      assetKind:
        metadata && typeof metadata === "object" && "upload" in metadata
          ? typeof (metadata as { upload?: { assetKind?: unknown } }).upload?.assetKind === "string"
            ? (metadata as { upload?: { assetKind?: string } }).upload?.assetKind
            : null
          : null,
      field:
        metadata && typeof metadata === "object" && "upload" in metadata
          ? typeof (metadata as { upload?: { field?: unknown } }).upload?.field === "string"
            ? (metadata as { upload?: { field?: string } }).upload?.field
            : null
          : null,
    };
  });
  const uploadedImageUrls = imageUrlsFromAttachments(attachments);

  return {
    body: {
      content: typeof formData.get("content") === "string" ? String(formData.get("content")) : "",
      metadata: metadata && typeof metadata === "object" ? { ...metadata, attachments } : { attachments },
      attachments,
      designTaskIds: Array.isArray(designTaskIds) ? designTaskIds : undefined,
      selectedModel: typeof formData.get("selectedModel") === "string" ? String(formData.get("selectedModel")) : undefined,
      uploadedImageUrls,
      uploadedAttachmentUrls: uploadedUrls,
    },
    uploadedImageUrls,
  };
}

function generationSourceMessageId(body: Record<string, unknown>) {
  const quickReply = bodyQuickReply(body);
  const quickReplySource =
    typeof quickReply?.sourceMessageId === "string" && quickReply.sourceMessageId.trim()
      ? quickReply.sourceMessageId.trim()
      : null;
  return quickReplySource || bodyTargetGeneration(body);
}

function isGenerateRequest(params: { text: string; body: Record<string, unknown> }) {
  const quickReply = bodyQuickReply(params.body);
  const action = typeof quickReply?.action === "string" ? quickReply.action : "";
  if (action === "proceed_generate") return true;
  return false;
}

function isDelegatingToAi(params: { text: string; body: Record<string, unknown> }) {
  const quickReply = bodyQuickReply(params.body);
  const action = typeof quickReply?.action === "string" ? quickReply.action : "";
  if (action === "ask_ai_recommendation" || action === "use_placeholder") return true;
  const text = params.text;
  const hints = [
    "不知道",
    "不確定",
    "沒想法",
    "你決定",
    "你建議",
    "幫我決定",
    "先建議",
    "整理建議",
    "資料還不完整",
    "資料不完整",
    "給我幾個方向",
    "參考靈感",
    "方向讓我挑",
  ];
  return hints.some((hint) => text.includes(hint));
}

function buildFlowInstruction(params: {
  task: { clarification_count: number } | null;
  text: string;
  body: Record<string, unknown>;
}) {
  if (!params.task) return "";
  const currentStep = g3FlowStep(params.task.clarification_count);
  const shouldGenerate = isGenerateRequest({ text: params.text, body: params.body });
  const shouldRecommend =
    isDelegatingToAi({ text: params.text, body: params.body }) ||
    params.task.clarification_count >= 4;

  if (shouldGenerate) {
    return [
      "# 目前使用者已要求產生第一版",
      "- 這一輪進入交付模式，不可再反問需求。",
      "- 請直接輸出第一版成果或第一版設計概念，包含可執行的版面/文字/視覺方向。",
      "- 資訊不足處請用清楚標註的合理假設補齊，不要把問題丟回給使用者。",
      "- 結尾只給 2 到 3 個可修改方向，不要再要求使用者先回答才能繼續。",
    ].join("\n");
  }

  if (shouldRecommend) {
    return [
      "# 目前已達建議模式",
      "- 使用者已表示不確定，或已走到 G3 補充確認後的收斂上限。",
      "- 請停止追問，先提出你的推薦方向、理由與第一版可採用的參考方向。",
      "- 請用聊天顧問語氣回覆，不要把這輪包裝成「AI 文字成果」、「設計成果」、「交付文件」或可直接交付的稿件。",
      "- 這一輪不是生成交付，不可宣稱已經產生圖像、網站、文案成品，也不可輸出像最終交付物的完整結果。",
      "- 如果已取得搜尋或參考資料，先用那些資料整理 2 到 4 個方向，讓客戶知道你不是憑空猜。",
      "- 若是設計任務，請提供風格＋參考平台/圖片方向讓客戶挑，例如 Pinterest（日系、韓系、情境感）、Behance（美式商業風格）、Dribbble（歐美 UI 科技風）、Freepik（模板商業風格）。",
      "- 可以列 2 到 4 個可選方向，但每個方向必須能直接往第一版推進。",
      "- 結尾要明確告訴使用者：可以直接選一個方向，或按產生第一版。",
    ].join("\n");
  }

  const remaining = Math.max(0, 4 - params.task.clarification_count);
  return [
    "# 目前仍在收集需求",
    currentStep.instruction,
    `- 還有最多 ${remaining} 輪可以釐清。`,
    "- 本輪最多只問 1 個主要問題。",
    "- 問題必須符合 G3 設計對話流程，不要跳回完整品牌問卷。",
    "- 若使用者這輪仍答不出來或表示沒想法，下一輪請直接給風格建議與參考方向，不要繼續問卷化。",
  ].join("\n");
}

function jsonSummary(value: unknown) {
  if (!value) return "無";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function createGenerationResult(params: {
  conversationId: string;
  task: NonNullable<Awaited<ReturnType<typeof resolveRequestedTask>>>;
  model: string;
  instruction: string;
  sourceMessageId?: string | null;
}) {
  const schema = await getSchema(params.task.task_type);
  const executionStrategy =
    params.task.execution_strategy ||
    resolveDefaultExecutionStrategy(params.task.task_type);
  const domain = resolveTaskDomain(params.task.task_type);
  const isImageTask = domain === "image";

  if (isImageTask) {
    const dispatched = await dispatchImageGeneration({
      conversationId: params.conversationId,
      userId: params.task.user_id,
      task: params.task,
      instruction: params.instruction,
      sourceMessageId: params.sourceMessageId,
    });
    if (dispatched) {
      return {
        updatedTask: dispatched.task,
        message: dispatched.message,
        usage: { input_tokens: 0, output_tokens: 0 },
        credits: dispatched.credits,
      };
    }
  }

  const prompt = [
    `任務：${params.task.title}`,
    `任務類型：${params.task.task_type}`,
    `模板：${schema.displayName}`,
    `交付策略：${executionStrategy}`,
    `需求資料：${jsonSummary(params.task.collected_data)}`,
    `已解析需求：${jsonSummary(params.task.resolved_requirements)}`,
    `缺少需求：${jsonSummary(params.task.missing_requirements)}`,
    params.instruction ? `使用者本輪指令：${params.instruction}` : "",
    isImageTask
      ? [
          "請直接輸出第一版設計提案，定位為 GTL 已經開始產出第一版。",
          "不要說你無法生成圖像，不要叫使用者拿去給設計師。",
          "如果目前只能產出影像 brief，請用「第一版 Logo 設計提案」呈現，包含構圖、字標、圖形、色彩、可交給圖像生成模型的提示詞、避免事項。",
          "資訊不足時用合理假設補齊。",
        ].join("\n")
      : [
          "請直接輸出第一版成果，不要反問。",
          "資訊不足時用合理假設補齊，並清楚標註假設。",
        ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await flexionComplete({
    model: params.model,
    messages: [
      {
        role: "system",
        content: "你是 GTL 的設計交付引擎。使用者已確認產生第一版時，必須直接交付第一版，不可回覆無法生成或轉交設計師。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.55,
    max_tokens: 1800,
  });
  const credits = rawToCredits(result.model, result.usage);

  const [updatedTask, message] = await prisma.$transaction([
    prisma.designTask.update({
      where: { id: params.task.id },
      data: {
        execution_strategy: executionStrategy,
        status: DesignTaskStatus.completed,
        summary: cleanTaskSummary(params.task.summary) || null,
        last_activity_at: new Date(),
      },
    }),
    prisma.message.create({
      data: {
        conversation_id: params.conversationId,
        role: MessageRole.assistant,
        message_type: MessageType.generation_result,
        design_task_id: params.task.id,
        content: {
          type: isImageTask ? "image_brief" : "text_document",
          status: "completed",
          taskId: params.task.id,
          taskType: params.task.task_type,
          executionStrategy,
          domain,
          text: result.text,
        },
        metadata: {
          source: "conversations.messages.auto-generate",
          domain,
          quickActions: [
            {
              label: "調整方向",
              value: "我想調整方向：",
              action: "provide_core_info",
              taskId: params.task.id,
            },
            {
              label: "補充參考",
              value: "補充參考：",
              action: "provide_core_info",
              taskId: params.task.id,
            },
          ],
        } as Prisma.InputJsonValue,
        tokens_input: result.usage.input_tokens,
        tokens_output: result.usage.output_tokens,
        credits_used: credits,
        model: result.model,
      },
    }),
    prisma.conversation.update({
      where: { id: params.conversationId },
      data: { last_message_at: new Date(), active_design_task_id: params.task.id },
    }),
  ]);

  return { updatedTask, message, usage: result.usage, credits };
}

function buildOpeningReply(taskType: string | null | undefined) {
  if (!taskType) return null;
  if (taskType === "logo") {
    return "可以，我們先確認這張 Logo 最基本要承載的品牌內容。先給我品牌名稱、產業或產品類型；如果有舊 Logo、參考圖或想保留的符號，也可以直接上傳。";
  }
  if (taskType === "brand_guideline" || taskType === "vi") {
    return "可以，我們先整理這套品牌識別的基礎資料。先給我品牌名稱、目前已有的 Logo/標準字/主色，還有這次最需要落地的應用項目，例如名片、社群、包裝或網站。";
  }
  if (taskType === "business_card") {
    return "可以，我們先確認名片上要放的資訊。先補姓名、職稱、公司/品牌名、電話、Email；如果有 Logo、QR Code 或社群連結，也可以一起上傳。";
  }
  if (taskType === "poster" || taskType === "dm" || taskType === "banner" || taskType === "social_post") {
    return "可以，我們先確認這張視覺要傳達的主內容。先給我活動/產品名稱、主標、必要文案和使用場景；如果有商品照、Logo 或參考風格，也可以直接上傳。";
  }
  if (taskType === "packaging" || taskType === "catalog" || taskType === "menu") {
    return "可以，我們先確認這份商品型設計要呈現的內容。先給我商品或系列名稱、主要品項、規格/價格等必要資訊；商品照、Logo 或既有資料也可以直接上傳。";
  }
  if (taskType === "brand_website" || taskType === "landing_page" || taskType === "ecommerce_website") {
    return "可以，我們先確認網站要使用的核心圖文。先給我品牌/產品名稱、網站目的、主要商品或服務；如果有圖片、Logo、參考網站或既有文案，可以直接上傳。";
  }
  if (taskType === "social_copy" || taskType === "seo_article") {
    return "可以，我們先確認這篇內容要使用的材料。先給我品牌/產品名稱、主題、想強調的重點、連結或既有文字；如果還沒想好，我可以先幫你整理幾個切角。";
  }
  return "可以，我們先確認這次成品要使用的核心內容。先給我名稱、用途、一定要放的文字或素材；如果資料還不完整，也可以先讓我整理方向。";
}

function buildOpeningQuickActions(taskType: string | null | undefined, taskId: string | null | undefined) {
  if (!taskType) return [];
  return g3QuickActions({ taskId, clarificationCount: 0 });
}

function numberedChoice(line: string) {
  const trimmed = line.trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot > 2) return null;
  const prefix = trimmed.slice(0, dot);
  if (![...prefix].every((char) => char >= "0" && char <= "9")) return null;
  const content = trimmed.slice(dot + 1).trim();
  return content ? { marker: prefix, content } : null;
}

function choiceLabel(content: string) {
  let text = content.trim();
  if (text.startsWith("**")) {
    const end = text.indexOf("**", 2);
    if (end > 2) text = text.slice(2, end).trim();
  }
  const colon = text.indexOf("：");
  const asciiColon = text.indexOf(":");
  const cut =
    colon >= 0 && asciiColon >= 0
      ? Math.min(colon, asciiColon)
      : colon >= 0
        ? colon
        : asciiColon;
  if (cut > 0) text = text.slice(0, cut).trim();
  return text || content.slice(0, 18);
}

function buildChoiceQuickActions(text: string, taskId: string | null | undefined) {
  const choices = text
    .split("\n")
    .map(numberedChoice)
    .filter((choice): choice is { marker: string; content: string } => Boolean(choice))
    .slice(0, 5);
  if (choices.length < 2) return [];
  return choices.map((choice) => {
    const label = choiceLabel(choice.content);
    return {
      label,
      value: `我想選「${label}」這個方向，請接著幫我收斂成可執行的設計 brief。`,
      action: "choose_direction",
      taskId,
    };
  });
}

function isOpeningTurn(params: { text: string; history: Message[]; taskType?: string | null; taskId?: string | null }) {
  if (!params.taskType) return false;
  const priorAssistantCount = params.taskId
    ? params.history.filter((message) => message.role === MessageRole.assistant && message.design_task_id === params.taskId).length
    : params.history.filter((message) => message.role === MessageRole.assistant).length;
  if (priorAssistantCount > 0) return false;
  const normalized = params.text.trim().toLowerCase();
  if (normalized.length > 40) return false;
  return true;
}

async function findConversationActiveTask(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { active_design_task_id: true },
  });
  if (!conversation?.active_design_task_id) return null;
  return prisma.designTask.findFirst({
    where: {
      id: conversation.active_design_task_id,
      conversation_id: conversationId,
      user_id: userId,
    },
  });
}

async function createDesignTaskForType(params: {
  conversationId: string;
  userId: string;
  taskType: DesignTaskType;
  body: Record<string, unknown>;
  activeTask?: Awaited<ReturnType<typeof findConversationActiveTask>> | null;
  intent?: UserIntentResult | null;
}) {
  const resolved = await resolveTaskCreateInput({ taskType: params.taskType });
  const task = await prisma.designTask.create({
    data: {
      conversation_id: params.conversationId,
      user_id: params.userId,
      task_type: resolved.taskType,
      template_key: resolved.templateKey,
      template_label: resolved.templateLabel,
      execution_strategy: resolved.executionStrategy,
      title: getTaskTitle(resolved.taskType, params.body.title),
      status: DesignTaskStatus.active,
      collected_data: toInputJson(params.body.collectedData),
      current_clarification_goal: {
        switchedFromTaskId: params.activeTask?.id ?? null,
        switchedFromTaskType: params.activeTask?.task_type ?? null,
        reason: params.intent?.reasoning || "task_type_detected",
      } as Prisma.InputJsonValue,
      last_activity_at: new Date(),
    },
  });
  await activateDesignTask(params.conversationId, task.id);
  return task;
}

async function resolveRequestedTask(params: {
  body: Record<string, unknown>;
  conversationId: string;
  userId: string;
  text: string;
  inferredIntent?: UserIntentResult | null;
  activeTask?: Awaited<ReturnType<typeof findConversationActiveTask>> | null;
}) {
  const designTaskIds = Array.isArray(params.body.designTaskIds)
    ? params.body.designTaskIds.filter((id): id is string => typeof id === "string")
    : [];
  const quickReply = bodyQuickReply(params.body);
  const quickReplyTaskId = typeof quickReply?.taskId === "string" ? quickReply.taskId : null;
  const explicitTaskId =
    typeof params.body.designTaskId === "string"
      ? params.body.designTaskId
      : quickReplyTaskId || designTaskIds[0] || null;

  if (explicitTaskId) {
    const task = await prisma.designTask.findFirst({
      where: { id: explicitTaskId, conversation_id: params.conversationId, user_id: params.userId },
    });
    if (task) {
      await activateDesignTask(params.conversationId, task.id);
      return task;
    }
  }

  if (typeof params.body.taskType === "string" || typeof params.body.templateKey === "string") {
    const resolved = await resolveTaskCreateInput(params.body);
    const task = await prisma.designTask.create({
      data: {
        conversation_id: params.conversationId,
        user_id: params.userId,
        task_type: resolved.taskType,
        template_key: resolved.templateKey,
        template_label: resolved.templateLabel,
        execution_strategy: resolved.executionStrategy,
        title: getTaskTitle(resolved.taskType, params.body.title),
        status: DesignTaskStatus.active,
        collected_data: toInputJson(params.body.collectedData),
        last_activity_at: new Date(),
      },
    });
    await activateDesignTask(params.conversationId, task.id);
    return task;
  }

  const inferredTaskType = parseDesignTaskType(params.inferredIntent?.taskType) || hintedTaskTypeFromText(params.text);
  if (inferredTaskType) {
    const shouldCreateFresh = isFreshTaskRequest(params.text);
    if (!shouldCreateFresh && params.activeTask?.task_type === inferredTaskType) {
      return params.activeTask;
    }
    if (!shouldCreateFresh) {
      const reusableStatuses = params.inferredIntent?.action === "refine" || params.inferredIntent?.wantsGeneration
        ? [DesignTaskStatus.active, DesignTaskStatus.collecting, DesignTaskStatus.paused, DesignTaskStatus.completed]
        : [DesignTaskStatus.active, DesignTaskStatus.collecting, DesignTaskStatus.paused];
      const reusableTask = await prisma.designTask.findFirst({
        where: {
          conversation_id: params.conversationId,
          user_id: params.userId,
          task_type: inferredTaskType,
          status: { in: reusableStatuses },
        },
        orderBy: [{ last_activity_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
      });
      if (reusableTask) {
        if (params.activeTask?.id !== reusableTask.id) {
          await activateDesignTask(params.conversationId, reusableTask.id);
          return prisma.designTask.findUnique({ where: { id: reusableTask.id } });
        }
        return reusableTask;
      }
    }

    return createDesignTaskForType({
      conversationId: params.conversationId,
      userId: params.userId,
      taskType: inferredTaskType,
      body: params.body,
      activeTask: params.activeTask,
      intent: params.inferredIntent,
    });
  }

  return params.activeTask ?? null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);
    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(Math.floor(limitParam), 1), 200)
      : 100;

    const messages = await prisma.message.findMany({
      where: { conversation_id: params.id },
      orderBy: { created_at: "asc" },
      take: limit,
    });

    return ok({ docs: messages.map(shapeMessage), totalDocs: messages.length, limit });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    const conversation = await getOwnedConversation(params.id, user.id);
    const parsedBody = await parseMessageBody(req, user.id);
    const body = parsedBody.body as Record<string, unknown>;
    const text = typeof body.content === "string" ? body.content.trim() : "";
    if (!text) {
      return ok({ skipped: true });
    }

    await assertCreditsAvailable(user.id);
    const shouldHandleWebsiteBuilder = isWebsiteBuilderRequest({ text, body, conversation });
    const preTaskHistory = shouldHandleWebsiteBuilder
      ? []
      : await prisma.message.findMany({
          where: { conversation_id: params.id },
          orderBy: { created_at: "asc" },
          take: 50,
        });
    const preQuickReply = bodyQuickReply(body);
    const activeTask = shouldHandleWebsiteBuilder
      ? null
      : await findConversationActiveTask(params.id, user.id);
    const earlyIntent = shouldHandleWebsiteBuilder
      ? null
      : await inferConversationIntent({
          userMessage: text,
          recentTurns: buildRecentTurns(preTaskHistory),
          activeTaskType: activeTask?.task_type ?? null,
          quickReplyAction: typeof preQuickReply?.action === "string" ? preQuickReply.action : null,
          model: pickModel({ plan: "free", taskHint: "fast" }),
        });
    let task = shouldHandleWebsiteBuilder
      ? null
      : await resolveRequestedTask({
          body,
          conversationId: params.id,
          userId: user.id,
          text,
          inferredIntent: earlyIntent,
          activeTask,
        });
    task = await recordCustomerInputForTask(task, text);

    const userMessage = await prisma.message.create({
      data: {
        conversation_id: params.id,
        role: MessageRole.user,
        message_type: MessageType.ai,
        content: { type: "text", text },
        metadata: {
          ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
          source: "conversations.messages",
          activeDesignTaskId: task?.id ?? null,
          uploadedImageUrls: parsedBody.uploadedImageUrls,
        } as Prisma.InputJsonValue,
        design_task_id: task?.id,
      },
    });
    publishConversationEvent(params.id, "message.created", shapeMessage(userMessage));

    if (shouldHandleWebsiteBuilder) {
      const websiteResult = await handleWebsiteBuilderTurn({
        conversation,
        userId: user.id,
        text,
        quickReply: bodyQuickReply(body),
        uploadedImageUrls: parsedBody.uploadedImageUrls,
      });
      if (websiteResult.handled && websiteResult.assistantMessage) {
        return NextResponse.json({
          userMessage: shapeMessage(userMessage),
          assistantMessage: shapeMessage(websiteResult.assistantMessage),
          streaming: false,
        });
      }
    }

    const history = await prisma.message.findMany({
      where: { conversation_id: params.id },
      orderBy: { created_at: "asc" },
      take: 50,
    });
    const sub = await prisma.subscription.findUnique({
      where: { user_id: user.id },
      include: { plan: true },
    });
    const planCode = sub?.plan.code ?? "free";
    const requestedModel =
      typeof body.selectedModel === "string" && body.selectedModel.trim()
        ? body.selectedModel.trim()
        : typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : conversation.ai_model || task?.preferred_model || "";
    // Never forward the raw client value: validate against the plan allowlist
    // and clamp to the plan default on a miss.
    const model = resolveRequestedModel(planCode, requestedModel);
    const quickReply = bodyQuickReply(body);
    const intent = earlyIntent || await inferConversationIntent({
      userMessage: text,
      recentTurns: buildRecentTurns(history),
      activeTaskType: task?.task_type ?? null,
      quickReplyAction: typeof quickReply?.action === "string" ? quickReply.action : null,
      model: pickModel({ plan: planCode, taskHint: "fast" }),
    });
    const { context: taskContext } = await buildTaskContext(task?.id);
    const flowInstruction = buildFlowInstruction({ task, text, body });
    const taskDomain = task ? resolveTaskDomain(task.task_type) : null;
    const delegatedToAi = isDelegatingToAi({ text, body });
    const explicitGenerate = isGenerateRequest({ text, body });
    const forceGenerate =
      explicitGenerate ||
      (!delegatedToAi &&
        (intent?.action === "generate" ||
          intent?.wantsGeneration === true ||
          (Boolean(task) && taskDomain === "image" && intent?.action === "refine")));
    const forceRecommendation =
      Boolean(task) &&
      !forceGenerate &&
      (delegatedToAi || (task?.clarification_count ?? 0) >= 4);
    const openingReply = !forceGenerate && isOpeningTurn({ text, history: preTaskHistory, taskType: task?.task_type, taskId: task?.id })
      ? buildOpeningReply(task?.task_type)
      : null;

    if (forceGenerate && task) {
      const generated = await createGenerationResult({
        conversationId: params.id,
        task,
        model,
        instruction: text,
        sourceMessageId: generationSourceMessageId(body),
      });
      await consumeCredits(user.id, generated.credits);
      publishConversationEvent(params.id, "message.completed", shapeMessage(generated.message));
      return NextResponse.json({
        userMessage: shapeMessage(userMessage),
        assistantMessage: shapeMessage(generated.message),
        task: shapeDesignTask(generated.updatedTask),
        streaming: false,
      });
    }

    let intelligence: MarketingIntelligencePack | null = null;
    try {
      intelligence = await marketingIntelligence.maybeResearch({
        userMessage: forceRecommendation
          ? `${text}\n請補充可用的設計參考案例、視覺靈感與代表圖。`
          : text,
        task,
        recentTurns: buildRecentTurns(history),
        forceSearch: forceRecommendation,
        forceVisualReferences: forceRecommendation,
      });
    } catch (error) {
      console.warn("[conversations/:id/messages] marketing intelligence skipped:", error);
    }

    let assistantText = "";
    let usage = { input_tokens: 0, output_tokens: 0 };
    let completionModel = model;
    let streamingAssistantMessage: Message | null = null;

    if (openingReply) {
      assistantText = openingReply;
    } else {
      const marketingContext = marketingIntelligence.buildPromptContext(intelligence);
      const messages = [
        {
          role: "system" as const,
          content: [
            CONVERSATION_SYSTEM_PROMPT,
            taskContext,
            flowInstruction,
            marketingContext ? `# 已搜尋的最新市場資訊\n${marketingContext}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        ...history.map((message) => ({
          role: message.role as "user" | "assistant" | "system" | "tool",
          content: messageContentToText(message),
        })),
      ];

      streamingAssistantMessage = await prisma.message.create({
        data: {
          conversation_id: params.id,
          role: MessageRole.assistant,
          message_type: MessageType.ai,
          content: { type: "text", text: "" },
          metadata: {
            source: "conversations.messages.streaming",
            status: "streaming",
            phase: "streaming",
            activeDesignTaskId: task?.id ?? null,
          } as Prisma.InputJsonValue,
          design_task_id: task?.id,
          model,
        },
      });
      publishConversationEvent(params.id, "message.created", shapeMessage(streamingAssistantMessage));

      let assembled = "";
      try {
        for await (const evt of flexionStream({ model, messages, temperature: 0.35, stream: true })) {
          if (evt.type === "token") {
            assembled += evt.delta;
            publishConversationEvent(params.id, "message.delta", {
              id: streamingAssistantMessage.id,
              conversation: params.id,
              conversationId: params.id,
              role: MessageRole.assistant,
              messageType: MessageType.ai,
              content: assembled,
              metadata: streamingAssistantMessage.metadata,
              designTaskId: task?.id ?? null,
              createdAt: streamingAssistantMessage.created_at,
            });
          } else if (evt.type === "done") {
            usage = evt.usage;
            completionModel = evt.model;
          }
        }
      } catch (error) {
        console.warn("[conversations/:id/messages] streaming failed, falling back:", error);
        const completion = await flexionComplete({ model, messages, temperature: 0.35 });
        assembled = completion.text;
        usage = completion.usage;
        completionModel = completion.model;
      }
      assistantText = assembled;
    }

    const credits = openingReply ? BigInt(0) : rawToCredits(model, usage);
    const recommendedActions = detectRecommendedActions(assistantText);
    const suggestedItems = extractSuggestedItems(assistantText);
    const generationHints = ["產生", "生成", "第一版", "brief", "草稿"];
    const canGenerate =
      forceGenerate ||
      forceRecommendation ||
      (!openingReply &&
        Boolean(task) &&
        generationHints.some((hint) => assistantText.includes(hint)));
    const openingQuickActions = openingReply
      ? buildOpeningQuickActions(task?.task_type, task?.id)
      : [];
    const g3Actions = task
      ? g3QuickActions({
          taskId: task.id,
          clarificationCount: task.clarification_count,
          canGenerate,
        })
      : [];
    const choiceQuickActions = openingQuickActions.length > 0
      ? []
      : buildChoiceQuickActions(assistantText, task?.id);
    const stepDecision = buildStepDecision({
      taskType: task?.task_type,
      taskId: task?.id,
      clarificationCount: task?.clarification_count ?? 0,
      canGenerate,
      needsUserInput: !canGenerate,
      nextActions:
        openingQuickActions.length > 0
          ? openingQuickActions
          : choiceQuickActions.length > 0
            ? choiceQuickActions
            : g3Actions.length > 0
              ? g3Actions
            : undefined,
    });
    const quickActions =
      forceGenerate && task
        ? [
            {
              label: "調整方向",
              value: "我想調整方向：",
              action: "provide_core_info",
              taskId: task.id,
            },
            {
              label: "補充參考",
              value: "補充參考：",
              action: "provide_core_info",
              taskId: task.id,
            },
          ]
        : openingQuickActions.length > 0
        ? openingQuickActions
        : choiceQuickActions.length > 0
          ? choiceQuickActions
          : g3Actions.length > 0
            ? g3Actions
          : canGenerate
            ? [{ label: "產生第一版", value: "產生第一版", action: "proceed_generate", taskId: task?.id }]
            : task
              ? [
                  {
                    label: "補充資料",
                    value: "補充資料：",
                    action: "provide_core_info",
                    taskId: task.id,
                  },
                ]
              : [];

    const nextClarificationCount =
      task
        ? forceGenerate || forceRecommendation || canGenerate
          ? task.clarification_count
          : Math.min(task.clarification_count + 1, 4)
        : 0;

    const assistantPayload = {
      content: { type: "text", text: assistantText },
      metadata: {
        source: "conversations.messages",
        status: "completed",
        phase: "completed",
        activeDesignTaskId: task?.id ?? null,
        recommendedActions,
        suggestedItems,
        quickActions,
        stepDecision,
        marketingIntelligence: intelligence
          ? {
              query: intelligence.query,
              summary: intelligence.summary,
              searchModel: intelligence.searchModel,
              sources: intelligence.sources,
              visualReferences: intelligence.visualReferences,
              referenceCards: intelligence.visualReferences,
              groundedMode: intelligence.groundedMode,
              createdAt: intelligence.createdAt,
            }
          : null,
      } as Prisma.InputJsonValue,
      design_task_id: task?.id,
      tokens_input: usage.input_tokens,
      tokens_output: usage.output_tokens,
      credits_used: credits,
      model: completionModel,
    };
    const assistantMessage = streamingAssistantMessage
      ? await prisma.message.update({
          where: { id: streamingAssistantMessage.id },
          data: assistantPayload,
        })
      : await prisma.message.create({
          data: {
            conversation_id: params.id,
            role: MessageRole.assistant,
            message_type: MessageType.ai,
            ...assistantPayload,
          },
        });

    await prisma.conversation.update({
      where: { id: params.id },
      data: {
        last_message_at: new Date(),
        ...(task ? { active_design_task_id: task.id } : {}),
        ...(conversation.title === "新對話" || conversation.title === "New Conversation"
          ? { title: text.slice(0, 32) }
          : {}),
      },
    });
    if (task && nextClarificationCount !== task.clarification_count) {
      await prisma.designTask.update({
        where: { id: task.id },
        data: {
          clarification_count: nextClarificationCount,
          current_clarification_goal: {
            lastQuestion: !canGenerate,
            limit: 4,
            remaining: Math.max(0, 4 - nextClarificationCount),
          } as Prisma.InputJsonValue,
        },
      });
    }
    await consumeCredits(user.id, credits);
    publishConversationEvent(params.id, "message.completed", shapeMessage(assistantMessage));

    return NextResponse.json({
      userMessage: shapeMessage(userMessage),
      assistantMessage: shapeMessage(assistantMessage),
      streaming: false,
    });
  } catch (err) {
    return handleError(err);
  }
}
