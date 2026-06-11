import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { DesignTaskStatus, DesignTaskType, MessageRole, MessageType, type DesignTask, type Message, type Prisma } from "@prisma/client";

import { ApiError, handleError, ok } from "@/lib/api";
import { assertCreditsAvailable, consumeCredits } from "@/lib/credits";
import { prisma } from "@/lib/db";
import { detectRecommendedActions, extractSuggestedItems } from "@/lib/chat-handoff";
import {
  activateDesignTask,
  getOwnedConversation,
  getTaskTitle,
  parseDesignTaskType,
  requireSessionUser,
  resolveRequestedModelForProvider,
  resolveTaskCreateInput,
  shapeDesignTask,
  shapeMessage,
  shapeMessageWithSiblings,
  toInputJson,
} from "@/lib/conversation/api";
import {
  loadActivePathMessages,
  resolveAppendParentMessageId,
  resolveSiblingParentMessageId,
} from "@/lib/conversation/active-path";
import {
  getSchema,
  resolveDefaultExecutionStrategy,
  resolveTaskDomain,
} from "@/lib/conversation/schema-registry";
import { inferConversationIntent, type UserIntentResult } from "@/lib/conversation/intent-resolver";
import { dispatchImageGeneration } from "@/lib/conversation/generation-dispatcher";
import { dispatchTextGeneration } from "@/lib/conversation/dispatch/text-generation";
import { isCancelRequested } from "@/lib/conversation/dispatch/shared";
import { publishConversationEvent } from "@/lib/conversation/stream";
import { marketingIntelligence, type MarketingIntelligencePack } from "@/lib/conversation/marketing-intelligence";
import { flexionComplete, flexionStream, rawToCredits, type FlexionRequest } from "@/lib/flexion";
import { handleWebsiteBuilderTurn } from "@/lib/website-builder/orchestrator";
import { routeWebsiteKind } from "@/lib/website-builder/intent-router";
import { saveSiteFiles } from "@/lib/site-assets";
import { appendCustomerInput, cleanTaskSummary, customerInputsText, valueToRecord } from "@/lib/project-brief";

