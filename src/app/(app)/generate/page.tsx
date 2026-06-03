"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Code2,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Globe2,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  PanelRightOpen,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import AIChatInput from "@/components/ui/ai-chat-input";
import ConversationInterface from "@/components/ui/conversation-interface";
import { SiteRenderer } from "@/components/site-renderer";
import { useConversations } from "@/hooks/useConversations";
import { cleanTaskSummary } from "@/lib/project-brief";
import type { SiteSchema } from "@/lib/site-builder";
import type { ChatMessage, DesignTaskStarter, QuickAction } from "@/types/conversation";

type UsagePayload = {
  period: string;
  plan_credits: number;
  topup_credits: number;
  used_credits: number;
  available: number;
  reset_at: string;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
  };
};

type GenerationStatus = "queued" | "processing" | "completed" | "failed" | "error" | "idle";

type GenerationImageItem = {
  id: string;
  label: string;
  url: string;
  model?: string;
};

type GenerationTextItem = {
  id: string;
  label: string;
  content: string;
};

type GenerationWebsiteItem = {
  id: string;
  label: string;
  siteId?: string;
  openUrl?: string;
  schema?: SiteSchema;
  previewHtml?: string;
  htmlCode?: string;
  rawHtml?: string;
};

type GenerationResultView = {
  messageId: string;
  taskId?: string | null;
  taskType?: string | null;
  templateLabel?: string | null;
  generationThreadId?: string | null;
  sourceMessageId?: string | null;
  parentMessageId?: string | null;
  status: GenerationStatus;
  versionNumber: number;
  expectedOutputCount: number;
  receivedOutputCount: number;
  images: GenerationImageItem[];
  textItems: GenerationTextItem[];
  websiteItems: GenerationWebsiteItem[];
  quickActions: QuickAction[];
  createdAt?: string;
};

type TextArtifactView = {
  messageId: string;
  role: ChatMessage["role"];
  title: string;
  body: string;
  createdAt?: string;
};

type WorkspaceMode = "generation" | "text";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function quickActionsFromMetadata(metadata: Record<string, unknown>) {
  return Array.isArray(metadata.quickActions) ? (metadata.quickActions as QuickAction[]) : [];
}

function imageItemsFromMessage(message: ChatMessage) {
  const metadata = recordValue(message.metadata);
  const outputGroups = Array.isArray(metadata.outputGroups) ? metadata.outputGroups : [];
  const generatedImages = Array.isArray(metadata.generatedImages) ? metadata.generatedImages : [];
  const items: GenerationImageItem[] = [];

  for (const groupValue of outputGroups) {
    const group = recordValue(groupValue);
    const groupItems = Array.isArray(group.items) ? group.items : [group];

    for (const itemValue of groupItems) {
      const item = recordValue(itemValue);
      const url = stringValue(item.url) || stringValue(item.imageUrl);
      if (!url) continue;
      items.push({
        id: stringValue(item.id) || `${message.id}-${items.length + 1}`,
        label: stringValue(item.label) || `圖像 ${items.length + 1}`,
        url,
        model: stringValue(item.model) || undefined,
      });
    }
  }

  if (items.length > 0) return items;

  const fallbackItems: GenerationImageItem[] = [];
  for (const value of generatedImages) {
    const item = recordValue(value);
    const url = stringValue(item.url);
    if (!url) continue;
    fallbackItems.push({
      id: stringValue(item.id) || `${message.id}-${fallbackItems.length + 1}`,
      label: `圖像 ${fallbackItems.length + 1}`,
      url,
      model: stringValue(item.model) || undefined,
    });
  }
  return fallbackItems;
}

function textItemsFromMessage(message: ChatMessage) {
  const metadata = recordValue(message.metadata);
  const outputGroups = Array.isArray(metadata.outputGroups) ? metadata.outputGroups : [];
  const items: GenerationTextItem[] = [];

  for (const groupValue of outputGroups) {
    const group = recordValue(groupValue);
    const groupItems = Array.isArray(group.items) ? group.items : [group];

    for (const itemValue of groupItems) {
      const item = recordValue(itemValue);
      const artifactKind = stringValue(item.artifactKind);
      if (
        artifactKind === "website_html" ||
        stringValue(item.previewHtml) ||
        stringValue(item.rawHtml) ||
        stringValue(item.htmlCode) ||
        isSiteSchema(item.schema)
      ) {
        continue;
      }
      const content = stringValue(item.content) || stringValue(item.previewText);
      if (!content) continue;
      items.push({
        id: stringValue(item.id) || `${message.id}-text-${items.length + 1}`,
        label: stringValue(item.label) || stringValue(group.title) || `內容 ${items.length + 1}`,
        content,
      });
    }
  }

  if (items.length > 0) return items;
  const content = typeof message.content === "string" ? message.content : "";
  return content
    ? [{ id: `${message.id}-text-1`, label: "生成內容", content }]
    : [];
}

function isSiteSchema(value: unknown): value is SiteSchema {
  const record = recordValue(value);
  return typeof record.title === "string" && Array.isArray(record.sections);
}