const CONVERSATION_SYSTEM_PROMPT = [
  "你是 GTL 的設計與行銷顧問助理，請以繁體中文回覆。",
  "你不是問卷機器。不要一次列出大量問題，不要把 schema 欄位整包丟給使用者。",
  "每一輪最多問 1 個主要問題，必要時可附 1 個很短補充問題。",
  "G3 設計需求流程必須依序走：Step 1 資訊內容確認、Step 2 設計感覺確認、Step 3 規格與形式確認、Step 4 補充確認、Step 5 產出初稿。",
  "最多只連續收集 3 到 5 輪。使用者答不完整、表示不知道、要求你決定，或已走到補充確認後，請停止追問，直接提出你的建議方向與可執行第一版。",
  "設計任務開場先確認要放上的資訊內容或請客戶上傳素材，再確認整體設計感覺；不要一開始問完整品牌理念、個性、客群、使用場景清單。",
  "使用者沒想法時，請給風格方向與參考靈感平台/圖片方向讓客戶挑，例如 Pinterest、Behance、Dribbble、Freepik 對應的風格用途。",
  "使用者沒想法或叫你決定時，請先提出你的推薦方向與理由，再補下一個最小缺口。",
  "如果已足夠產生合理第一版，請整理成可執行方向與第一版交付目標，並建議可以產生；不要稱為 brief、需求整理或交給寫手的指示。",
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

function compactText(value: unknown, maxLength = 260) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function compactJson(value: unknown, maxLength = 700) {
  if (!value) return "";
  try {
    const text = JSON.stringify(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return compactText(String(value), maxLength);
  }
}

async function buildTransferableContext(params: {
  conversation: {
    id: string;
    shared_brand_context: Prisma.JsonValue | null;
    project_memory: Prisma.JsonValue | null;
  };
  activeTask?: DesignTask | null;
  targetTask?: DesignTask | null;
  history: Message[];
}) {
  const tasks = await prisma.designTask.findMany({
    where: { conversation_id: params.conversation.id },
    orderBy: [{ last_activity_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
    take: 8,
  });
  const taskLines = tasks
    .filter((task) => task.id !== params.targetTask?.id)
    .map((task) => {
      const inputs = customerInputsText(task.collected_data, 3);
      const summary = cleanTaskSummary(task.summary);
      const data = compactJson(valueToRecord(task.collected_data), 420);
      return [
        `- ${taskDisplayName(task.task_type)} (${task.task_type})`,
        summary ? `  摘要：${summary}` : "",
        inputs ? `  客戶曾提供：${inputs}` : "",
        data && !inputs ? `  已收集資料：${data}` : "",
      ].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n");
  const recentUserLines = params.history
    .filter((message) => message.role === MessageRole.user)
    .slice(-8)
    .map((message) => `- ${compactText(messageContentToText(message), 180)}`)
    .filter((line) => line !== "-")
    .join("\n");
  const sharedBrand = compactJson(params.conversation.shared_brand_context, 700);
  const projectMemory = compactJson(params.conversation.project_memory, 900);
  const activeLine = taskSwitchContextLine(params.activeTask);
  const context = [
    sharedBrand ? `共用品牌資料：${sharedBrand}` : "",
    projectMemory ? `專案記憶：${projectMemory}` : "",
    activeLine ? `原任務狀態：${activeLine}` : "",
    taskLines ? `同一對話中其他任務可沿用資訊：\n${taskLines}` : "",
    recentUserLines ? `最近客戶明確說過的內容：\n${recentUserLines}` : "",
  ].filter(Boolean).join("\n\n");
  return context;
}

async function carryContextIntoTask(params: {
  task: DesignTask;
  context: string;
  switchedFromTask?: DesignTask | null;
}) {
  if (!params.context.trim()) return params.task;
  const collected = valueToRecord(params.task.collected_data);
  const existingMemory = valueToRecord(collected.transferContext);
  const currentGoal = valueToRecord(params.task.current_clarification_goal);
  return prisma.designTask.update({
    where: { id: params.task.id },
    data: {
      collected_data: {
        ...collected,
        transferContext: {
          ...existingMemory,
          fromTaskId: params.switchedFromTask?.id ?? existingMemory.fromTaskId ?? null,
          fromTaskType: params.switchedFromTask?.task_type ?? existingMemory.fromTaskType ?? null,
          summary: params.context.slice(0, 2400),
          updatedAt: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
      current_clarification_goal: {
        ...currentGoal,
        transferredContextSummary: params.context.slice(0, 1400),
      } as Prisma.InputJsonValue,
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
  nextActions?: Array<{ label: string; value?: string; action?: string; taskId?: string | null }>;
}) {
  const g3Step = g3FlowStep(params.clarificationCount ?? 0, params.canGenerate);
  const nextActions =
    params.nextActions ??
    (params.canGenerate
      ? [{ label: "產生第一版", action: "proceed_generate", value: "產生第一版", taskId: params.taskId ?? null }]
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

function buildStreamingProgressMetadata(params: {
  task?: DesignTask | null;
  stageLabel: string;
  stageDescription: string;
  phase?: string;
}) {
  const stepDecision = buildStepDecision({
    taskType: params.task?.task_type,
    taskId: params.task?.id,
    clarificationCount: params.task?.clarification_count ?? 0,
    canGenerate: false,
    needsUserInput: false,
    nextActions: [],
  });
  return {
    source: "conversations.messages.streaming",
    status: "streaming",
    phase: params.phase ?? "progress",
    activeDesignTaskId: params.task?.id ?? null,
    stepDecision: {
      ...stepDecision,
      phase: "processing",
      action: "progress",
      mode: "progress",
      stageLabel: params.stageLabel,
      stageDescription: params.stageDescription,
      shouldShowProgress: true,
      needsUserInput: false,
      canGenerate: false,
      nextActions: [],
      updatedAt: new Date().toISOString(),
    },
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

function taskDisplayName(taskType: DesignTaskType | string | null | undefined) {
  switch (taskType) {
    case "logo":
      return "品牌 Logo 設計";
    case "vi":
      return "品牌識別系統";
    case "brand_guideline":
      return "品牌標準手冊";
    case "business_card":
      return "名片設計";
    case "dm":
      return "DM / 傳單設計";
    case "poster":
      return "海報設計";
    case "catalog":
      return "型錄設計";
    case "menu":
      return "菜單設計";
    case "packaging":
      return "包裝設計";
    case "social_post":
      return "社群圖片設計";
    case "banner":
      return "橫幅設計";
    case "edm":
      return "EDM 設計";
    case "brand_website":
      return "品牌官網";
    case "landing_page":
      return "一頁式網站";
    case "ecommerce_website":
      return "電商網站";
    case "social_copy":
      return "社群文案";
    case "seo_article":
      return "SEO 文章";
    case "website_audit":
      return "網站健檢";
    case "annual_marketing_strategy":
      return "年度行銷策略";
    case "ads_strategy":
      return "廣告投放策略";
    default:
      return "新的任務";
  }
}

function taskSwitchContextLine(task: DesignTask | null | undefined) {
  if (!task) return "";
  const summary = cleanTaskSummary(task.summary);
  if (summary) return `目前「${taskDisplayName(task.task_type)}」已整理到：${summary}`;
  const collected =
    task.collected_data && typeof task.collected_data === "object" && !Array.isArray(task.collected_data)
      ? Object.values(task.collected_data as Record<string, unknown>)
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean)
          .slice(0, 2)
          .join("、")
      : "";
  return collected ? `目前「${taskDisplayName(task.task_type)}」已有資料：${collected}` : "";
}

function quickReplyTaskType(body: Record<string, unknown>) {
  const quickReply = bodyQuickReply(body);
  return parseDesignTaskType(quickReply?.taskType);
}

function isConfirmedTaskSwitch(body: Record<string, unknown>) {
  const quickReply = bodyQuickReply(body);
  return quickReply?.action === "confirm_task_switch";
}

function shouldConfirmTaskSwitch(params: {
  activeTask?: Awaited<ReturnType<typeof findConversationActiveTask>> | null;
  inferredIntent?: UserIntentResult | null;
  body: Record<string, unknown>;
}) {
  if (!params.activeTask) return null;
  if (isConfirmedTaskSwitch(params.body)) return null;
  const quickReply = bodyQuickReply(params.body);
  if (typeof quickReply?.taskId === "string") return null;
  if (typeof params.body.designTaskId === "string") return null;
  const confirmedSwitchTaskType = isConfirmedTaskSwitch(params.body)
    ? quickReplyTaskType(params.body)
    : null;
  const inferredTaskType = confirmedSwitchTaskType || parseDesignTaskType(params.inferredIntent?.taskType);
  if (!inferredTaskType || inferredTaskType === params.activeTask.task_type) return null;
  const action = params.inferredIntent?.action;
  const shouldGate =
    params.inferredIntent?.wantsGeneration === true ||
    action === "generate" ||
    action === "create_new" ||
    action === "refine";
  return shouldGate ? inferredTaskType : null;
}

function conversationProjectMemory(conversation: { project_memory: Prisma.JsonValue | null }) {
  return conversation.project_memory && typeof conversation.project_memory === "object" && !Array.isArray(conversation.project_memory)
    ? (conversation.project_memory as Record<string, unknown>)
    : {};
}

const WEBSITE_BUILDER_ACTIONS = [
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

function isWebsiteTaskType(taskType: DesignTaskType | string | null | undefined) {
  return (
    taskType === "brand_website" ||
    taskType === "landing_page" ||
    taskType === "ecommerce_website"
  );
}

function hasExplicitWebsiteAction(body: Record<string, unknown>) {
  const quickReply = bodyQuickReply(body);
  const action = typeof quickReply?.action === "string" ? quickReply.action : "";
  return WEBSITE_BUILDER_ACTIONS.includes(action);
}

function isWebsiteBuilderRequest(params: {
  text: string;
  body: Record<string, unknown>;
  conversation: { project_memory: Prisma.JsonValue | null };
  activeTask?: { task_type: string } | null;
}) {
  const quickReply = bodyQuickReply(params.body);
  const action = typeof quickReply?.action === "string" ? quickReply.action : "";
  const projectMemory = conversationProjectMemory(params.conversation);
  const websiteBuilder =
    projectMemory.websiteBuilder && typeof projectMemory.websiteBuilder === "object"
      ? (projectMemory.websiteBuilder as Record<string, unknown>)
      : {};
  const activeTaskIsWebsite = isWebsiteTaskType(params.activeTask?.task_type);
  return (
    WEBSITE_BUILDER_ACTIONS.includes(action) ||
    (activeTaskIsWebsite &&
      (action === "proceed_generate" ||
        action === "choose_direction" ||
        routeWebsiteKind(params.text) === "website_builder")) ||
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

function generationSourceVersionNumber(body: Record<string, unknown>) {
  const metadata = body.metadata && typeof body.metadata === "object"
    ? (body.metadata as Record<string, unknown>)
    : {};
  const target = metadata.targetGeneration && typeof metadata.targetGeneration === "object"
    ? (metadata.targetGeneration as Record<string, unknown>)
    : null;
  const version = Number(target?.versionNumber);
  return Number.isFinite(version) && version > 0 ? version : null;
}

async function taskIdFromQuickReplySource(conversationId: string, body: Record<string, unknown>) {
  const sourceMessageId = generationSourceMessageId(body);
  if (!sourceMessageId) return null;
  const sourceMessage = await prisma.message.findFirst({
    where: { id: sourceMessageId, conversation_id: conversationId },
    select: { design_task_id: true, metadata: true },
  });
  if (!sourceMessage) return null;
  if (sourceMessage.design_task_id) return sourceMessage.design_task_id;

  const metadata =
    sourceMessage.metadata && typeof sourceMessage.metadata === "object" && !Array.isArray(sourceMessage.metadata)
      ? (sourceMessage.metadata as Record<string, unknown>)
      : {};
  const activeDesignTaskId = metadata.activeDesignTaskId;
  if (typeof activeDesignTaskId === "string" && activeDesignTaskId.trim()) return activeDesignTaskId.trim();

  const stepDecision =
    metadata.stepDecision && typeof metadata.stepDecision === "object" && !Array.isArray(metadata.stepDecision)
      ? (metadata.stepDecision as Record<string, unknown>)
      : {};
  const targetTaskId = stepDecision.targetTaskId;
  if (typeof targetTaskId === "string" && targetTaskId.trim()) return targetTaskId.trim();
  return null;
}

async function findReusableTaskByType(params: {
  conversationId: string;
  userId: string;
  taskType: DesignTaskType;
}) {
  return prisma.designTask.findFirst({
    where: {
      conversation_id: params.conversationId,
      user_id: params.userId,
      task_type: params.taskType,
      status: {
        in: [
          DesignTaskStatus.active,
          DesignTaskStatus.collecting,
          DesignTaskStatus.paused,
          DesignTaskStatus.completed,
        ],
      },
    },
    orderBy: [{ last_activity_at: { sort: "desc", nulls: "last" } }, { created_at: "desc" }],
  });
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
  return false;
}

function isChoosingDirection(params: { body: Record<string, unknown> }) {
  const quickReply = bodyQuickReply(params.body);
  return quickReply?.action === "choose_direction";
}

function bodyMetadata(body: Record<string, unknown>) {
  return body.metadata && typeof body.metadata === "object"
    ? (body.metadata as Record<string, unknown>)
    : {};
}

function bodyBooleanFlag(body: Record<string, unknown>, key: string) {
  return bodyMetadata(body)[key] === true;
}

function buildFlowInstruction(params: {
  task: { clarification_count: number } | null;
  text: string;
  body: Record<string, unknown>;
}) {
  if (!params.task) return "";
  const currentStep = g3FlowStep(params.task.clarification_count);
  const shouldGenerate = isGenerateRequest({ text: params.text, body: params.body });
  const shouldFinalizeDirection = isChoosingDirection({ body: params.body });
  const shouldRecommend =
    !shouldFinalizeDirection &&
    (isDelegatingToAi({ text: params.text, body: params.body }) ||
      params.task.clarification_count >= 4);

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
      "- 若是 SEO 文章或社群文案任務，請提供文章切角、目標讀者、內容重點與 CTA 方向；不要稱為 brief，也不要輸出寫手指示。",
      "- 可以列 2 到 4 個可選方向，但每個方向必須能直接往第一版推進。",
      "- 結尾要明確告訴使用者：可以直接選一個方向，或按產生第一版。",
    ].join("\n");
  }

  if (shouldFinalizeDirection) {
    return [
      "# 目前使用者已選定方向",
      "- 這一輪是收斂完成，不是重新開新問題。",
      "- 不要再問橫式/直式、不要再列下一組風格方向、不要再做補充問卷。",
      "- 如果還缺版型、構圖或細節，請用你的專業直接決定最穩的第一版設定。",
      "- 回覆要簡短：確認已採用的品牌名與方向，列出 3 到 5 個第一版生成設定。",
      "- 結尾只提示可以按「產生第一版」，不要再要求使用者先回答下一題。",
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

function textFromGenerationGroups(groups: unknown[], sourceVersionNumber?: number | null) {
  const candidates = groups
    .map((group) => (group && typeof group === "object" && !Array.isArray(group) ? (group as Record<string, unknown>) : null))
    .filter((group): group is Record<string, unknown> => Boolean(group))
    .filter((group) => {
      if (!sourceVersionNumber) return true;
      return Number(group.versionNumber) === sourceVersionNumber;
    });
  const group = candidates[candidates.length - 1];
  const items = Array.isArray(group?.items) ? group.items : [];
  const text = items
    .map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      return typeof record.content === "string" ? record.content : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return text.length > 6000 ? `${text.slice(0, 6000)}\n\n（前版內容已截斷，請保留其餘未被要求修改的結構與語氣。）` : text;
}

function textDeliverableInstruction(taskType: string) {
  switch (taskType) {
    case "seo_article":
      return [
        "交付物必須是完整 SEO 文章正文，不是 SEO brief、文章架構、需求整理或寫手指示。",
        "請直接輸出可貼到網站或部落格的文章成品，至少包含：H1 標題、Meta Title、Meta Description、開場段、4 到 6 個 H2 章節、每個章節的實際段落內容、FAQ、CTA 或結語。",
        "如果品牌、產品、地區或關鍵字不足，請用合理假設自然帶入正文；可以在開頭用一句話標註假設，但不可要求使用者再提供主題才能開始。",
        "禁止輸出「SEO 文章設計 brief」、「第一版執行 brief」、「下一步怎麼做」、「請給我主題」、「之後把某某換掉」、「適合交給寫手」這類規劃語句。",
      ].join("\n");
    case "social_copy":
      return [
        "交付物必須是可直接發布的社群文案組，不是文案 brief 或方向建議。",
        "請輸出多則完整貼文文案、標題、CTA、hashtag 與可搭配的視覺建議；缺資料時用合理假設補齊。",
      ].join("\n");
    case "marketing_plan":
    case "marketing_strategy":
      return [
        "交付物必須是可執行的行銷方案，不是需求整理或下一步建議。",
        "請輸出目標、策略、執行步驟、渠道配置、素材方向、衡量指標與時程；缺資料時用合理假設補齊。",
      ].join("\n");
    default:
      return [
        "交付物必須是可直接使用的完整第一版成品，不是 brief、需求整理、大綱或下一步建議。",
        "缺資料時用合理假設補齊並直接完成，不要把問題丟回給使用者。",
      ].join("\n");
  }
}

async function createGenerationResult(params: {
  conversationId: string;
  task: NonNullable<Awaited<ReturnType<typeof resolveRequestedTask>>>;
  model: string;
  providerConfig?: FlexionRequest["providerConfig"];
  creditMultiplier?: number;
  instruction: string;
  sourceMessageId?: string | null;
  sourceVersionNumber?: number | null;
}) {
  const domain = resolveTaskDomain(params.task.task_type);

  if (domain === "image") {
    const dispatched = await dispatchImageGeneration({
      conversationId: params.conversationId,
      userId: params.task.user_id,
      task: params.task,
      instruction: params.instruction,
      sourceMessageId: params.sourceMessageId,
      sourceVersionNumber: params.sourceVersionNumber,
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

  if (domain === "text") {
    const dispatched = await dispatchTextGeneration({
      conversationId: params.conversationId,
      task: params.task,
      model: params.model,
      providerConfig: params.providerConfig,
      creditMultiplier: params.creditMultiplier,
      instruction: params.instruction,
      sourceMessageId: params.sourceMessageId,
      sourceVersionNumber: params.sourceVersionNumber,
      source: "conversations.messages.auto-generate",
    });
    if (dispatched) {
      return {
        updatedTask: dispatched.task,
        message: dispatched.message,
        usage: dispatched.usage,
        credits: dispatched.credits,
      };
    }
  }

  // Fallback (web / unknown domain) — keep the legacy inline path below.
  return legacyCreateGenerationResult(params);
}

async function legacyCreateGenerationResult(params: {
  conversationId: string;
  task: NonNullable<Awaited<ReturnType<typeof resolveRequestedTask>>>;
  model: string;
  providerConfig?: FlexionRequest["providerConfig"];
  creditMultiplier?: number;
  instruction: string;
  sourceMessageId?: string | null;
  sourceVersionNumber?: number | null;
}) {
  const schema = await getSchema(params.task.task_type);
  const executionStrategy =
    params.task.execution_strategy ||
    resolveDefaultExecutionStrategy(params.task.task_type);
  const domain = resolveTaskDomain(params.task.task_type);
  const isImageTask = domain === "image";
  const existingMessage = await prisma.message.findFirst({
    where: {
      conversation_id: params.conversationId,
      design_task_id: params.task.id,
      message_type: MessageType.generation_result,
    },
    orderBy: { created_at: "asc" },
  });
  const existingMetadata = existingMessage?.metadata && typeof existingMessage.metadata === "object" && !Array.isArray(existingMessage.metadata)
    ? (existingMessage.metadata as Record<string, unknown>)
    : {};
  const existingGroups = Array.isArray(existingMetadata.outputGroups) ? existingMetadata.outputGroups : [];
  const sourceText = !isImageTask && existingGroups.length > 0
    ? textFromGenerationGroups(existingGroups, params.sourceVersionNumber)
    : "";

  if (isImageTask) {
    const dispatched = await dispatchImageGeneration({
      conversationId: params.conversationId,
      userId: params.task.user_id,
      task: params.task,
      instruction: params.instruction,
      sourceMessageId: params.sourceMessageId,
      sourceVersionNumber: params.sourceVersionNumber,
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
    params.sourceVersionNumber ? `本輪是針對第 ${params.sourceVersionNumber} 版做修改。` : "",
    sourceText ? `被修改的前版內容：\n${sourceText}` : "",
    params.instruction ? `使用者本輪指令：${params.instruction}` : "",
    !isImageTask ? `交付物規則：\n${textDeliverableInstruction(params.task.task_type)}` : "",
    isImageTask
      ? [
          "請直接輸出第一版設計提案，定位為 GTL 已經開始產出第一版。",
          "不要說你無法生成圖像，不要叫使用者拿去給設計師。",
          "如果目前只能產出影像 brief，請用「第一版 Logo 設計提案」呈現，包含構圖、字標、圖形、色彩、可交給圖像生成模型的提示詞、避免事項。",
          "資訊不足時用合理假設補齊。",
        ].join("\n")
      : [
          sourceText
            ? "請輸出修正版完整成品。必須保留前版中使用者沒有要求修改的結構、語氣、段落與重點，只套用本輪指令要求的變更；不可改寫成 brief 或重新規劃。"
            : "請直接輸出第一版完整成品，不要反問。",
          "資訊不足時用合理假設補齊，並清楚標註假設；不可輸出 brief、架構、大綱或下一步建議。",
        ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const versionNumber = Math.max(
    0,
    Number(existingMetadata.versionNumber) || 0,
    ...existingGroups.map((group) => {
      const record = group && typeof group === "object" && !Array.isArray(group) ? (group as Record<string, unknown>) : {};
      const version = Number(record.versionNumber);
      return Number.isFinite(version) ? version : 0;
    }),
  ) + 1;
  const generationId = randomUUID();
  const buildOutputGroup = (content: string) => ({
    kind: "text",
    title: `第 ${versionNumber} 版內容`,
    versionNumber,
    generationId,
    items: [
      {
        id: `${generationId}-text-1`,
        label: params.task.title,
        content,
      },
    ],
  });
  let assembled = "";
  let usage = { input_tokens: 0, output_tokens: 0 };
  let completionModel = params.model;
  let lastPublishedAt = 0;
  const baseContent = {
    type: isImageTask ? "image_brief" : "text_document",
    status: "streaming",
    taskId: params.task.id,
    taskType: params.task.task_type,
    executionStrategy,
    domain,
    text: "",
  };
  const baseMetadata = {
    ...existingMetadata,
    type: "generation_result",
    source: "conversations.messages.auto-generate",
    domain,
    status: "streaming",
    generationId,
    taskId: params.task.id,
    taskType: params.task.task_type,
    templateKey: params.task.template_key || params.task.task_type,
    templateLabel: params.task.template_label || params.task.title,
    versionNumber,
    sourceMessageId: params.sourceMessageId ?? existingMetadata.sourceMessageId ?? null,
    parentVersionNumber: params.sourceVersionNumber ?? null,
    outputGroups: [...existingGroups, buildOutputGroup("")],
    expectedOutputCount: 1,
    receivedOutputCount: 0,
    pendingOutputs: 1,
  };
  const sourceMessageForParent = params.sourceMessageId
    ? await prisma.message.findFirst({
        where: { id: params.sourceMessageId, conversation_id: params.conversationId },
        select: { id: true, message_type: true },
      })
    : null;
  const generationParentMessageId =
    sourceMessageForParent?.message_type === MessageType.generation_result
      ? await resolveSiblingParentMessageId(params.conversationId, sourceMessageForParent.id)
      : sourceMessageForParent?.id ?? null;

  let message = await prisma.message.create({
    data: {
      conversation_id: params.conversationId,
      role: MessageRole.assistant,
      message_type: MessageType.generation_result,
      design_task_id: params.task.id,
      content: baseContent,
      metadata: baseMetadata as Prisma.InputJsonValue,
      tokens_input: 0,
      tokens_output: 0,
      credits_used: BigInt(0),
      model: params.model,
      parent_message_id: generationParentMessageId,
    },
  });
  publishConversationEvent(params.conversationId, "message.created", shapeMessage(message));

  const publishStreamingResult = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastPublishedAt < 320) return;
    lastPublishedAt = now;
    message = await prisma.message.update({
      where: { id: message.id },
      data: {
        content: {
          ...baseContent,
          text: assembled,
        },
        metadata: {
          ...baseMetadata,
          outputGroups: [...existingGroups, buildOutputGroup(assembled)],
        } as Prisma.InputJsonValue,
      },
    });
    publishConversationEvent(params.conversationId, "message.updated", shapeMessage(message));
    publishConversationEvent(params.conversationId, "generation.result.updated", {
      messageId: message.id,
      taskId: params.task.id,
      status: "streaming",
    });
  };

  for await (const evt of flexionStream({
    model: params.model,
    messages: [
      {
        role: "system",
        content: "你是 GTL 的設計交付引擎。使用者已確認產生第一版時，必須直接交付第一版，不可回覆無法生成或轉交設計師。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.55,
    max_tokens: domain === "text" ? 5200 : 2200,
    providerConfig: params.providerConfig,
  })) {
    if (evt.type === "token") {
      assembled += evt.delta;
      await publishStreamingResult(false);
    } else if (evt.type === "done") {
      usage = evt.usage;
      completionModel = evt.model;
    }
  }
  await publishStreamingResult(true);
  const credits = rawToCredits(completionModel, usage, params.creditMultiplier);
  const outputGroup = buildOutputGroup(assembled);

  const [updatedTask, completedMessage] = await prisma.$transaction([
    prisma.designTask.update({
      where: { id: params.task.id },
      data: {
        execution_strategy: executionStrategy,
        status: DesignTaskStatus.completed,
        summary: cleanTaskSummary(params.task.summary) || null,
        last_activity_at: new Date(),
      },
    }),
    prisma.message.update({
          where: { id: message.id },
          data: {
            content: {
              type: isImageTask ? "image_brief" : "text_document",
              status: "completed",
              taskId: params.task.id,
              taskType: params.task.task_type,
              executionStrategy,
              domain,
              text: assembled,
            },
            metadata: {
              ...existingMetadata,
              type: "generation_result",
              source: "conversations.messages.auto-generate",
              domain,
              status: "completed",
              generationId,
              taskId: params.task.id,
              taskType: params.task.task_type,
              templateKey: params.task.template_key || params.task.task_type,
              templateLabel: params.task.template_label || params.task.title,
              versionNumber,
              sourceMessageId: params.sourceMessageId ?? existingMetadata.sourceMessageId ?? null,
              parentVersionNumber: params.sourceVersionNumber ?? null,
              outputGroups: [...existingGroups, outputGroup],
              expectedOutputCount: 1,
              receivedOutputCount: 1,
              pendingOutputs: 0,
              quickActions: [
                // {
                //   type: "regenerate_design",
                //   label: "再生一版",
                //   value: "再生一版，方向調整為：",
                //   action: "proceed_generate",
                //   taskId: params.task.id,
                //   sourceMessageId: message.id,
                // },
                // {
                //   label: "調整內容",
                //   value: "我想調整內容：",
                //   action: "provide_core_info",
                //   taskId: params.task.id,
                //   sourceMessageId: message.id,
                // },
              ],
            } as Prisma.InputJsonValue,
            tokens_input: usage.input_tokens,
            tokens_output: usage.output_tokens,
            credits_used: credits,
            model: completionModel,
          },
        }),
    prisma.conversation.update({
      where: { id: params.conversationId },
      data: {
        last_message_at: new Date(),
        active_design_task_id: params.task.id,
        active_leaf_message_id: message.id,
      },
    }),
  ]);

  publishConversationEvent(params.conversationId, "message.completed", shapeMessage(completedMessage));
  publishConversationEvent(params.conversationId, "generation.result.completed", {
    messageId: completedMessage.id,
    taskId: params.task.id,
    status: "completed",
  });

  return { updatedTask, message: completedMessage, usage, credits };
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

function buildChoiceQuickActions(params: {
  text: string;
  taskId: string | null | undefined;
  canGenerate: boolean;
}) {
  const choices = params.text
    .split("\n")
    .map(numberedChoice)
    .filter((choice): choice is { marker: string; content: string } => Boolean(choice))
    .slice(0, 5);
  if (choices.length < 2) return [];
  return choices.map((choice) => {
    const label = choiceLabel(choice.content);
    if (params.canGenerate) {
      return {
        label,
        value: `我想選「${label}」這個方向，請直接產生第一版。`,
        action: "proceed_generate",
        taskId: params.taskId,
      };
    }
    return {
      label,
      value: `我想選「${label}」這個方向，請接著幫我收斂成可直接產生第一版的方向。`,
      action: "choose_direction",
      taskId: params.taskId,
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

function intentOutputCount(intent?: UserIntentResult | null) {
  const count = intent?.outputCount;
  return typeof count === "number" && Number.isFinite(count) && count > 0 ? Math.min(Math.floor(count), 4) : null;
}

async function applyIntentOutputCount(
  task: DesignTask | null,
  intent?: UserIntentResult | null,
): Promise<DesignTask | null> {
  const count = intentOutputCount(intent);
  if (!task || !count || resolveTaskDomain(task.task_type) !== "image" || task.output_count === count) return task;
  return prisma.designTask.update({
    where: { id: task.id },
    data: { output_count: count, last_activity_at: new Date() },
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
      output_count: resolveTaskDomain(resolved.taskType) === "image" ? intentOutputCount(params.intent) ?? undefined : undefined,
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
  const bodyTaskId = typeof params.body.designTaskId === "string" ? params.body.designTaskId : null;
  const inferredTaskType = parseDesignTaskType(params.inferredIntent?.taskType);
  const passiveDesignTaskId = designTaskIds[0] || null;
  const passiveTaskIsCurrentActive =
    Boolean(passiveDesignTaskId && params.activeTask?.id === passiveDesignTaskId);
  const passiveTaskConflictsWithIntent =
    Boolean(
      inferredTaskType &&
        passiveTaskIsCurrentActive &&
        params.activeTask?.task_type &&
        params.activeTask.task_type !== inferredTaskType,
    );
  const sourceTaskId =
    bodyTaskId || quickReplyTaskId
      ? null
      : await taskIdFromQuickReplySource(params.conversationId, params.body);
  const explicitTaskId =
    bodyTaskId ||
    quickReplyTaskId ||
    sourceTaskId ||
    (passiveTaskConflictsWithIntent ? null : passiveDesignTaskId) ||
    null;

  if (explicitTaskId) {
    const task = await prisma.designTask.findFirst({
      where: { id: explicitTaskId, conversation_id: params.conversationId, user_id: params.userId },
    });
    if (task) {
      await activateDesignTask(params.conversationId, task.id);
      return applyIntentOutputCount(task, params.inferredIntent);
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
    return applyIntentOutputCount(task, params.inferredIntent);
  }

  if (inferredTaskType) {
    const shouldCreateFresh = params.inferredIntent?.action === "create_new";
    if (!shouldCreateFresh && params.activeTask?.task_type === inferredTaskType) {
      return applyIntentOutputCount(params.activeTask, params.inferredIntent);
    }
    if (!shouldCreateFresh) {
      const reusableStatuses = params.inferredIntent?.action === "refine" || params.inferredIntent?.wantsGeneration
        ? [DesignTaskStatus.active, DesignTaskStatus.collecting, DesignTaskStatus.paused, DesignTaskStatus.completed]
        : [DesignTaskStatus.active, DesignTaskStatus.collecting, DesignTaskStatus.paused];
      const reusableTask =
        params.inferredIntent?.action === "refine" || params.inferredIntent?.wantsGeneration
          ? await findReusableTaskByType({
              conversationId: params.conversationId,
              userId: params.userId,
              taskType: inferredTaskType,
            })
          : await prisma.designTask.findFirst({
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
          const activatedTask = await prisma.designTask.findUnique({ where: { id: reusableTask.id } });
          return applyIntentOutputCount(activatedTask, params.inferredIntent);
        }
        return applyIntentOutputCount(reusableTask, params.inferredIntent);
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

    const activePath = await loadActivePathMessages(params.id);
    const messages = activePath.messages.slice(-limit);

    return ok({
      docs: messages.map((message) =>
        shapeMessageWithSiblings(
          message,
          activePath.metaById.get(message.id) ?? { count: 1, index: 0, ids: [message.id] },
        ),
      ),
      totalDocs: activePath.messages.length,
      limit,
      activeLeafMessageId: activePath.activeLeafMessageId,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Hoisted so the catch below can finalize an orphaned streaming placeholder.
  let streamingAssistantMessage: Message | null = null;
  let assistantFinalized = false;
  try {
    const user = await requireSessionUser();
    const conversation = await getOwnedConversation(params.id, user.id);
    const parsedBody = await parseMessageBody(req, user.id);
    const body = parsedBody.body as Record<string, unknown>;
    const text = typeof body.content === "string" ? body.content.trim() : "";
    if (!text) {
      return ok({ skipped: true });
    }
    const requestMetadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    const editOfMessageId =
      typeof requestMetadata.editOfMessageId === "string" && requestMetadata.editOfMessageId.trim()
        ? requestMetadata.editOfMessageId.trim()
        : null;

    let editedUserMessage: Message | null = null;
    if (editOfMessageId) {
      const original = await prisma.message.findFirst({
        where: {
          id: editOfMessageId,
          conversation_id: params.id,
          role: MessageRole.user,
        },
      });
      if (!original) {
        throw new ApiError("RESOURCE_NOT_FOUND", "Edited message not found");
      }

      const originalMetadata =
        original.metadata && typeof original.metadata === "object" && !Array.isArray(original.metadata)
          ? (original.metadata as Record<string, unknown>)
          : {};
      const siblingParentMessageId = await resolveSiblingParentMessageId(params.id, original.id);
      editedUserMessage = await prisma.message.create({
        data: {
          conversation_id: params.id,
          role: MessageRole.user,
          message_type: MessageType.ai,
          content: { type: "text", text },
          metadata: {
            ...originalMetadata,
            ...requestMetadata,
            source: "conversations.messages.edit",
            editedFromMessageId: original.id,
            editedAt: new Date().toISOString(),
            resubmitted: true,
            uploadedImageUrls: parsedBody.uploadedImageUrls,
          } as Prisma.InputJsonValue,
          design_task_id: original.design_task_id,
          parent_message_id: siblingParentMessageId,
        },
      });
      await prisma.conversation.update({
        where: { id: params.id },
        data: { active_leaf_message_id: editedUserMessage.id },
      });
      publishConversationEvent(params.id, "message.created", shapeMessage(editedUserMessage));
    }

    await assertCreditsAvailable(user.id);
    const preQuickReply = bodyQuickReply(body);
    const preQuickReplyAction = typeof preQuickReply?.action === "string" ? preQuickReply.action : "";
    const isExplicitGenerateQuickReply =
      preQuickReplyAction === "proceed_generate";
    const activeTask = await findConversationActiveTask(params.id, user.id);
    const websiteBuilderCandidate = isWebsiteBuilderRequest({ text, body, conversation, activeTask });
    const preTaskHistory = await prisma.message.findMany({
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
          : conversation.ai_model || activeTask?.preferred_model || "";
    const resolvedModel = await resolveRequestedModelForProvider(planCode, requestedModel);
    const model = resolvedModel.model;

    const appendParentMessageId = editedUserMessage
      ? null
      : await resolveAppendParentMessageId(params.id, conversation.active_leaf_message_id);
    let userMessage = editedUserMessage ?? await prisma.message.create({
      data: {
        conversation_id: params.id,
        role: MessageRole.user,
        message_type: MessageType.ai,
        content: { type: "text", text },
        metadata: {
          ...requestMetadata,
          source: "conversations.messages",
          activeDesignTaskId: activeTask?.id ?? null,
          uploadedImageUrls: parsedBody.uploadedImageUrls,
        } as Prisma.InputJsonValue,
        design_task_id: activeTask?.id,
        parent_message_id: appendParentMessageId,
      },
    });
    if (!editedUserMessage) {
      await prisma.conversation.update({
        where: { id: params.id },
        data: { active_leaf_message_id: userMessage.id },
      });
      publishConversationEvent(params.id, "message.created", shapeMessage(userMessage));
    }

    const earlyIntent = await inferConversationIntent({
      userMessage: text,
      recentTurns: buildRecentTurns(preTaskHistory),
      activeTaskType: activeTask?.task_type ?? null,
      quickReplyAction: preQuickReplyAction || null,
      model,
      providerConfig: resolvedModel.providerConfig,
    });
    const inferredTaskTypeForRouting = parseDesignTaskType(earlyIntent?.taskType);
    const shouldHandleWebsiteBuilder =
      websiteBuilderCandidate &&
      (hasExplicitWebsiteAction(body) ||
        !inferredTaskTypeForRouting ||
        isWebsiteTaskType(inferredTaskTypeForRouting));

    if (!shouldHandleWebsiteBuilder && !isExplicitGenerateQuickReply) {
      streamingAssistantMessage = await prisma.message.create({
        data: {
          conversation_id: params.id,
          role: MessageRole.assistant,
          message_type: MessageType.ai,
          content: { type: "text", text: "" },
          metadata: buildStreamingProgressMetadata({
            task: activeTask,
            stageLabel: "理解需求",
            stageDescription: "正在判斷這輪要回答、整理還是產生成果",
          }) as Prisma.InputJsonValue,
          design_task_id: activeTask?.id,
          parent_message_id: userMessage.id,
        },
      });
      await prisma.conversation.update({
        where: { id: params.id },
        data: { active_leaf_message_id: streamingAssistantMessage.id },
      });
      publishConversationEvent(params.id, "message.created", shapeMessage(streamingAssistantMessage));
    }

    const hiddenSwitchTarget = shouldConfirmTaskSwitch({
      activeTask,
      inferredIntent: earlyIntent,
      body,
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
    const switchedTaskThisTurn = Boolean(
      hiddenSwitchTarget &&
        activeTask &&
        task &&
        task.id !== activeTask.id &&
        task.task_type === hiddenSwitchTarget,
    );
    let transferredContext = "";

    if (switchedTaskThisTurn && task) {
      transferredContext = await buildTransferableContext({
        conversation,
        activeTask,
        targetTask: task,
        history: preTaskHistory,
      });
      task = await carryContextIntoTask({
        task,
        context: transferredContext,
        switchedFromTask: activeTask,
      });
    }

    if (switchedTaskThisTurn && streamingAssistantMessage && task) {
      streamingAssistantMessage = await prisma.message.update({
        where: { id: streamingAssistantMessage.id },
        data: {
          design_task_id: task.id,
          metadata: buildStreamingProgressMetadata({
            task,
            stageLabel: "切換任務焦點",
            stageDescription: `已切到${taskDisplayName(task.task_type)}，正在整理可沿用的上下文`,
          }) as Prisma.InputJsonValue,
        },
      });
      publishConversationEvent(params.id, "message.updated", shapeMessage(streamingAssistantMessage));
    }

    if (task?.id && task.id !== userMessage.design_task_id) {
      userMessage = await prisma.message.update({
        where: { id: userMessage.id },
        data: {
          design_task_id: task.id,
          metadata: {
            ...(userMessage.metadata && typeof userMessage.metadata === "object" && !Array.isArray(userMessage.metadata)
              ? (userMessage.metadata as Record<string, unknown>)
              : {}),
            activeDesignTaskId: task.id,
          } as Prisma.InputJsonValue,
        },
      });
      publishConversationEvent(params.id, "message.updated", shapeMessage(userMessage));
    }

    if (shouldHandleWebsiteBuilder) {
      const rawWebsiteQuickReply = bodyQuickReply(body);
      const websiteQuickReply =
        activeTask &&
        (activeTask.task_type === "brand_website" ||
          activeTask.task_type === "landing_page" ||
          activeTask.task_type === "ecommerce_website") &&
        rawWebsiteQuickReply?.action === "proceed_generate"
          ? { ...rawWebsiteQuickReply, action: "website_generate" }
          : rawWebsiteQuickReply;
      const websiteTransferContext = await buildTransferableContext({
        conversation,
        activeTask,
        history: preTaskHistory,
      });
      const websiteResult = await handleWebsiteBuilderTurn({
        conversation,
        userId: user.id,
        text,
        quickReply: websiteQuickReply,
        uploadedImageUrls: parsedBody.uploadedImageUrls,
        parentMessageId: userMessage.id,
        transferContext: websiteTransferContext,
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
    const quickReply = bodyQuickReply(body);
    const intent = earlyIntent || await inferConversationIntent({
      userMessage: text,
      recentTurns: buildRecentTurns(history),
      activeTaskType: task?.task_type ?? null,
      quickReplyAction: typeof quickReply?.action === "string" ? quickReply.action : null,
      model,
      providerConfig: resolvedModel.providerConfig,
    });
    const { context: taskContext } = await buildTaskContext(task?.id);
    const flowInstruction = buildFlowInstruction({ task, text, body });
    const delegatedToAi = isDelegatingToAi({ text, body });
    const directionChosen = isChoosingDirection({ body });
    const explicitGenerate = isGenerateRequest({ text, body });
    const chooseDirectionShouldGenerate = false;
    const suppressGenerateForHiddenSwitch =
      switchedTaskThisTurn && !isExplicitGenerateQuickReply;
    const forceGenerate =
      !suppressGenerateForHiddenSwitch &&
      (explicitGenerate ||
        chooseDirectionShouldGenerate ||
        (!delegatedToAi && intent?.action === "generate"));
    const forceRecommendation =
      Boolean(task) &&
      !forceGenerate &&
      (delegatedToAi || (task?.clarification_count ?? 0) >= 4);
    const shouldResearch = !forceGenerate;
    const openingReply = !switchedTaskThisTurn && !forceGenerate && isOpeningTurn({ text, history: preTaskHistory, taskType: task?.task_type, taskId: task?.id })
      ? buildOpeningReply(task?.task_type)
      : null;

    if (forceGenerate && task) {
      // Both image and text generation now route directly through the
      // dispatcher. We retire the pre-flight ack message ("收到，我會先用…
      // 整理成 SEO 文章成果") because the dispatcher already creates a
      // generation_result message that streams the real output — emitting
      // the ack on top of it produces two consecutive assistant bubbles.
      // Discard the streaming placeholder we optimistically created above;
      // the dispatcher provides its own.
      if (streamingAssistantMessage) {
        try {
          await prisma.message.delete({ where: { id: streamingAssistantMessage.id } });
          publishConversationEvent(params.id, "message.deleted", { id: streamingAssistantMessage.id });
        } catch (cleanupError) {
          console.warn("[conversations/:id/messages] failed to drop ack placeholder:", cleanupError);
        }
        streamingAssistantMessage = null;
      }
      const generated = await createGenerationResult({
        conversationId: params.id,
        task,
        model,
        providerConfig: resolvedModel.providerConfig,
        creditMultiplier: resolvedModel.creditMultiplier,
        instruction: chooseDirectionShouldGenerate
          ? `${text}\n使用者已選定這個方向，請直接產生第一版。`
          : text,
        sourceMessageId: bodyTargetGeneration(body) ?? userMessage.id,
        sourceVersionNumber: bodyTargetGeneration(body) ? generationSourceVersionNumber(body) : null,
      });
      await consumeCredits(user.id, generated.credits);
      assistantFinalized = true;
      return NextResponse.json({
        userMessage: shapeMessage(userMessage),
        assistantMessage: shapeMessage(generated.message),
        task: shapeDesignTask(generated.updatedTask),
        generatedMessage: shapeMessage(generated.message),
        streaming: false,
      });
    }

    const createStreamingPlaceholder = async (stageLabel = "整理上下文", stageDescription = "正在對齊目前任務與最近對話") => {
      if (streamingAssistantMessage) return streamingAssistantMessage;
      streamingAssistantMessage = await prisma.message.create({
        data: {
          conversation_id: params.id,
          role: MessageRole.assistant,
          message_type: MessageType.ai,
          content: { type: "text", text: "" },
          metadata: buildStreamingProgressMetadata({
            task,
            stageLabel,
            stageDescription,
          }) as Prisma.InputJsonValue,
          design_task_id: task?.id,
          model,
          parent_message_id: userMessage.id,
        },
      });
      await prisma.conversation.update({
        where: { id: params.id },
        data: { active_leaf_message_id: streamingAssistantMessage.id },
      });
      publishConversationEvent(params.id, "message.created", shapeMessage(streamingAssistantMessage));
      return streamingAssistantMessage;
    };

    const updateStreamingProgress = async (stageLabel: string, stageDescription: string, phase = "progress") => {
      if (!streamingAssistantMessage) return;
      streamingAssistantMessage = await prisma.message.update({
        where: { id: streamingAssistantMessage.id },
        data: {
          metadata: buildStreamingProgressMetadata({
            task,
            stageLabel,
            stageDescription,
            phase,
          }) as Prisma.InputJsonValue,
        },
      });
      publishConversationEvent(params.id, "message.updated", shapeMessage(streamingAssistantMessage));
    };

    await createStreamingPlaceholder();

    const publishStreamingDraft = async (draft: string) => {
      if (!streamingAssistantMessage) return;
      streamingAssistantMessage = await prisma.message.update({
        where: { id: streamingAssistantMessage.id },
        data: {
          content: { type: "text", text: draft },
          metadata: buildStreamingProgressMetadata({
            task,
            stageLabel: "查找資料",
            stageDescription: "正在查找資料，稍後會接著整理成可讀回覆",
            phase: "streaming",
          }) as Prisma.InputJsonValue,
        },
      });
      publishConversationEvent(params.id, "message.delta", {
        id: streamingAssistantMessage.id,
        conversation: params.id,
        conversationId: params.id,
        role: MessageRole.assistant,
        messageType: MessageType.ai,
        content: draft,
        metadata: streamingAssistantMessage.metadata,
        designTaskId: task?.id ?? null,
        createdAt: streamingAssistantMessage.created_at,
      });
    };

    // Fire-and-forget marketing intelligence. The main LLM stream below starts
    // immediately with no marketing context — search runs in parallel, and
    // when it lands we (a) update the finalized assistant message's metadata
    // and (b) publish a `marketing.intelligence.ready` SSE event so the
    // client can graft the citations/visual references onto the message that
    // already finished rendering. Old behavior was: await 10–30s before the
    // first token. New behavior: first token in <1s, citations arrive late.
    const intelligence: MarketingIntelligencePack | null = null;
    let intelligencePromise: Promise<MarketingIntelligencePack | null> | null = null;
    if (shouldResearch) {
      const explicitSearchMode = forceRecommendation || bodyBooleanFlag(body, "enableSearch");
      if (explicitSearchMode) {
        await publishStreamingDraft(
          forceRecommendation
            ? "我先查一些可用的案例與參考，再整理成好選的方向。\n\n"
            : "我先查一下可用資料，再把重點整理給你。\n\n",
        );
      }
      intelligencePromise = marketingIntelligence
        .maybeResearch({
          userMessage: forceRecommendation
            ? `${text}\n請補充可用的設計參考案例、視覺靈感與代表圖。`
            : text,
          task,
          recentTurns: buildRecentTurns(history),
          forceSearch: forceRecommendation || bodyBooleanFlag(body, "enableSearch"),
          forceVisualReferences: forceRecommendation,
        })
        .catch((error) => {
          console.warn("[conversations/:id/messages] marketing intelligence skipped:", error);
          return null;
        });
    }
    await updateStreamingProgress("整理上下文", "正在整理需求、任務狀態與近期對話");

    let assistantText = "";
    let usage = { input_tokens: 0, output_tokens: 0 };
    let completionModel = model;

    if (openingReply) {
      assistantText = openingReply;
    } else {
      await updateStreamingProgress("準備輸出", "模型開始回覆後會直接逐字顯示", "streaming");
      const marketingContext = marketingIntelligence.buildPromptContext(intelligence);
      const hiddenSwitchInstruction =
        switchedTaskThisTurn && task && activeTask
          ? [
              "# 隱性任務切換規則",
              `使用者本輪已從「${taskDisplayName(activeTask.task_type)}」自然切到「${taskDisplayName(task.task_type)}」。`,
              "不要要求使用者確認切換，不要說你正在切換任務，也不要立刻產生成品。",
              `這個目標任務原本已保存的內容在「目前任務」區塊；必須優先沿用，不可當成全新任務重新問一次。`,
              transferredContext ? `可沿用上下文：\n${transferredContext}` : "",
              "請自然承接新任務，主動帶入上面的品牌、產品、主題或限制；不要重問已經在上下文裡出現的品牌名、產品名或明確主題。",
              "如果資料仍不足，先問新任務最關鍵的一個缺口，或給少量可選方向。",
              "原本任務已保留，之後使用者切回時再延續原任務。",
            ].filter(Boolean).join("\n")
          : "";
      const messages = [
        {
          role: "system" as const,
          content: [
            CONVERSATION_SYSTEM_PROMPT,
            taskContext,
            flowInstruction,
            hiddenSwitchInstruction,
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

      const activeStreamingMessage = streamingAssistantMessage ?? await createStreamingPlaceholder();
      let assembled = "";
      let tokenCounter = 0;
      let cancelled = false;
      try {
        for await (const evt of flexionStream({
          model,
          messages,
          max_tokens: 2200,
          temperature: 0.35,
          stream: true,
          providerConfig: resolvedModel.providerConfig,
        })) {
          if (evt.type === "token") {
            assembled += evt.delta;
            tokenCounter += 1;
            // Cancel check every 16 tokens — one DB round-trip per ~16 tokens
            // is cheap enough but still responsive for a user pressing pause.
            if (tokenCounter % 16 === 0 && (await isCancelRequested(activeStreamingMessage.id))) {
              cancelled = true;
              break;
            }
            publishConversationEvent(params.id, "message.delta", {
              id: activeStreamingMessage.id,
              conversation: params.id,
              conversationId: params.id,
              role: MessageRole.assistant,
              messageType: MessageType.ai,
              content: assembled,
              metadata: activeStreamingMessage.metadata,
              designTaskId: task?.id ?? null,
              createdAt: activeStreamingMessage.created_at,
            });
          } else if (evt.type === "done") {
            usage = evt.usage;
            completionModel = evt.model;
          }
        }
      } catch (error) {
        console.warn("[conversations/:id/messages] streaming failed, falling back:", error);
        const completion = await flexionComplete({
          model,
          messages,
          max_tokens: 2200,
          temperature: 0.35,
          providerConfig: resolvedModel.providerConfig,
        });
        assembled = completion.text;
        usage = completion.usage;
        completionModel = completion.model;
      }
      assistantText = assembled;
      if (cancelled) {
        // Settle the placeholder as cancelled and skip the rest of the
        // finalize pipeline (no credit consumption, no generation dispatch).
        const cancelledMessage = await prisma.message.update({
          where: { id: activeStreamingMessage.id },
          data: {
            content: { type: "text", text: assembled },
            metadata: {
              ...((activeStreamingMessage.metadata as Record<string, unknown>) ?? {}),
              status: "cancelled",
              phase: "cancelled",
              cancelledAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        assistantFinalized = true;
        publishConversationEvent(params.id, "message.completed", shapeMessage(cancelledMessage));
        return NextResponse.json({
          userMessage: shapeMessage(userMessage),
          assistantMessage: shapeMessage(cancelledMessage),
          task: task ? shapeDesignTask(task) : undefined,
          streaming: false,
          cancelled: true,
        });
      }
    }

    const credits = openingReply ? BigInt(0) : rawToCredits(model, usage, resolvedModel.creditMultiplier);
    const recommendedActions = detectRecommendedActions(assistantText);
    const suggestedItems = extractSuggestedItems(assistantText);
    const canGenerate =
      !switchedTaskThisTurn &&
      (directionChosen ||
      (forceGenerate ||
        forceRecommendation ||
        (!openingReply && Boolean(task) && intent?.wantsGeneration === true)));
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
      : buildChoiceQuickActions({
          text: assistantText,
          taskId: task?.id,
          canGenerate,
        });
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
        // marketingIntelligence is grafted on by the background settle block
        // below (and via the `marketing.intelligence.ready` SSE event), so we
        // don't include it in the initial payload anymore.
        marketingIntelligence: null,
      } as Prisma.InputJsonValue,
      design_task_id: task?.id,
      tokens_input: usage.input_tokens,
      tokens_output: usage.output_tokens,
      credits_used: credits,
      model: completionModel,
    };
    const activeStreamingAssistant = streamingAssistantMessage as Message | null;
    const assistantMessage = activeStreamingAssistant
      ? await prisma.message.update({
          where: { id: activeStreamingAssistant.id },
          data: assistantPayload,
        })
      : await prisma.message.create({
          data: {
            conversation_id: params.id,
            role: MessageRole.assistant,
            message_type: MessageType.ai,
            ...assistantPayload,
            parent_message_id: userMessage.id,
          },
        });
    assistantFinalized = true;

    await prisma.conversation.update({
      where: { id: params.id },
      data: {
        last_message_at: new Date(),
        active_leaf_message_id: assistantMessage.id,
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

    // Background settle for fire-and-forget marketing intelligence. The main
    // reply has already finished; here we graft the citations/visual refs
    // onto the same message once the search returns, and let the client
    // re-render the references section via SSE. Do not await this promise:
    // awaiting it makes the HTTP request look frozen until search finishes.
    if (intelligencePromise) {
      void intelligencePromise.then(async (settled) => {
        if (settled) {
          const refreshed = await prisma.message.findUnique({ where: { id: assistantMessage.id } });
          const existingMetadata =
            refreshed?.metadata && typeof refreshed.metadata === "object" && !Array.isArray(refreshed.metadata)
              ? (refreshed.metadata as Record<string, unknown>)
              : {};
          const updated = await prisma.message.update({
            where: { id: assistantMessage.id },
            data: {
              metadata: {
                ...existingMetadata,
                marketingIntelligence: {
                  query: settled.query,
                  summary: settled.summary,
                  searchModel: settled.searchModel,
                  sources: settled.sources,
                  visualReferences: settled.visualReferences,
                  referenceCards: settled.visualReferences,
                  groundedMode: settled.groundedMode,
                  createdAt: settled.createdAt,
                },
              } as Prisma.InputJsonValue,
            },
          });
          publishConversationEvent(params.id, "message.updated", shapeMessage(updated));
          publishConversationEvent(params.id, "marketing.intelligence.ready", {
            messageId: assistantMessage.id,
            conversationId: params.id,
            marketingIntelligence: {
              query: settled.query,
              summary: settled.summary,
              sources: settled.sources,
              visualReferences: settled.visualReferences,
              groundedMode: settled.groundedMode,
              createdAt: settled.createdAt,
            },
          });
        }
      }).catch((error) => {
        console.warn("[conversations/:id/messages] marketing intelligence settle failed:", error);
      });
    }

    // Text + image generation now early-return through the dispatcher block
    // above, so by the time we reach this point we're in a plain consultative
    // reply path — no follow-up generation_result message to emit.
    return NextResponse.json({
      userMessage: shapeMessage(userMessage),
      assistantMessage: shapeMessage(assistantMessage),
      task: task ? shapeDesignTask(task) : undefined,
      streaming: false,
    });
  } catch (err) {
    const activeStreamingAssistant = streamingAssistantMessage as Message | null;
    if (activeStreamingAssistant && !assistantFinalized) {
      // Never leave the placeholder stuck in `streaming` status: mark it
      // failed so clients render a settled (failed) message instead of an
      // eternally-typing one.
      try {
        const errorMessage = err instanceof Error ? err.message : "completion failed";
        const publicErrorMessage = errorMessage.includes("requires more credits") || errorMessage.includes("402")
          ? "這次回覆沒有產生完成：模型額度不足或 token 上限過高。請稍後重試，或到後台調整模型設定。"
          : "這次回覆沒有產生完成，請再試一次。";
        const failedMessage = await prisma.message.update({
          where: { id: activeStreamingAssistant.id },
          data: {
            content: { type: "text", text: publicErrorMessage },
            metadata: {
              ...((activeStreamingAssistant.metadata as Record<string, unknown>) ?? {}),
              status: "failed",
              phase: "failed",
              errorMessage,
            } as Prisma.InputJsonValue,
          },
        });
        publishConversationEvent(params.id, "message.updated", shapeMessage(failedMessage));
      } catch (finalizeError) {
        console.warn("[conversations/:id/messages] failed to finalize streaming placeholder:", finalizeError);
      }
    }
    return handleError(err);
  }
}