function websiteItemsFromMessage(message: ChatMessage) {
  const metadata = recordValue(message.metadata);
  const outputGroups = Array.isArray(metadata.outputGroups) ? metadata.outputGroups : [];
  const artifact = recordValue(metadata.artifact);
  const items: GenerationWebsiteItem[] = [];

  for (const groupValue of outputGroups) {
    const group = recordValue(groupValue);
    const groupItems = Array.isArray(group.items) ? group.items : [group];

    for (const itemValue of groupItems) {
      const item = recordValue(itemValue);
      const schema = item.schema;
      const previewHtml =
        stringValue(item.previewHtml) ||
        stringValue(item.rawHtml) ||
        stringValue(item.htmlCode) ||
        stringValue(artifact.previewHtml) ||
        stringValue(artifact.rawHtml) ||
        stringValue(artifact.htmlCode);
      const hasSchema = isSiteSchema(schema);
      if (!previewHtml && !hasSchema) continue;
      items.push({
        id: stringValue(item.id) || `${message.id}-site-${items.length + 1}`,
        label: stringValue(item.label) || (hasSchema ? schema.title : "") || stringValue(artifact.title) || "網站初稿",
        siteId: stringValue(item.siteId) || undefined,
        openUrl: stringValue(item.openUrl) || undefined,
        schema: hasSchema ? schema : undefined,
        previewHtml,
        htmlCode: stringValue(item.htmlCode) || stringValue(artifact.htmlCode) || previewHtml || undefined,
        rawHtml: stringValue(item.rawHtml) || stringValue(artifact.rawHtml) || previewHtml || undefined,
      });
    }
  }

  if (items.length === 0) {
    const previewHtml = stringValue(artifact.previewHtml) || stringValue(artifact.rawHtml) || stringValue(artifact.htmlCode);
    const schema = artifact.siteSpec;
    if (previewHtml || isSiteSchema(schema)) {
      items.push({
        id: `${message.id}-site-artifact`,
        label: stringValue(artifact.title) || (isSiteSchema(schema) ? schema.title : "") || "網站初稿",
        siteId: stringValue(artifact.siteId) || undefined,
        openUrl: stringValue(artifact.exportUrl) || undefined,
        schema: isSiteSchema(schema) ? schema : undefined,
        previewHtml,
        htmlCode: stringValue(artifact.htmlCode) || previewHtml || undefined,
        rawHtml: stringValue(artifact.rawHtml) || previewHtml || undefined,
      });
    }
  }

  return items;
}

function generationResultFromMessage(message: ChatMessage): GenerationResultView | null {
  const metadata = recordValue(message.metadata);
  const metadataType = stringValue(metadata.type);
  if (message.messageType !== "generation_result" && metadataType !== "generation_result") return null;

  const status = stringValue(metadata.status) || "completed";
  const images = imageItemsFromMessage(message);
  const textItems = textItemsFromMessage(message);
  const websiteItems = websiteItemsFromMessage(message);
  return {
    messageId: message.id,
    taskId: stringValue(metadata.taskId) || message.designTaskId || null,
    taskType: stringValue(metadata.taskType) || null,
    templateLabel: stringValue(metadata.templateLabel) || stringValue(metadata.taskType) || "生成結果",
    generationThreadId: stringValue(metadata.generationThreadId) || null,
    sourceMessageId: stringValue(metadata.sourceMessageId) || null,
    parentMessageId: stringValue(metadata.parentMessageId) || null,
    status: (status === "queued" || status === "processing" || status === "completed" || status === "failed" || status === "error"
      ? status
      : "completed") as GenerationStatus,
    versionNumber: numberValue(metadata.versionNumber, 1),
    expectedOutputCount: numberValue(metadata.expectedOutputCount, Math.max(images.length, 1)),
    receivedOutputCount: numberValue(metadata.receivedOutputCount, Math.max(images.length, textItems.length)),
    images,
    textItems,
    websiteItems,
    quickActions: quickActionsFromMetadata(metadata),
    createdAt: message.createdAt,
  };
}

function textLineCount(text: string) {
  return text.split("\n").length;
}

function isTextArtifactMessage(message: ChatMessage) {
  if (message.messageType === "generation_result") return false;
  if (message.role !== "user" && message.role !== "assistant") return false;
  if (typeof message.content !== "string") return false;
  const text = message.content.trim();
  if (!text) return false;
  return text.length > 900 || textLineCount(text) > 14;
}

function titleFromTextArtifact(message: ChatMessage) {
  if (message.role === "user") return "Pasted content";
  const text = typeof message.content === "string" ? message.content : "";
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "文字成果";
  return firstLine.length > 48 ? `${firstLine.slice(0, 48)}...` : firstLine;
}

function textArtifactFromMessage(message: ChatMessage): TextArtifactView | null {
  if (!isTextArtifactMessage(message)) return null;
  return {
    messageId: message.id,
    role: message.role,
    title: titleFromTextArtifact(message),
    body: typeof message.content === "string" ? message.content : "",
    createdAt: message.createdAt,
  };
}

function textBytesLabel(text: string) {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function isGenerateAction(action: QuickAction) {
  return action.action === "proceed_generate" || action.type === "regenerate_design";
}

function isFillAction(action: QuickAction) {
  return action.action === "provide_core_info" || action.action === "use_placeholder" || action.type === "input";
}

function starterIcon(starter: DesignTaskStarter) {
  if (starter.domain === "web") return Globe2;
  if (starter.domain === "text") return FileText;
  return ImageIcon;
}

function formatCredit(value: number) {
  return new Intl.NumberFormat("zh-TW").format(Math.max(0, value));
}

function projectTypeFromResult(result: GenerationResultView) {
  const taskType = result.taskType || "";
  if (result.websiteItems.length > 0) return "website";
  if (result.textItems.length > 0) return "copywriting";
  if (result.images.length > 0) return "design";
  if (taskType.includes("website") || taskType === "landing_page") return "website";
  if (taskType.includes("article") || taskType.includes("copy") || taskType.includes("strategy")) return "copywriting";
  return "project";
}

function titleFromResult(result: GenerationResultView) {
  return (
    result.websiteItems[0]?.label ||
    result.textItems[0]?.label ||
    result.images[0]?.label ||
    result.templateLabel ||
    "專案交付"
  );
}

function compactJsonText(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 1400 ? `${text.slice(0, 1400)}...` : text;
}

function formatResetDate(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function CreditFooter({ usage, error }: { usage: UsagePayload | null; error: string | null }) {
  const exhausted = error === "Token credits exhausted for this period";
  const total = usage ? usage.plan_credits + usage.topup_credits : 0;
  const resetDate = formatResetDate(usage?.reset_at);

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2 text-[11px] leading-5 text-ink-400">
      <span>
        {usage
          ? `Token credits：剩 ${formatCredit(usage.available)} / 共 ${formatCredit(total)}，已用 ${formatCredit(usage.used_credits)}`
          : "Token credits：載入中"}
      </span>
      <span className={exhausted ? "font-medium text-err-500" : "text-ink-400"}>
        {exhausted
          ? "本期 credits 已用完，請加購、升級方案或等待重置"
          : resetDate
            ? `重置日 ${resetDate}`
            : null}
      </span>
    </div>
  );
}

function statusLabel(status: GenerationStatus) {
  if (status === "queued") return "已排隊";
  if (status === "processing") return "生成中";
  if (status === "completed") return "已完成";
  if (status === "failed" || status === "error") return "失敗";
  return "待命";
}

function statusDotClass(status: GenerationStatus) {
  if (status === "queued") return "bg-warn-500 shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn-500)_14%,transparent)]";
  if (status === "processing") return "bg-brand-500 status-dot-processing";
  if (status === "completed") return "bg-ok-500 shadow-[0_0_0_3px_color-mix(in_srgb,var(--ok-500)_14%,transparent)]";
  if (status === "failed" || status === "error") return "bg-err-500 shadow-[0_0_0_3px_color-mix(in_srgb,var(--err-500)_14%,transparent)]";
  return "bg-ink-300";
}

function TextArtifactWorkspacePanel({
  artifact,
  isBusy,
  onClose,
}: {
  artifact: TextArtifactView | null;
  isBusy: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [artifact?.messageId]);

  const body = artifact?.body ?? "";
  const lineCount = body ? textLineCount(body) : 0;
  const roleLabel = artifact?.role === "user" ? "客戶提供內容" : "AI 文字成果";

  return (
    <aside className="animate-panel-in flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[30px] border border-line1 bg-surface shadow-[0_18px_50px_rgba(28,25,23,0.08),0_4px_12px_rgba(28,25,23,0.04)]">
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">{roleLabel}</div>
          <h2 className="mt-2 truncate font-display text-xl font-medium leading-tight text-ink-900">
            {artifact?.title || "內容"}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>{textBytesLabel(body)}</span>
            <span>•</span>
            <span>{lineCount.toLocaleString()} lines</span>
            {isBusy ? (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="status-dot-processing h-1.5 w-1.5 rounded-full bg-brand-500" />
                  更新中
                </span>
              </>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-500 transition hover:bg-hover hover:text-ink-900"
          aria-label="關閉內容面板"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 overflow-auto px-5 pb-5">
        <div className="min-h-full rounded-lg border border-line1 bg-sunken/70 p-5 shadow-inner">
          <div className="whitespace-pre-wrap font-sans text-sm leading-7 text-ink-700">{body || "內容尚未準備好"}</div>
        </div>
      </div>

      <div className="shrink-0 bg-gradient-to-t from-sunken/90 to-transparent px-5 py-4">
        <button
          type="button"
          disabled={!body}
          onClick={() => {
            void navigator.clipboard.writeText(body).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="inline-flex items-center gap-2 rounded-md border border-line1 bg-surface px-4 py-2 text-sm font-medium text-ink-700 shadow-xs transition-[transform,background,border,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover hover:shadow-sm disabled:pointer-events-none disabled:opacity-40"
        >
          <FileText className="h-4 w-4" />
          {copied ? "已複製" : "複製內容"}
        </button>
      </div>
    </aside>
  );
}

function GenerationWorkspacePanel({
  result,
  versions,
  isBusy,
  isCreatingOrder,
  onSelectVersion,
  onClose,
  onQuickAction,
  onCreateProjectOrder,
}: {
  result: GenerationResultView | null;
  versions: GenerationResultView[];
  isBusy: boolean;
  isCreatingOrder: boolean;
  onSelectVersion: (messageId: string) => void;
  onClose: () => void;
  onQuickAction: (action: QuickAction) => void;
  onCreateProjectOrder: (result: GenerationResultView) => void;
}) {
  const [websiteViewMode, setWebsiteViewMode] = useState<"preview" | "html">("preview");
  const [websiteEditText, setWebsiteEditText] = useState("");
  const images = result?.images ?? [];
  const textItems = result?.textItems ?? [];
  const websiteItems = result?.websiteItems ?? [];
  const websiteItem = websiteItems[0] ?? null;
  const isWebsiteResult = Boolean(websiteItem);
  const visibleQuickActions = (result?.quickActions ?? []).filter((action) => {
    const actionType = action.action || action.type;
    return actionType !== "website_view_code";
  });
  const pendingSlots = result
    ? Math.max(0, result.expectedOutputCount - Math.max(result.receivedOutputCount, images.length, websiteItems.length))
    : 0;
  const isWorking = result?.status === "queued" || result?.status === "processing";
  const websiteHtml = websiteItem?.htmlCode || websiteItem?.rawHtml || websiteItem?.previewHtml || "";

  useEffect(() => {
    setWebsiteViewMode("preview");
    setWebsiteEditText("");
  }, [result?.messageId]);

  return (
    <aside className="animate-panel-in flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[30px] border border-line1 bg-surface shadow-[0_18px_50px_rgba(28,25,23,0.08),0_4px_12px_rgba(28,25,23,0.04)]">
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
            <ImageIcon className="h-4 w-4" />
            <span className="truncate">{result?.templateLabel || "生成結果"}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-ink-500">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(result?.status || "idle")}`} />
            <span>{statusLabel(result?.status || "idle")}</span>
            {result ? <span className="rounded-pill border border-line1 bg-sunken px-2 py-0.5">v{result.versionNumber}</span> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-500 transition hover:bg-hover hover:text-ink-900"
          aria-label="關閉生成結果"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {versions.length > 1 ? (
        <div className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-5 pb-3">
          {versions.map((version) => (
            <button
              key={version.messageId}
              type="button"
              onClick={() => onSelectVersion(version.messageId)}
              className={`rounded-pill border px-3 py-1.5 text-xs transition ${
                version.messageId === result?.messageId
                  ? "border-brand-500 bg-brand-500 text-[var(--on-brand)]"
                  : "border-line1 bg-surface text-ink-500 hover:border-line2 hover:bg-hover"
              }`}
            >
              v{version.versionNumber}
            </button>
          ))}
        </div>
      ) : null}

      <div className="scrollbar-none min-h-0 flex-1 overflow-auto px-5 py-5">
        {!result ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-line2 bg-sunken text-sm text-ink-500">
            生成成功後會顯示在這裡
          </div>
        ) : isWebsiteResult && websiteItem ? (
          <div className="flex h-full min-h-0 flex-col">
            {isBusy || isWorking ? (
              <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isWorking ? "網站生成中" : "正在送出網站修改"}
                </div>
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
                  網站結果
                </div>
                <h2 className="mt-1 truncate font-display text-xl font-medium leading-tight text-ink-900">
                  {websiteItem.label}
                </h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="inline-flex rounded-pill bg-sunken p-1">
                  <button
                    type="button"
                    onClick={() => setWebsiteViewMode("preview")}
                    className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition ${
                      websiteViewMode === "preview"
                        ? "bg-surface text-ink-900 shadow-sm"
                        : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    預覽
                  </button>
                  <button
                    type="button"
                    onClick={() => setWebsiteViewMode("html")}
                    disabled={!websiteHtml}
                    className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition disabled:pointer-events-none disabled:opacity-40 ${
                      websiteViewMode === "html"
                        ? "bg-surface text-ink-900 shadow-sm"
                        : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    HTML
                  </button>
                </div>
                {websiteItem.openUrl ? (
                  <a
                    href={websiteItem.openUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-line1 bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 shadow-xs transition-[transform,background,border] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    開啟
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => result && onCreateProjectOrder(result)}
                  disabled={!result || isBusy || isCreatingOrder}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-[var(--on-brand)] shadow-xs transition-[transform,background,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:bg-brand-600 hover:shadow-sm disabled:pointer-events-none disabled:opacity-40"
                >
                  {isCreatingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  送出專案訂單
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    if (websiteItem.openUrl) {
                      window.open(websiteItem.openUrl, "_blank", "noopener,noreferrer");
                      return;
                    }
                    if (!websiteItem.previewHtml) return;
                    const html = websiteItem.previewHtml.includes("<base ")
                      ? websiteItem.previewHtml
                      : websiteItem.previewHtml.replace("<head>", `<head><base href="${window.location.origin}/">`);
                    const blob = new Blob([html], { type: "text/html" });
                    const url = URL.createObjectURL(blob);
                    window.open(url, "_blank", "noopener,noreferrer");
                    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
                  }}
                  disabled={!websiteItem.openUrl && !websiteItem.previewHtml}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line1 bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 shadow-xs transition-[transform,background,border] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover disabled:pointer-events-none disabled:opacity-40"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  滿版
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line1 bg-sunken shadow-sm">
              {websiteViewMode === "html" ? (
                <pre className="scrollbar-none h-full overflow-auto bg-ink-900 p-5 font-mono text-xs leading-6 text-surface">
                  <code>{websiteHtml || "HTML 尚未準備好"}</code>
                </pre>
              ) : websiteItem.previewHtml ? (
                <iframe
                  title={`${websiteItem.label} 預覽`}
                  sandbox="allow-scripts allow-forms"
                  srcDoc={websiteItem.previewHtml}
                  className="h-full w-full border-0 bg-surface"
                />
              ) : websiteItem.schema ? (
                <div className="scrollbar-none h-full overflow-auto">
                  <SiteRenderer schema={websiteItem.schema} siteName={websiteItem.label} />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-ink-500">
                  網站預覽尚未準備好
                </div>
              )}
            </div>
            <div className="mt-4 flex shrink-0 gap-2">
              <input
                value={websiteEditText}
                onChange={(event) => setWebsiteEditText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    const value = websiteEditText.trim();
                    if (!value || isBusy) return;
                    setWebsiteEditText("");
                    onQuickAction({
                      type: "website_edit_direct",
                      action: "website_edit",
                      label: "修改網站",
                      value,
                      siteId: websiteItem.siteId,
                      sourceMessageId: result.messageId,
                    });
                  }
                }}
                disabled={isBusy}
                placeholder="例如：把首屏標題改得更有導購感，CTA 改成索取批發報價"
                className="h-11 min-w-0 flex-1 rounded-md border border-line1 bg-sunken px-4 text-sm text-ink-900 shadow-xs outline-none transition-[background,border,box-shadow] duration-120 ease-smooth placeholder:text-ink-400 focus:border-transparent focus:bg-surface focus:shadow-focus disabled:opacity-50"
              />
              <button
                type="button"
                disabled={!websiteEditText.trim() || isBusy}
                onClick={() => {
                  const value = websiteEditText.trim();
                  if (!value) return;
                  setWebsiteEditText("");
                  onQuickAction({
                    type: "website_edit_direct",
                    action: "website_edit",
                    label: "修改網站",
                    value,
                    siteId: websiteItem.siteId,
                    sourceMessageId: result.messageId,
                  });
                }}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-ink-900 text-surface shadow-xs transition-[transform,background,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:bg-ink-700 hover:shadow-sm active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                aria-label="送出網站修改"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {isWorking ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Banana 正在產生圖像
                </div>
                <div className="mt-1 text-xs text-brand-600">完成後會自動回到這個工作區，不會混進聊天泡泡。</div>
              </div>
            ) : null}

            {isBusy && !isWorking ? (
              <div className="rounded-lg border border-line1 bg-sunken px-4 py-3 text-sm text-ink-500">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在送出修正版
                </div>
                <div className="mt-1 text-xs text-ink-500">如果這輪是修改圖像，後端會直接接 Banana 生成新版。</div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line1 bg-surface px-4 py-3 shadow-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">專案訂單</div>
                <div className="mt-1 text-sm text-ink-700">把目前生成結果與客戶對齊資料送進報價流程。</div>
              </div>
              <button
                type="button"
                onClick={() => result && onCreateProjectOrder(result)}
                disabled={!result || isBusy || isCreatingOrder}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-[var(--on-brand)] shadow-xs transition-[transform,background,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:bg-brand-600 hover:shadow-sm disabled:pointer-events-none disabled:opacity-40"
              >
                {isCreatingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                送出專案訂單
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {images.map((image, index) => (
                <div
                  key={image.id}
                  className="group relative overflow-hidden rounded-lg border border-line1 bg-sunken shadow-sm transition-[transform,box-shadow,border] duration-240 ease-smooth hover:-translate-y-px hover:border-line2 hover:shadow-md"
                >
                  <a href={image.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={image.label} className="animate-reveal-image aspect-square w-full object-cover transition-transform duration-240 ease-out group-hover:scale-[1.02]" />
                  </a>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent px-3 pb-3 pt-10 text-white opacity-0 transition group-hover:opacity-100">
                    <span className="truncate text-xs font-medium">{image.label || `圖像 ${index + 1}`}</span>
                    <a
                      href={image.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface/90 text-ink-700 shadow-sm backdrop-blur transition hover:bg-surface"
                      aria-label="下載圖像"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}

              {Array.from({ length: pendingSlots }).map((_, index) => (
                <div
                  key={`pending-${index}`}
                  className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-line2 bg-sunken text-xs text-ink-400"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>等待圖像 {index + 1}</span>
                  </div>
                </div>
              ))}
            </div>

            {textItems.length > 0 ? (
              <div className="space-y-3">
                {textItems.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-line1 bg-surface p-4 text-sm leading-7 text-ink-700 shadow-sm"
                  >
                    <div className="mb-2 text-xs font-semibold text-ink-500">{item.label}</div>
                    <div className="whitespace-pre-wrap">{item.content}</div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {result && visibleQuickActions.length > 0 ? (
        <div className="shrink-0 bg-gradient-to-t from-sunken/90 to-transparent px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {visibleQuickActions.map((action, index) => (
              <button
                key={`${action.label}-${index}`}
                type="button"
                disabled={isBusy}
                onClick={() => onQuickAction({ ...action, sourceMessageId: result.messageId })}
                className="rounded-md border border-line1 bg-surface px-4 py-2 text-sm font-medium text-ink-700 shadow-xs transition-[transform,background,border,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover hover:shadow-sm disabled:pointer-events-none disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

export default function GeneratePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeConversationId = searchParams.get("conversationId");
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [pendingQuickReply, setPendingQuickReply] = useState<QuickAction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [isResultPanelOpen, setIsResultPanelOpen] = useState(false);
  const [selectedGenerationMessageId, setSelectedGenerationMessageId] = useState<string | null>(null);
  const [selectedTextArtifactId, setSelectedTextArtifactId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("generation");
  const [resultPanelWidth, setResultPanelWidth] = useState(560);
  const [chatScrollSignal, setChatScrollSignal] = useState(0);
  const [isCreatingProjectOrder, setIsCreatingProjectOrder] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const submitLockRef = useRef(false);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);
  const latestGenerationRef = useRef<string | null>(null);
  const latestTextArtifactRef = useRef<string | null>(null);
  const {
    messages,
    activeConversation,
    activeDesignTask,
    designTaskStarters,
    models,
    isSending,
    isLoadingMessages,
    error,
    createConversation,
    createDesignTask,
    generateDesignTask,
    sendMessage,
  } = useConversations(activeConversationId);

  const modelValue = selectedModel || activeConversation?.aiModel || models[0]?.value || "";
  const visibleStarters = useMemo(() => designTaskStarters.slice(0, 9), [designTaskStarters]);
  const hasMessages = messages.length > 0;
  const busy = isSending || isSubmitting;
  const showChatShell = hasMessages || busy;
  const generationResults = useMemo(
    () =>
      messages
        .map(generationResultFromMessage)
        .filter((result): result is GenerationResultView => Boolean(result))
        .reverse(),
    [messages],
  );
  const textArtifacts = useMemo(
    () =>
      messages
        .map(textArtifactFromMessage)
        .filter((artifact): artifact is TextArtifactView => Boolean(artifact)),
    [messages],
  );
  const activeGenerationResult = useMemo(() => {
    if (selectedGenerationMessageId) {
      const selected = generationResults.find((result) => result.messageId === selectedGenerationMessageId);
      if (selected) return selected;
    }
    return generationResults[0] ?? null;
  }, [generationResults, selectedGenerationMessageId]);
  const activeTextArtifact = useMemo(() => {
    if (selectedTextArtifactId) {
      const selected = textArtifacts.find((artifact) => artifact.messageId === selectedTextArtifactId);
      if (selected) return selected;
    }
    return textArtifacts[textArtifacts.length - 1] ?? null;
  }, [selectedTextArtifactId, textArtifacts]);

  async function createProjectOrderFromResult(result: GenerationResultView) {
    const websiteItem = result.websiteItems[0];
    if (isCreatingProjectOrder) return;
    const projectType = projectTypeFromResult(result);
    const title = titleFromResult(result);
    const activeTaskMatchesResult = activeDesignTask && (!result.taskId || activeDesignTask.id === result.taskId);
    const recentCustomerInputs = messages
      .filter((message) => message.role === "user" && typeof message.content === "string" && message.content.trim())
      .slice(-6)
      .map((message) => ({
        id: message.id,
        text: message.content?.trim() ?? "",
        createdAt: message.createdAt ?? null,
      }));
    const cleanSummary = activeTaskMatchesResult ? cleanTaskSummary(activeDesignTask.summary) : "";
    const taskSnapshot = activeTaskMatchesResult
      ? {
          id: activeDesignTask.id,
          taskType: activeDesignTask.taskType,
          templateKey: activeDesignTask.templateKey,
          templateLabel: activeDesignTask.templateLabel,
          title: activeDesignTask.title,
          status: activeDesignTask.status,
          summary: cleanSummary || null,
          collectedData: activeDesignTask.collectedData,
          resolvedRequirements: activeDesignTask.resolvedRequirements,
          missingRequirements: activeDesignTask.missingRequirements,
          currentClarificationGoal: activeDesignTask.currentClarificationGoal,
          clarificationCount: activeDesignTask.clarificationCount,
          recentCustomerInputs,
        }
      : null;
    const requirementsSummary = [
      result.templateLabel ? `任務：${result.templateLabel}` : null,
      result.taskType ? `任務類型：${result.taskType}` : null,
      cleanSummary ? `目前對齊摘要：${cleanSummary}` : null,
      recentCustomerInputs.length > 0
        ? `客戶原話與需求紀錄：\n${recentCustomerInputs.map((item, index) => `${index + 1}. ${item.text}`).join("\n")}`
        : null,
      taskSnapshot?.collectedData ? `已收集資料：\n${compactJsonText(taskSnapshot.collectedData)}` : null,
      taskSnapshot?.resolvedRequirements ? `已確認需求：\n${compactJsonText(taskSnapshot.resolvedRequirements)}` : null,
      taskSnapshot?.missingRequirements ? `仍缺資料：\n${compactJsonText(taskSnapshot.missingRequirements)}` : null,
      websiteItem?.openUrl ? `預覽網址：${websiteItem.openUrl}` : null,
      websiteItem?.siteId ? `Site ID：${websiteItem.siteId}` : null,
      result.images.length > 0 ? `圖像交付：${result.images.length} 張` : null,
      result.textItems.length > 0 ? `文字交付：${result.textItems.length} 份` : null,
      "請後台依目前與客戶對齊的需求、生成結果與修改脈絡進行報價。",
    ].filter(Boolean).join("\n\n");
    setIsCreatingProjectOrder(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submit: true,
          project_type: projectType,
          conversation_id: activeConversationId || undefined,
          title,
          requirements_summary: requirementsSummary,
          deliverable_snapshot: {
            kind: projectType,
            messageId: result.messageId,
            taskId: result.taskId,
            taskType: result.taskType,
            versionNumber: result.versionNumber,
            templateLabel: result.templateLabel,
            websiteItem,
            images: result.images,
            textItems: result.textItems,
            taskSnapshot,
          },
          metadata: {
            source: "generation_result",
            source_message_id: result.messageId,
            source_task_id: result.taskId || activeDesignTask?.id || null,
            task_type: result.taskType,
            project_type: projectType,
            site_id: websiteItem?.siteId,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "建立訂單失敗");
      router.push(`/orders/${json.data.id}`);
      router.refresh();
    } catch (err) {
      console.error("[generate:create-project-order]", err);
      window.alert(err instanceof Error ? err.message : "建立訂單失敗");
    } finally {
      setIsCreatingProjectOrder(false);
    }
  }
  const activeGenerationVersions = useMemo(() => {
    if (!activeGenerationResult) return generationResults;
    const threadId = activeGenerationResult.generationThreadId || activeGenerationResult.messageId;
    return generationResults.filter((result) => {
      const resultThreadId = result.generationThreadId || result.messageId;
      return resultThreadId === threadId;
    });
  }, [activeGenerationResult, generationResults]);

  const refreshUsage = useCallback(async () => {
    const res = await fetch("/api/usage/current", {
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json().catch(() => ({}))) as ApiEnvelope<UsagePayload> | UsagePayload;
    if (!res.ok) return;
    const payload = ("data" in json ? json.data : json) as UsagePayload | undefined;
    setUsage(payload ?? null);
  }, []);

  const withSubmitLock = useCallback(
    async (work: () => Promise<void>) => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setIsSubmitting(true);
      try {
        await work();
      } finally {
        submitLockRef.current = false;
        setIsSubmitting(false);
        void refreshUsage();
      }
    },
    [refreshUsage],
  );

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    const latest = generationResults[0];
    if (!latest) return;
    if (latestGenerationRef.current !== latest.messageId) {
      latestGenerationRef.current = latest.messageId;
      setSelectedGenerationMessageId(latest.messageId);
      setWorkspaceMode("generation");
    }
    setIsResultPanelOpen(true);
  }, [generationResults]);

  useEffect(() => {
    const latest = textArtifacts[textArtifacts.length - 1];
    if (!latest) return;
    if (latestTextArtifactRef.current === latest.messageId) return;
    latestTextArtifactRef.current = latest.messageId;
    setSelectedTextArtifactId(latest.messageId);
    setWorkspaceMode("text");
    setIsResultPanelOpen(true);
  }, [textArtifacts]);

  useEffect(() => {
    function handleMove(event: MouseEvent) {
      if (!resizeStartRef.current) return;
      const delta = resizeStartRef.current.x - event.clientX;
      const maxWidth = Math.min(920, Math.max(520, window.innerWidth - 420));
      const nextWidth = Math.min(maxWidth, Math.max(400, resizeStartRef.current.width + delta));
      setResultPanelWidth(nextWidth);
    }

    function handleUp() {
      resizeStartRef.current = null;
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  async function ensureConversation(autoTitle?: string) {
    if (activeConversationId) return activeConversationId;
    const conversation = await createConversation(autoTitle || "New Conversation", modelValue || undefined);
    router.push(`/generate?conversationId=${conversation.id}`);
    return conversation.id;
  }

  async function handleSend(value: string, files: File[] = []) {
    await withSubmitLock(async () => {
      const content = value.trim();
      if (!content) return;
      setInput("");
      setChatScrollSignal((current) => current + 1);
      const quickReply = pendingQuickReply;
      setPendingQuickReply(null);
      const conversationId = await ensureConversation(content.slice(0, 32));
      await sendMessage(conversationId, {
        content,
        selectedModel: modelValue,
        designTaskIds: activeDesignTask ? [activeDesignTask.id] : [],
        files,
        metadata: {
          source: "web",
          clientVersion: "src-generate",
          ...(quickReply ? { quickReply } : {}),
          ...(activeGenerationResult
            ? {
                targetGeneration: {
                  messageId: activeGenerationResult.messageId,
                  taskId: activeGenerationResult.taskId,
                  generationThreadId: activeGenerationResult.generationThreadId,
                  versionNumber: activeGenerationResult.versionNumber,
                },
              }
            : {}),
        },
      });
      setChatScrollSignal((current) => current + 1);
    });
  }

  async function handleStarter(starter: DesignTaskStarter) {
    await withSubmitLock(async () => {
      const conversationId = await ensureConversation(starter.label);
      const task = await createDesignTask(conversationId, {
        templateKey: starter.templateKey,
        taskType: starter.taskType,
        title: starter.label,
      });
      await sendMessage(conversationId, {
        content: starter.label,
        selectedModel: modelValue,
        designTaskIds: [task.id],
        metadata: {
          source: "web",
          clientVersion: "src-generate",
          starter: {
            templateKey: starter.templateKey,
            taskType: starter.taskType,
          },
        },
      });
    });
  }

  function fillInput(value: string, action?: QuickAction) {
    setInput(value);
    setPendingQuickReply(action ?? null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function handleQuickAction(action: QuickAction) {
    await withSubmitLock(async () => {
      const value = action.value || action.label;
      if (!value) return;
      const actionType = action.action || action.type;
      if (actionType === "website_edit" && action.type !== "website_edit_direct") {
        setIsResultPanelOpen(true);
        fillInput(value, action);
        return;
      }
      if (actionType === "website_view_code") {
        setIsResultPanelOpen(true);
        return;
      }
      if (isFillAction(action)) {
        fillInput(value, action);
        return;
      }
      if (isGenerateAction(action) && action.taskId) {
        setIsResultPanelOpen(true);
        const conversationId = await ensureConversation();
        const result = await generateDesignTask(conversationId, action.taskId, {
          sourceMessageId: action.sourceMessageId || activeGenerationResult?.messageId || null,
          instruction: value,
        });
        const messageId = result?.message?.id;
        if (messageId) setSelectedGenerationMessageId(messageId);
        return;
      }
      const conversationId = await ensureConversation();
      await sendMessage(conversationId, {
        content: value,
        selectedModel: modelValue,
        designTaskIds: action.taskId ? [action.taskId] : activeDesignTask ? [activeDesignTask.id] : [],
        metadata: {
          source: "web",
          clientVersion: "src-generate",
          quickReply: action,
        },
      });
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas text-ink-900">
      <section className="relative flex min-h-0 flex-1 flex-col">
        {showChatShell ? (
          <>
            <div className="relative flex min-h-0 flex-1 overflow-hidden px-3 pt-3 md:px-4 md:pt-4">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {(generationResults.length > 0 || textArtifacts.length > 0) && !isResultPanelOpen ? (
                  <div className="flex shrink-0 justify-end px-2 pb-1">
                    <button
                      type="button"
                      onClick={() => setIsResultPanelOpen(true)}
                      className="inline-flex items-center gap-2 rounded-md border border-line1 bg-surface px-4 py-2 text-sm font-medium text-ink-700 shadow-xs transition-[transform,background,border,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover hover:shadow-sm"
                    >
                      <PanelRightOpen className="h-4 w-4" />
                      {workspaceMode === "text" ? "打開右側內容" : "打開生成結果"}
                    </button>
                  </div>
                ) : null}
                <ConversationInterface
                  messages={messages}
                  scrollSignal={chatScrollSignal}
                  onQuickAction={(action) => void handleQuickAction(action)}
                  onFillInput={fillInput}
                  onOpenTextArtifact={(message) => {
                    setSelectedTextArtifactId(message.id);
                    setWorkspaceMode("text");
                    setIsResultPanelOpen(true);
                  }}
                  onUploadFiles={(files, action) => {
                    void withSubmitLock(async () => {
                      const value = action.value || action.label;
                      const conversationId = await ensureConversation(value.slice(0, 32));
                      await sendMessage(conversationId, {
                        content: value,
                        selectedModel: modelValue,
                        designTaskIds: activeDesignTask ? [activeDesignTask.id] : [],
                        files,
                        metadata: {
                          source: "web",
                          clientVersion: "src-generate",
                          quickReply: action,
                          upload: {
                            assetKind: action.assetKind,
                            field: action.field,
                            fileCount: files.length,
                          },
                        },
                      });
                    });
                  }}
                  showGeneratedImagesInline={false}
                />
                <div className="shrink-0 bg-gradient-to-t from-canvas via-canvas/95 to-transparent px-3 pb-5 pt-3 backdrop-blur-sm transition-[padding,opacity] duration-240 ease-smooth md:px-4">
                  <div className="mx-auto w-full max-w-3xl">
                    <AIChatInput
                      ref={inputRef}
                      value={input}
                      onChange={setInput}
                      onSend={(value, files) => void handleSend(value, files)}
                      loading={busy}
                      modelOptions={models}
                      selectedModel={modelValue}
                      onModelChange={setSelectedModel}
                    />
                    <CreditFooter usage={usage} error={error} />
                  </div>
                </div>
              </div>

              {isResultPanelOpen ? (
                <div
                  className="group/result-panel fixed inset-0 z-40 flex w-full bg-canvas/95 p-3 backdrop-blur transition-[width,transform,opacity] duration-240 ease-smooth md:relative md:inset-auto md:z-auto md:block md:w-[var(--panel-width)] md:shrink-0 md:bg-transparent md:p-0 md:backdrop-blur-0"
                  style={{ "--panel-width": `${resultPanelWidth}px` } as CSSProperties}
                >
                  <button
                    type="button"
                    aria-label="調整結果面板寬度"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      resizeStartRef.current = { x: event.clientX, width: resultPanelWidth };
                    }}
                    className="absolute left-0 top-0 hidden h-full w-6 -translate-x-1/2 cursor-col-resize items-center justify-center text-ink-300 transition hover:text-accent-500 md:flex"
                  >
                    <span className="flex h-14 w-4 items-center justify-center rounded-full border border-line1 bg-surface/90 opacity-45 shadow-sm backdrop-blur transition group-hover/result-panel:opacity-100">
                      <GripVertical className="h-4 w-4" />
                    </span>
                  </button>
                  {workspaceMode === "text" && activeTextArtifact ? (
                    <TextArtifactWorkspacePanel
                      artifact={activeTextArtifact}
                      isBusy={busy}
                      onClose={() => setIsResultPanelOpen(false)}
                    />
                  ) : (
                    <GenerationWorkspacePanel
                      result={activeGenerationResult}
                      versions={activeGenerationVersions}
                      isBusy={busy}
                      isCreatingOrder={isCreatingProjectOrder}
                      onSelectVersion={(messageId) => {
                        setSelectedGenerationMessageId(messageId);
                        setWorkspaceMode("generation");
                      }}
                      onClose={() => setIsResultPanelOpen(false)}
                      onQuickAction={(action) => void handleQuickAction(action)}
                      onCreateProjectOrder={(result) => void createProjectOrderFromResult(result)}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="scrollbar-none min-h-0 flex-1 overflow-auto px-5 py-8">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center pb-10 pt-8">
              <div className="mb-4 flex min-h-5 items-center justify-end gap-3">
                {isLoadingMessages ? <div className="text-xs text-ink-400">載入中</div> : null}
                {error ? <div className="max-w-[320px] truncate text-xs text-err-500">{error}</div> : null}
              </div>
              <div className="mx-auto mb-8 animate-rise text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-600 shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h1 className="font-display text-4xl font-medium leading-tight text-ink-900">Hello，今天想來點什麼？</h1>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-ink-500">
                  先丟一句想法就可以，我會接著收斂 Logo、文案、網頁或視覺方向。
                </p>
              </div>

              <AIChatInput
                ref={inputRef}
                value={input}
                onChange={setInput}
                onSend={(value, files) => void handleSend(value, files)}
                loading={busy}
                modelOptions={models}
                selectedModel={modelValue}
                onModelChange={setSelectedModel}
                placeholder="描述你想做的圖、文案或網頁..."
              />
              <CreditFooter usage={usage} error={error} />

              <div className="mt-8 grid gap-2 sm:grid-cols-3">
                {visibleStarters.map((starter) => {
                  const Icon = starterIcon(starter);
                  return (
                    <button
                      key={`${starter.templateKey}-${starter.taskType}`}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleStarter(starter)}
                      className="group animate-rise rounded-lg border border-line1 bg-surface p-4 text-left shadow-sm transition-[transform,background,border,box-shadow] duration-240 ease-smooth hover:-translate-y-0.5 hover:border-line2 hover:bg-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
                    >
                      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-sunken text-ink-500 transition-[background,color] duration-120 ease-smooth group-hover:bg-accent-50 group-hover:text-accent-600">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-sm font-semibold text-ink-900">{starter.label}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-ink-500">{starter.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
