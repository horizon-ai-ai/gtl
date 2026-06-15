"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, FileText, Globe2, Image as ImageIcon, Loader2, Pencil, RotateCcw, Search, Square, Upload, X } from "lucide-react";
import type { ChatMessage, QuickAction } from "@/types/conversation";

export type GenerationArtifactSummary = {
  kind: "image" | "text" | "web";
  title: string;
  subtitle?: string | null;
  thumbnailUrl?: string | null;
  versionLabel?: string | null;
  status?: "queued" | "processing" | "streaming" | "completed" | "failed" | "error" | "idle" | null;
  isActive?: boolean;
};

type ConversationInterfaceProps = {
  messages: ChatMessage[];
  onQuickAction?: (action: QuickAction, message: ChatMessage) => void;
  onFillInput?: (value: string, action: QuickAction, message: ChatMessage) => void;
  onUploadFiles?: (files: File[], action: QuickAction, message: ChatMessage) => void;
  onOpenTextArtifact?: (message: ChatMessage) => void;
  onOpenGenerationResult?: (message: ChatMessage) => void;
  artifactSummaryForMessage?: (message: ChatMessage) => GenerationArtifactSummary | null;
  onEditMessage?: (message: ChatMessage, content: string) => boolean | void | Promise<boolean | void>;
  onCancelMessage?: (message: ChatMessage) => void;
  onRegenerateMessage?: (message: ChatMessage) => void;
  versionInfoForMessage?: (message: ChatMessage) => { label: string; canPrevious: boolean; canNext: boolean } | null;
  onPreviousVersion?: (message: ChatMessage) => void;
  onNextVersion?: (message: ChatMessage) => void;
  showGeneratedImagesInline?: boolean;
  scrollSignal?: number;
};

function messageText(message: ChatMessage) {
  if (typeof message.content === "string") return message.content;
  return "";
}

function isLongTextArtifact(message: ChatMessage, text: string) {
  if (message.role !== "user") return false;
  if (text.length > 900) return true;
  return text.split("\n").length > 14;
}

function metadataStatus(metadata: ChatMessage["metadata"]) {
  if (!metadata || typeof metadata !== "object") return null;
  const status = metadata.status;
  return typeof status === "string" ? status : null;
}

function compactTextTitle(text: string) {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "長內容";
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}...` : firstLine;
}

function orderedItem(line: string) {
  const trimmed = line.trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot > 2) return null;
  const prefix = trimmed.slice(0, dot);
  if (![...prefix].every((char) => char >= "0" && char <= "9")) return null;
  const rest = trimmed.slice(dot + 1).trim();
  return rest ? { marker: prefix, content: rest } : null;
}

function headingLine(line: string) {
  const trimmed = line.trim();
  let level = 0;
  while (trimmed[level] === "#") level += 1;
  if (level === 0 || level > 3 || trimmed[level] !== " ") return null;
  return { level, content: trimmed.slice(level + 1).trim() };
}

function unorderedItem(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) return null;
  const content = trimmed.slice(2).trim();
  return content ? { content } : null;
}

function tableCells(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
  return cells.length >= 2 ? cells : null;
}

function isTableSeparator(cells: string[]) {
  return cells.every((cell) => {
    const normalized = cell.split("").filter((char) => char !== ":" && char !== "-" && char !== " ").join("");
    return normalized.length === 0 && cell.includes("-");
  });
}

function InlineMarkdown({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("**", cursor);
    if (start < 0) {
      nodes.push(text.slice(cursor));
      break;
    }
    const end = text.indexOf("**", start + 2);
    if (end < 0) {
      nodes.push(text.slice(cursor));
      break;
    }
    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <strong key={`${start}-${end}`} className="font-semibold text-ink-900">
        {text.slice(start + 2, end)}
      </strong>,
    );
    cursor = end + 2;
  }

  return <>{nodes}</>;
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const heading = headingLine(trimmed);
    if (heading) {
      const className =
        heading.level === 1
          ? "mt-5 font-display text-xl font-medium leading-8 text-ink-900 first:mt-0"
          : heading.level === 2
            ? "mt-5 font-display text-lg font-medium leading-7 text-ink-900 first:mt-0"
            : "mt-4 text-base font-semibold leading-7 text-ink-900 first:mt-0";
      blocks.push(
        <div key={`h-${index}`} className={className}>
          <InlineMarkdown text={heading.content} />
        </div>,
      );
      index += 1;
      continue;
    }

    if (trimmed === "---" || trimmed === "----") {
      blocks.push(<hr key={`hr-${index}`} className="my-5 border-line1" />);
      index += 1;
      continue;
    }

    const firstTableCells = tableCells(trimmed);
    const nextTableCells = index + 1 < lines.length ? tableCells(lines[index + 1]) : null;
    if (firstTableCells && nextTableCells && isTableSeparator(nextTableCells)) {
      const headers = firstTableCells;
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const cells = tableCells(lines[index]);
        if (!cells) break;
        rows.push(cells);
        index += 1;
      }
      blocks.push(
        <div key={`table-${index}`} className="my-5 overflow-x-auto rounded-lg border border-line1 bg-surface">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-sunken text-ink-900">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={`${header}-${headerIndex}`} className="border-b border-line1 px-3 py-2 font-semibold">
                    <InlineMarkdown text={header} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line1 last:border-b-0">
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 align-top text-ink-700">
                      <InlineMarkdown text={row[cellIndex] ?? ""} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const ordered = orderedItem(trimmed);
    if (ordered) {
      const items: Array<{ marker: string; content: string }> = [];
      while (index < lines.length) {
        const item = orderedItem(lines[index]);
        if (!item) break;
        items.push(item);
        index += 1;
        while (index < lines.length && !lines[index].trim()) index += 1;
      }
      blocks.push(
        <div key={`ol-${index}`} className="my-4 space-y-4">
          {items.map((item) => (
            <div key={`${item.marker}-${item.content}`} className="flex gap-3">
              <div className="w-6 shrink-0 text-right tabular-nums text-ink-400">{item.marker}.</div>
              <div className="min-w-0 flex-1">
                <InlineMarkdown text={item.content} />
              </div>
            </div>
          ))}
        </div>,
      );
      continue;
    }

    const unordered = unorderedItem(trimmed);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = unorderedItem(lines[index]);
        if (!item) break;
        items.push(item.content);
        index += 1;
        while (index < lines.length && !lines[index].trim()) index += 1;
      }
      blocks.push(
        <ul key={`ul-${index}`} className="my-4 list-disc space-y-2 pl-5">
          {items.map((item) => (
            <li key={item} className="leading-7">
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || headingLine(next) || orderedItem(next) || unorderedItem(next) || tableCells(next) || next === "---" || next === "----") break;
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push(
      <p key={`p-${index}`} className="my-3 leading-7 first:mt-0 last:mb-0">
        <InlineMarkdown text={paragraphLines.join(" ")} />
      </p>,
    );
  }

  return <div>{blocks}</div>;
}

function progressDetails(message?: ChatMessage | null) {
  const rawDecision = message?.stepDecision || message?.metadata?.stepDecision;
  const decision = rawDecision && typeof rawDecision === "object" && !Array.isArray(rawDecision)
    ? (rawDecision as Record<string, unknown>)
    : {};
  const stageLabel = typeof decision.stageLabel === "string" ? decision.stageLabel : "";
  const stageDescription = typeof decision.stageDescription === "string" ? decision.stageDescription : "";
  const domain = typeof decision.domain === "string" ? decision.domain : "";
  const stageIndex = typeof decision.stageIndex === "number" ? decision.stageIndex : null;
  const canGenerate = Boolean(decision.canGenerate);

  if (domain === "web") {
    const flow = ["類別確認", "資訊內容確認", "風格確認", "補充確認", "產出初稿"];
    const currentIndex = stageIndex ?? flow.indexOf(stageLabel);
    return {
      current: stageLabel || "網站資料收集中",
      details: stageLabel
        ? flow.map((label, index) => {
            if (currentIndex >= 0 && index < currentIndex) return `已完成：${label}`;
            if (currentIndex >= 0 && index === currentIndex) {
              return stageDescription ? `目前：${label}，${stageDescription}` : `目前：${label}`;
            }
            return `接著：${label}`;
          })
        : [
            "訊息已送出",
            canGenerate ? "資料已足夠，準備產生網站初稿" : "等待網站流程回傳下一步",
          ],
    };
  }

  if (stageLabel) {
    const flow = ["資訊內容確認", "設計感覺確認", "規格與形式確認", "補充確認", "產出初稿"];
    const currentIndex = stageIndex ?? flow.indexOf(stageLabel);
    return {
      current: stageLabel,
      details: flow.map((label, index) => {
        if (currentIndex >= 0 && index < currentIndex) return `已完成：${label}`;
        if (currentIndex >= 0 && index === currentIndex) {
          return stageDescription ? `目前：${label}，${stageDescription}` : `目前：${label}`;
        }
        return `接著：${label}`;
      }),
    };
  }

  return {
    current: "等待回覆開始",
    details: ["訊息已送出", "等待後端回傳第一段內容", "如果需要搜尋、生成或讀取素材，完成後會顯示下一步"],
  };
}

function ProgressTrail({ message }: { message?: ChatMessage | null }) {
  const progress = progressDetails(message);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full max-w-[420px] px-1 py-2">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="inline-flex items-center gap-2 rounded-pill border border-line1 bg-surface px-3 py-1.5 text-xs text-ink-500 shadow-xs transition-[transform,background,border] duration-120 ease-smooth hover:-translate-y-px hover:border-line2 hover:bg-hover"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="status-dot-processing flex h-1.5 w-1.5 rounded-full bg-brand-500" />
        <span>目前進度：{progress.current}</span>
      </button>

      {expanded ? (
        <div className="mt-2 rounded-lg border border-line1 bg-surface p-3 text-xs text-ink-500 shadow-sm">
          <div className="space-y-2">
            {progress.details.map((step, index) => {
              const isActive = step.startsWith("目前：") || (index === 0 && progress.details.length === 1);
              return (
                <div key={`${step}-${index}`} className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isActive ? "bg-brand-500" : "bg-ink-300"
                    }`}
                  />
                  <span className={isActive ? "text-ink-900" : ""}>{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TypewriterText({
  text,
  enabled,
  onDone,
  onProgress,
  render,
  progressMessage,
}: {
  text: string;
  enabled: boolean;
  onDone?: () => void;
  onProgress?: () => void;
  render?: (visibleText: string) => ReactNode;
  progressMessage?: ChatMessage;
}) {
  const [visibleCount, setVisibleCount] = useState(enabled ? 0 : text.length);
  const onDoneRef = useRef(onDone);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    if (!enabled) {
      setVisibleCount(text.length);
      onDoneRef.current?.();
      return;
    }
    if (!text) {
      setVisibleCount(0);
      return;
    }

    setVisibleCount((current) => Math.min(current, text.length));
    const step = text.length > 900 ? 8 : text.length > 420 ? 5 : 3;
    const interval = window.setInterval(() => {
      setVisibleCount((current) => {
        const next = Math.min(current + step, text.length);
        if (next >= text.length) {
          window.clearInterval(interval);
          window.setTimeout(() => onDoneRef.current?.(), 80);
        }
        onProgressRef.current?.();
        return next;
      });
    }, 24);

    return () => window.clearInterval(interval);
  }, [enabled, text]);

  if (!text && enabled) return <ProgressTrail message={progressMessage} />;

  const visibleText = text.slice(0, visibleCount);
  return render ? <>{render(visibleText)}</> : <div className="whitespace-pre-wrap">{visibleText}</div>;
}

function actionKey(message: ChatMessage, action: QuickAction, index: number) {
  return `${message.id}:${action.action || action.type || "quick"}:${action.label}:${index}`;
}

function fillValue(action: QuickAction) {
  if (action.action === "provide_core_info") return action.value || action.label;
  if (action.action === "use_placeholder") return action.value || action.label;
  if (action.type === "input") return action.value || action.label;
  return "";
}

function generatedImages(message: ChatMessage) {
  const metadataImages = message.metadata?.generatedImages;
  const content = message.content;
  const contentImages =
    content && typeof content === "object" && "images" in content
      ? (content as { images?: unknown }).images
      : null;
  const source = Array.isArray(metadataImages) ? metadataImages : Array.isArray(contentImages) ? contentImages : [];
  return source
    .map((item) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        url: typeof record.url === "string" ? record.url : "",
        model: typeof record.model === "string" ? record.model : "",
      };
    })
    .filter((item) => item.url);
}

function messageImageAttachments(message: ChatMessage) {
  return (message.attachments ?? []).filter((attachment) => attachment.type === "image" && attachment.url);
}

function websiteWidget(message: ChatMessage) {
  const builder = message.metadata?.websiteBuilder;
  if (!builder || typeof builder !== "object" || Array.isArray(builder)) return null;
  const widget = (builder as Record<string, unknown>).widget;
  return widget && typeof widget === "object" && !Array.isArray(widget)
    ? (widget as Record<string, unknown>)
    : null;
}

type WebsiteProductOption = ProductFormState & {
  productId: string;
  linkedProductId: string;
  imageUrl?: string;
  imageUrls?: string[];
};

function websiteProductOptions(message: ChatMessage): WebsiteProductOption[] {
  const builder = message.metadata?.websiteBuilder;
  if (!builder || typeof builder !== "object" || Array.isArray(builder)) return [];
  const options = (builder as Record<string, unknown>).productOptions;
  if (!Array.isArray(options)) return [];
  const parsed: WebsiteProductOption[] = [];
  for (const option of options) {
    const record = option && typeof option === "object" ? (option as Record<string, unknown>) : {};
    const productId = typeof record.productId === "string" ? record.productId : "";
    const linkedProductId = typeof record.linkedProductId === "string" ? record.linkedProductId : productId;
    if (!productId && !linkedProductId) continue;
    parsed.push({
      productId,
      linkedProductId,
      name: typeof record.name === "string" ? record.name : "",
      shortDescription: typeof record.shortDescription === "string" ? record.shortDescription : "",
      barcode: typeof record.barcode === "string" ? record.barcode : "",
      category: typeof record.category === "string" ? record.category : "",
      specs: typeof record.specs === "string" ? record.specs : "",
      quantityRange: typeof record.quantityRange === "string" ? record.quantityRange : "",
      unitPrice: typeof record.unitPrice === "string" ? record.unitPrice : "",
      totalPrice: typeof record.totalPrice === "string" ? record.totalPrice : "",
      notes: typeof record.notes === "string" ? record.notes : "",
      origin: typeof record.origin === "string" ? record.origin : "",
      storageMethod: typeof record.storageMethod === "string" ? record.storageMethod : "",
      sellerInfo: typeof record.sellerInfo === "string" ? record.sellerInfo : "",
      specialCompliance: typeof record.specialCompliance === "string" ? record.specialCompliance : "",
      returnWarranty: typeof record.returnWarranty === "string" ? record.returnWarranty : "",
      imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : "",
      imageUrls: Array.isArray(record.imageUrls)
        ? record.imageUrls.filter((item): item is string => typeof item === "string")
        : [],
    });
  }
  return parsed;
}

function uploadLabelForWidget(widget: Record<string, unknown>) {
  if (typeof widget.uploadLabel === "string" && widget.uploadLabel.trim()) return widget.uploadLabel.trim();
  if (widget.kind === "product-card") return "商品圖片";
  return "圖片素材";
}

type ProductFormState = {
  productId?: string;
  linkedProductId?: string;
  imageUrl?: string;
  imageUrls?: string[];
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
};

type ProductDraft = ProductFormState & {
  localFiles: File[];
};

const emptyProductForm: ProductFormState = {
  name: "",
  shortDescription: "",
  barcode: "",
  category: "",
  specs: "",
  quantityRange: "",
  unitPrice: "",
  totalPrice: "",
  notes: "",
  origin: "",
  storageMethod: "",
  sellerInfo: "",
  specialCompliance: "",
  returnWarranty: "",
};

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberText(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function firstText(values: unknown[]) {
  for (const value of values) {
    const text = stringFrom(value) || numberText(value);
    if (text.trim()) return text.trim();
  }
  return "";
}

function stringArrayFrom(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function tradeProductToWebsiteOption(value: unknown): WebsiteProductOption | null {
  const product = recordFrom(value);
  const id = stringFrom(product.id);
  const name = stringFrom(product.name);
  if (!id || !name) return null;
  const specs = recordFrom(product.specs);
  const seller = recordFrom(product.seller);
  const company = recordFrom(seller.company);
  const images = stringArrayFrom(product.images);
  const unit = stringFrom(product.unit) || "pcs";
  const currency = stringFrom(product.currency) || "USD";
  const priceMin = typeof product.price_min === "number" ? product.price_min : null;
  const priceMax = typeof product.price_max === "number" ? product.price_max : null;
  const priceLabel =
    priceMin !== null && priceMax !== null && priceMin !== priceMax
      ? `${currency} ${priceMin}-${priceMax} / ${unit}`
      : priceMin !== null
        ? `${currency} ${priceMin} / ${unit}`
        : priceMax !== null
          ? `${currency} ${priceMax} / ${unit}`
          : "";
  const dimensions = [
    stringFrom(specs.product_spec_text),
    stringFrom(specs.unit_length_cm) ? `長 ${stringFrom(specs.unit_length_cm)} cm` : "",
    stringFrom(specs.unit_width_cm) ? `寬 ${stringFrom(specs.unit_width_cm)} cm` : "",
    stringFrom(specs.unit_height_cm) ? `高 ${stringFrom(specs.unit_height_cm)} cm` : "",
    stringFrom(specs.unit_weight_kg) ? `重量 ${stringFrom(specs.unit_weight_kg)} kg` : "",
    stringFrom(specs.carton_quantity) ? `箱入數 ${stringFrom(specs.carton_quantity)}` : "",
    stringFrom(specs.carton_net_weight_kg) ? `淨重 ${stringFrom(specs.carton_net_weight_kg)} kg` : "",
    stringFrom(specs.carton_gross_weight_kg) ? `毛重 ${stringFrom(specs.carton_gross_weight_kg)} kg` : "",
  ].filter(Boolean).join(" / ");
  const storage = [
    stringFrom(specs.storage_method),
    stringFrom(specs.temp_control),
    stringFrom(specs.shelf_life),
    stringFrom(specs.storage_days) ? `保存 ${stringFrom(specs.storage_days)} ${stringFrom(specs.storage_unit)}` : "",
  ].filter(Boolean).join(" / ");
  const compliance = [
    stringFrom(specs.ingredients),
    stringFrom(specs.allergens),
    stringFrom(specs.nutrition_label),
    stringFrom(specs.permit_no),
    stringFrom(specs.food_registration_no),
    stringFrom(specs.liability_insurance),
    stringFrom(specs.tax_category),
    ...stringArrayFrom(product.certifications),
  ].filter(Boolean).join(" / ");

  return {
    productId: id,
    linkedProductId: id,
    name,
    shortDescription: firstText([
      product.description,
      specs.feature_description,
      specs.full_description,
      specs.marketing_claim,
    ]),
    barcode: firstText([specs.barcode, product.hs_code]),
    category: stringFrom(product.category),
    specs: dimensions,
    quantityRange: firstText([specs.quantity_range, typeof product.moq === "number" ? `至少 ${product.moq} ${unit}` : ""]),
    unitPrice: priceLabel,
    totalPrice: firstText([specs.total_price, "依採購數量與報價單計算"]),
    notes: firstText([
      specs.remarks,
      specs.marketing_claim,
      specs.feature_description,
      typeof product.lead_time_days === "number" ? `交期約 ${product.lead_time_days} 天` : "",
    ]),
    origin: stringFrom(product.origin_country),
    storageMethod: storage,
    sellerInfo: firstText([specs.seller_info, company.name, seller.display_name]),
    specialCompliance: compliance,
    returnWarranty: firstText([specs.return_policy, specs.warranty_policy, "依報價單、退換貨與售後保固條款確認"]),
    imageUrl: images[0] || "",
    imageUrls: images,
  };
}

function mergeProductOptions(primary: WebsiteProductOption[], fallback: WebsiteProductOption[]) {
  const seen = new Set<string>();
  const merged: WebsiteProductOption[] = [];
  for (const option of [...primary, ...fallback]) {
    const key = option.linkedProductId || option.productId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(option);
  }
  return merged;
}

function productSearchText(option: WebsiteProductOption) {
  return [
    option.name,
    option.category,
    option.barcode,
    option.shortDescription,
    option.specs,
    option.notes,
    option.sellerInfo,
  ].join(" ").toLowerCase();
}

function productFormComplete(product: ProductFormState) {
  return [
    product.name,
    product.category,
    product.specs,
    product.quantityRange,
    product.unitPrice,
    product.totalPrice,
    product.notes,
    product.origin,
    product.storageMethod,
    product.sellerInfo,
    product.returnWarranty,
  ].every((value) => value.trim().length > 0);
}

function ProductField({
  label,
  value,
  onChange,
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-500">
        {label}
        {required ? <span className="text-err-500"> *</span> : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-line1 bg-sunken px-3 text-sm text-ink-900 shadow-xs outline-none transition-[background,border,box-shadow] duration-120 ease-smooth placeholder:text-ink-400 focus:border-transparent focus:bg-surface focus:shadow-focus"
      />
    </label>
  );
}

function ProductTextArea({
  label,
  value,
  onChange,
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-500">
        {label}
        {required ? <span className="text-err-500"> *</span> : null}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border border-line1 bg-sunken px-3 py-2 text-sm leading-6 text-ink-900 shadow-xs outline-none transition-[background,border,box-shadow] duration-120 ease-smooth placeholder:text-ink-400 focus:border-transparent focus:bg-surface focus:shadow-focus"
      />
    </label>
  );
}

function WebsiteUploadWidget({
  message,
  widget,
  productOptions,
  disabled,
  onUploadFiles,
}: {
  message: ChatMessage;
  widget: Record<string, unknown>;
  productOptions: WebsiteProductOption[];
  disabled: boolean;
  onUploadFiles?: (files: File[], action: QuickAction, message: ChatMessage) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [product, setProduct] = useState<ProductFormState>(emptyProductForm);
  const [productDrafts, setProductDrafts] = useState<ProductDraft[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [fetchedProductOptions, setFetchedProductOptions] = useState<WebsiteProductOption[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const kind = typeof widget.kind === "string" ? widget.kind : "";
  const field = typeof widget.field === "string" ? widget.field : "";
  const assetKind = typeof widget.assetKind === "string" ? widget.assetKind : kind === "product-card" ? "products" : "asset";
  const multiple = widget.multiple === true || kind === "product-card";
  const label = uploadLabelForWidget(widget);
  const isProductCard = kind === "product-card";
  const selectableProductOptions = mergeProductOptions(productOptions, fetchedProductOptions);
  const filteredProductOptions = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return selectableProductOptions;
    return selectableProductOptions.filter((option) => productSearchText(option).includes(query));
  }, [productSearch, selectableProductOptions]);
  const canAddProduct = isProductCard && productFormComplete(product);
  const canSend = Boolean(onUploadFiles) && !disabled && (isProductCard ? productDrafts.length > 0 || canAddProduct : selectedFiles.length > 0);

  useEffect(() => {
    const query = productSearch.trim();
    if (!isProductCard || (productOptions.length > 0 && !query)) return;
    let cancelled = false;
    setIsLoadingProducts(true);
    const url = query
      ? `/api/conversations/website-products?q=${encodeURIComponent(query)}`
      : "/api/conversations/website-products";
    fetch(url)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (cancelled) return;
        const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>).data : null;
        const options = Array.isArray(data)
          ? data.map(tradeProductToWebsiteOption).filter((option): option is WebsiteProductOption => Boolean(option))
          : [];
        setFetchedProductOptions(options);
      })
      .catch(() => {
        if (!cancelled) setFetchedProductOptions([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProducts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isProductCard, productOptions.length, productSearch]);

  if (kind !== "file" && kind !== "product-card") return null;

  return (
    <div className="mt-4 w-full max-w-[720px] rounded-lg border border-line1 bg-surface p-4 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink-900">
            {kind === "product-card" ? "選擇或新增商品資料" : `上傳${label}`}
          </div>
          <div className="mt-0.5 text-xs leading-5 text-ink-500">
            {isProductCard ? "可從商品庫加入，也可手動新增多個商品；資料會用於一頁式文案與報價單內容。" : "可先上傳圖片素材，之後會帶進網站初稿。"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md border border-line1 bg-surface px-3 py-2 text-xs font-medium text-ink-700 shadow-xs transition-[transform,background,border,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover disabled:pointer-events-none disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          選擇圖片
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          setSelectedFiles(Array.from(event.target.files ?? []).slice(0, 8));
        }}
      />

      {selectedFiles.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedFiles.map((file) => (
            <span
              key={`${file.name}-${file.size}`}
              className="max-w-full truncate rounded-pill bg-sunken px-3 py-1 text-xs text-ink-500"
            >
              {file.name}
            </span>
          ))}
        </div>
      ) : null}

      {isProductCard ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-line1 bg-sunken p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-ink-500">從商品資料庫加入</div>
              {isLoadingProducts ? <div className="text-[11px] text-ink-400">讀取中</div> : null}
            </div>
            <label className="mb-3 flex items-center gap-2 rounded-md border border-line1 bg-surface px-3 py-2 shadow-xs focus-within:border-transparent focus-within:shadow-focus">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="搜尋商品名稱、分類、條碼或規格"
                className="h-7 min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
              />
            </label>
            {filteredProductOptions.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {filteredProductOptions.slice(0, 12).map((option) => {
                  const alreadyAdded = productDrafts.some((draft) => (draft.linkedProductId || draft.productId) === (option.linkedProductId || option.productId));
                  return (
                    <button
                      key={option.linkedProductId || option.productId}
                      type="button"
                      disabled={disabled || alreadyAdded}
                      onClick={() => {
                        setProductDrafts((current) => [
                          ...current,
                          {
                            ...option,
                            localFiles: [],
                          },
                        ]);
                      }}
                      className="group flex min-w-0 items-center gap-3 rounded-md border border-line1 bg-surface p-2 text-left shadow-xs transition-[transform,background,border,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover disabled:pointer-events-none disabled:opacity-45"
                    >
                      {option.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={option.imageUrl} alt={option.name} className="h-12 w-12 shrink-0 rounded-sm object-cover" />
                      ) : (
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-sm bg-brand-50 text-xs font-semibold text-brand-600">
                          {option.name.slice(0, 2)}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-900">{option.name}</span>
                        <span className="block truncate text-xs text-ink-500">
                          {option.category || "未分類"} · {option.unitPrice || option.quantityRange || "資料庫商品"}
                        </span>
                      </span>
                      <span className="ml-auto shrink-0 text-xs font-medium text-accent-500">
                        {alreadyAdded ? "已加入" : "加入"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-line1 bg-surface px-3 py-2 text-xs leading-5 text-ink-500">
                {isLoadingProducts
                  ? "正在讀取你的商品庫。"
                  : productSearch.trim()
                    ? "沒有找到符合搜尋的商品。可以換個關鍵字，或用下方表單新增商品。"
                    : "目前沒有讀到可加入的商品。你仍可用下方表單新增多個商品，送出後會帶進這次網站流程。"}
              </div>
            )}
          </div>

          {productDrafts.length > 0 ? (
            <div className="rounded-lg border border-line1 bg-sunken p-3">
              <div className="mb-2 text-xs font-semibold text-ink-500">已新增商品</div>
              <div className="space-y-2">
                {productDrafts.map((draft, index) => (
                  <div key={`${draft.name}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm shadow-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-900">{draft.name}</div>
                      <div className="truncate text-xs text-ink-500">
                        {draft.category} · {draft.quantityRange} · {draft.unitPrice}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProduct(draft);
                        setSelectedFiles(draft.localFiles);
                        setProductDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
                        window.setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="shrink-0 rounded-pill px-2 py-1 text-xs text-ink-500 transition hover:bg-hover hover:text-ink-900"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      className="shrink-0 rounded-pill px-2 py-1 text-xs text-ink-500 transition hover:bg-hover hover:text-ink-900"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <ProductField label="商品名稱" required value={product.name} onChange={(value) => setProduct((current) => ({ ...current, name: value }))} />
            <ProductField label="分類" required value={product.category} onChange={(value) => setProduct((current) => ({ ...current, category: value }))} placeholder="不顯示在報價單上" />
            <ProductField label="國際條碼" value={product.barcode} onChange={(value) => setProduct((current) => ({ ...current, barcode: value }))} />
            <ProductField label="數量範圍" required value={product.quantityRange} onChange={(value) => setProduct((current) => ({ ...current, quantityRange: value }))} placeholder="例如 100-300 件" />
            <ProductField label="單價" required value={product.unitPrice} onChange={(value) => setProduct((current) => ({ ...current, unitPrice: value }))} placeholder="可填費用範圍，例如 USD 12-18 / pcs" />
            <ProductField label="總價" required value={product.totalPrice} onChange={(value) => setProduct((current) => ({ ...current, totalPrice: value }))} placeholder="可依數量範圍填估算總價或報價備註" />
          </div>
          <ProductTextArea label="商品簡述介紹" value={product.shortDescription} onChange={(value) => setProduct((current) => ({ ...current, shortDescription: value }))} placeholder="不顯示在報價單上，主要給一頁式文案使用" />
          <ProductTextArea label="商品規格" required value={product.specs} onChange={(value) => setProduct((current) => ({ ...current, specs: value }))} placeholder="尺寸、毛重、淨重、材質、包裝等" />
          <ProductTextArea label="備註欄" required value={product.notes} onChange={(value) => setProduct((current) => ({ ...current, notes: value }))} />
          <div className="grid gap-3 md:grid-cols-3">
            <ProductField label="產地" required value={product.origin} onChange={(value) => setProduct((current) => ({ ...current, origin: value }))} />
            <ProductField label="保存方式" required value={product.storageMethod} onChange={(value) => setProduct((current) => ({ ...current, storageMethod: value }))} />
            <ProductField label="賣家資訊" required value={product.sellerInfo} onChange={(value) => setProduct((current) => ({ ...current, sellerInfo: value }))} />
          </div>
          <ProductTextArea label="特殊商品標示" value={product.specialCompliance} onChange={(value) => setProduct((current) => ({ ...current, specialCompliance: value }))} placeholder="食品/生鮮：保存期限、過敏原、成分營養；美妝/保養/藥品：檢驗字號或成分" />
          <ProductTextArea label="退換貨與售後保固條款" required value={product.returnWarranty} onChange={(value) => setProduct((current) => ({ ...current, returnWarranty: value }))} />
        </div>
      ) : null}

      <div className="mt-3 flex justify-end">
        {isProductCard ? (
          <button
            type="button"
            disabled={!canAddProduct || disabled}
            onClick={() => {
              if (!canAddProduct) return;
              setProductDrafts((current) => [...current, { ...product, localFiles: selectedFiles }]);
              setProduct(emptyProductForm);
              setSelectedFiles([]);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="mr-2 rounded-md border border-line1 bg-surface px-4 py-2 text-sm font-medium text-ink-700 shadow-xs transition-[transform,background,border] duration-120 ease-snap hover:-translate-y-px hover:bg-hover disabled:pointer-events-none disabled:opacity-40"
          >
            新增下一個商品
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canSend}
          onClick={() => {
            if (!canSend) return;
            const finalDrafts = isProductCard && canAddProduct
              ? [...productDrafts, { ...product, localFiles: selectedFiles }]
              : productDrafts;
            let imageCursor = 0;
            const productPayload = finalDrafts.map((draft) => {
              const imageFileIndexes = draft.localFiles.map((_, fileIndex) => imageCursor + fileIndex);
              imageCursor += draft.localFiles.length;
              return {
                productId: draft.productId,
                linkedProductId: draft.linkedProductId,
                name: draft.name,
                shortDescription: draft.shortDescription,
                barcode: draft.barcode,
                category: draft.category,
                specs: draft.specs,
                quantityRange: draft.quantityRange,
                unitPrice: draft.unitPrice,
                totalPrice: draft.totalPrice,
                notes: draft.notes,
                origin: draft.origin,
                storageMethod: draft.storageMethod,
                sellerInfo: draft.sellerInfo,
                specialCompliance: draft.specialCompliance,
                returnWarranty: draft.returnWarranty,
                imageUrl: draft.imageUrl,
                imageUrls: draft.imageUrls,
                imageFileIndexes,
              };
            });
            const files = isProductCard
              ? finalDrafts.flatMap((draft) => draft.localFiles)
              : selectedFiles;
            const action: QuickAction = {
              type: "upload",
              label: isProductCard ? "送出商品清單" : `上傳${label}`,
              value: isProductCard ? `已送出 ${productPayload.length} 個商品資料。` : `我上傳${label}。`,
              action: "website_upload_files",
              sourceMessageId: message.id,
              assetKind,
              field,
              productData: isProductCard ? { products: productPayload } : undefined,
            };
            onUploadFiles?.(files, action, message);
            setSelectedFiles([]);
            setProduct(emptyProductForm);
            setProductDrafts([]);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-surface shadow-xs transition-[transform,background,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:bg-ink-700 hover:shadow-sm disabled:pointer-events-none disabled:opacity-40"
        >
          上傳並繼續
        </button>
      </div>
    </div>
  );
}

function artifactKindMeta(kind: GenerationArtifactSummary["kind"]) {
  if (kind === "web") return { icon: Globe2, label: "網站" };
  if (kind === "text") return { icon: FileText, label: "文字" };
  return { icon: ImageIcon, label: "圖像" };
}

function GenerationArtifactCard({
  summary,
  isRunning,
  onOpen,
}: {
  summary: GenerationArtifactSummary | null;
  isRunning: boolean;
  onOpen?: () => void;
}) {
  const kind = summary?.kind ?? "image";
  const { icon: KindIcon, label: kindLabel } = artifactKindMeta(kind);
  const status = summary?.status ?? (isRunning ? "processing" : "completed");
  const showSpinner = isRunning || status === "queued" || status === "processing" || status === "streaming";
  const title = summary?.title || (showSpinner ? "生成中" : "生成成果");
  const subtitle = summary?.subtitle || null;
  const thumb = summary?.thumbnailUrl || null;
  const versionLabel = summary?.versionLabel || null;
  const active = Boolean(summary?.isActive);

  const cardClass = [
    "group/artifact w-full max-w-[420px] overflow-hidden rounded-lg border bg-surface text-left shadow-xs transition-[transform,background,border,box-shadow] duration-120 ease-snap",
    active ? "border-brand-400 ring-1 ring-brand-200" : "border-line1",
    onOpen ? "cursor-pointer hover:-translate-y-px hover:border-line2 hover:bg-hover hover:shadow-sm" : "cursor-default",
  ].join(" ");

  const inner = (
    <div className="flex items-stretch gap-3 p-3">
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line1 bg-sunken">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={title} className="h-full w-full object-cover" />
        ) : (
          <KindIcon className="h-6 w-6 text-ink-400" />
        )}
        {showSpinner ? (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/70 backdrop-blur-[1px]">
            <Loader2 className="h-4 w-4 animate-spin text-ink-500" />
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
            <KindIcon className="h-3 w-3" />
            <span>{kindLabel}</span>
            {versionLabel ? (
              <span className="rounded-pill bg-sunken px-1.5 py-px text-[10px] font-medium text-ink-500">
                {versionLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-sm font-medium text-ink-900">{title}</div>
          {subtitle ? (
            <div className="mt-0.5 line-clamp-1 text-xs text-ink-500">{subtitle}</div>
          ) : null}
        </div>
        {onOpen ? (
          <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink-500 transition-colors group-hover/artifact:text-ink-900">
            <ArrowRight className="h-3 w-3" />
            <span>{showSpinner ? "在右側查看進度" : "打開內容面板"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!onOpen) {
    return <div className={cardClass}>{inner}</div>;
  }
  return (
    <button type="button" onClick={onOpen} className={cardClass} aria-label={`打開 ${title}`}>
      {inner}
    </button>
  );
}

export default function ConversationInterface({
  messages,
  onQuickAction,
  onFillInput,
  onUploadFiles,
  onOpenTextArtifact,
  onOpenGenerationResult,
  artifactSummaryForMessage,
  onEditMessage,
  onCancelMessage,
  onRegenerateMessage,
  versionInfoForMessage,
  onPreviousVersion,
  onNextVersion,
  showGeneratedImagesInline = true,
  scrollSignal = 0,
}: ConversationInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [completedStreamingIds, setCompletedStreamingIds] = useState<string[]>([]);
  const [locallyConsumedActionKeys, setLocallyConsumedActionKeys] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [savingEditMessageId, setSavingEditMessageId] = useState<string | null>(null);
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    scrollRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    window.requestAnimationFrame(() => scrollToBottom());
  }, [scrollSignal, scrollToBottom]);

  const startEditingMessage = useCallback((message: ChatMessage) => {
    setEditingMessageId(message.id);
    setEditingDraft(messageText(message));
  }, []);

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null);
    setEditingDraft("");
  }, []);

  const submitEditedMessage = useCallback(async (message: ChatMessage) => {
    const nextContent = editingDraft.trim();
    if (!nextContent) {
      cancelEditingMessage();
      return;
    }
    setSavingEditMessageId(message.id);
    try {
      const result = await onEditMessage?.(message, nextContent);
      if (result !== false) cancelEditingMessage();
    } finally {
      setSavingEditMessageId(null);
    }
  }, [cancelEditingMessage, editingDraft, onEditMessage]);

  const latestAssistantActionMessageId = [...messages]
    .reverse()
    .find((message) => {
      if (message.role !== "assistant") return false;
      if (message.isStreaming && !completedStreamingIds.includes(message.id)) return false;
      const actions = Array.isArray(message.quickActions)
        ? message.quickActions
        : Array.isArray(message.metadata?.quickActions)
          ? (message.metadata.quickActions as QuickAction[])
          : [];
      return actions.length > 0;
    })?.id;

  return (
    <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-8 overflow-auto px-5 pb-8 pt-7 text-ink-700">
      {messages.map((message, messageIndex) => {
        const isUser = message.role === "user";
        const intelligence = message.marketingIntelligence;
        const references = intelligence?.visualReferences || intelligence?.referenceCards || [];
        const sources = intelligence?.sources || [];
        const images = showGeneratedImagesInline && !isUser ? generatedImages(message) : [];
        const imageAttachments = messageImageAttachments(message);
        const metadataActions =
          Array.isArray(message.quickActions)
            ? message.quickActions
            : Array.isArray(message.metadata?.quickActions)
              ? (message.metadata.quickActions as QuickAction[])
              : [];
        const hasLaterUserMessage = messages.slice(messageIndex + 1).some((item) => item.role === "user");
        const actionTaskIds = metadataActions
          .map((action) => action.taskId)
          .filter((taskId): taskId is string => typeof taskId === "string" && taskId.length > 0);
        const hasLaterGenerationForAction =
          actionTaskIds.length > 0 &&
          messages.slice(messageIndex + 1).some((item) => {
            if (item.messageType !== "generation_result") return false;
            const metadataTaskId =
              item.metadata && typeof item.metadata === "object" && typeof item.metadata.taskId === "string"
                ? item.metadata.taskId
                : null;
            const taskId = item.designTaskId || metadataTaskId;
            return Boolean(taskId && actionTaskIds.includes(taskId));
          });
        const isGenerationResult = message.messageType === "generation_result";
        const status = metadataStatus(message.metadata);
        const isRunningAssistant =
          !isUser &&
          (Boolean(message.isStreaming && !completedStreamingIds.includes(message.id)) ||
            status === "queued" ||
            status === "processing" ||
            status === "streaming");
        const consumedActionSources = new Set(
          messages
            .filter((item) => item.role === "user")
            .map((item) => item.metadata?.quickReply)
            .filter((item): item is QuickAction => Boolean(item) && typeof item === "object")
            .map((item) => item.sourceMessageId)
            .filter((item): item is string => typeof item === "string"),
        );
        const visibleActions = isGenerationResult || consumedActionSources.has(message.id) || hasLaterUserMessage || hasLaterGenerationForAction
          ? []
          : message.id === latestAssistantActionMessageId
            ? metadataActions.filter((action, index) => !locallyConsumedActionKeys.includes(actionKey(message, action, index)))
            : [];
        const widget = !isUser && !isGenerationResult && message.id === latestAssistantActionMessageId ? websiteWidget(message) : null;
        const productOptions = !isUser && !isGenerationResult && message.id === latestAssistantActionMessageId ? websiteProductOptions(message) : [];
        const text = isGenerationResult && !showGeneratedImagesInline ? "" : messageText(message);
        const useCompactActions = isGenerationResult && !showGeneratedImagesInline;
        const versionInfo = !isRunningAssistant ? versionInfoForMessage?.(message) ?? null : null;
        const shouldUseTextArtifact =
          !isGenerationResult &&
          isLongTextArtifact(message, text) &&
          (!message.isStreaming || completedStreamingIds.includes(message.id));
        const hasRenderableContent =
          isUser ||
          isGenerationResult ||
          text.trim().length > 0 ||
          images.length > 0 ||
          imageAttachments.length > 0 ||
          references.length > 0 ||
          sources.length > 0 ||
          Boolean(widget) ||
          visibleActions.length > 0 ||
          Boolean(message.isStreaming && !completedStreamingIds.includes(message.id));
        if (!hasRenderableContent) return null;

        return (
          <div
            key={message.id}
            className={`group animate-message-in mx-auto flex w-full max-w-3xl ${isUser ? "justify-end" : "justify-start"}`}
            style={
              {
                "--message-x": isUser ? "14px" : "-10px",
                animationDelay: `${Math.min(messageIndex, 8) * 35}ms`,
              } as CSSProperties
            }
          >
            <div className={`flex max-w-[760px] flex-col ${isUser ? "items-end" : "items-start"}`}>
              {!isUser ? (
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400 transition-opacity duration-240 ease-out">
                  <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-brand-200 bg-brand-50 text-[11px] font-semibold text-brand-600 shadow-xs transition-[transform,box-shadow] duration-240 ease-smooth">
                    G
                  </span>
                  GTL
                </div>
              ) : null}

              <div className={isUser ? "rounded-lg bg-ink-900 px-5 py-3 text-sm leading-6 text-surface shadow-sm" : "px-1 text-sm leading-7 text-ink-700"}>
                {isUser && editingMessageId === message.id ? (
                  <div className="min-w-[280px] max-w-[560px] rounded-lg border border-line2 bg-surface p-2 text-ink-900 shadow-sm">
                    <textarea
                      value={editingDraft}
                      onChange={(event) => setEditingDraft(event.target.value)}
                      className="min-h-24 w-full resize-y rounded-md border border-line1 bg-sunken px-3 py-2 text-sm leading-6 text-ink-900 outline-none transition focus:border-line2 focus:bg-surface focus:shadow-focus"
                      autoFocus
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={savingEditMessageId === message.id}
                        onClick={cancelEditingMessage}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line1 bg-surface px-3 text-xs font-medium text-ink-500 transition hover:bg-hover disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        取消
                      </button>
                      <button
                        type="button"
                        disabled={savingEditMessageId === message.id || !editingDraft.trim()}
                        onClick={() => void submitEditedMessage(message)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink-900 px-3 text-xs font-medium text-surface transition hover:bg-ink-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        套用
                      </button>
                    </div>
                  </div>
                ) : shouldUseTextArtifact ? (
                  <div className={isUser ? "min-w-[240px] max-w-[420px]" : "w-full max-w-[520px]"}>
                    <div className={isUser ? "text-sm font-medium text-surface" : "text-sm font-medium text-ink-900"}>
                      {isUser ? "已附上長內容" : "已整理成文字成果"}
                    </div>
                    <div className={isUser ? "mt-1 line-clamp-2 text-xs leading-5 text-surface/70" : "mt-1 line-clamp-2 text-xs leading-5 text-ink-500"}>
                      {compactTextTitle(text)}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenTextArtifact?.(message)}
                      className={
                        isUser
                          ? "mt-3 inline-flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-xs font-medium text-ink-900 transition-[transform,background] duration-120 ease-snap hover:-translate-y-px hover:bg-sunken"
                          : "mt-3 inline-flex items-center gap-2 rounded-pill border border-line1 bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 shadow-xs transition-[transform,background,border] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover"
                      }
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      查看內容
                    </button>
                  </div>
                ) : isGenerationResult && !showGeneratedImagesInline ? (
                  <GenerationArtifactCard
                    summary={artifactSummaryForMessage?.(message) ?? null}
                    isRunning={isRunningAssistant}
                    onOpen={onOpenGenerationResult ? () => onOpenGenerationResult(message) : undefined}
                  />
                ) : isUser ? (
                  <div className="whitespace-pre-wrap">{messageText(message)}</div>
                ) : (
                  <TypewriterText
                  text={text}
                  enabled={!isUser && Boolean(message.isStreaming)}
                  progressMessage={message}
                  render={(visibleText) => <MarkdownText text={visibleText} />}
                  onDone={() => {
                    setCompletedStreamingIds((current) =>
                      current.includes(message.id) ? current : [...current, message.id],
                    );
                  }}
                  onProgress={() => scrollToBottom("auto")}
                  />
                )}
              </div>

              {isUser && editingMessageId !== message.id && onEditMessage ? (
                <div className="mt-2 flex w-full justify-end px-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => startEditingMessage(message)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-line1 bg-surface px-2.5 text-xs font-medium text-ink-500 shadow-xs transition hover:border-line2 hover:bg-hover hover:text-ink-900"
                    aria-label="編輯訊息"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    編輯
                  </button>
                </div>
              ) : null}

              {(versionInfo || (!isUser && isGenerationResult && (onCancelMessage || onRegenerateMessage))) ? (
                <div className="mt-2 flex items-center gap-2 px-1 text-xs text-ink-400">
                  {!isUser && isGenerationResult && isRunningAssistant && onCancelMessage ? (
                    <button
                      type="button"
                      onClick={() => onCancelMessage(message)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-line1 bg-surface px-2.5 font-medium text-ink-500 shadow-xs transition-[transform,background,border,color] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover hover:text-ink-900"
                      aria-label="停止回覆"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      停止
                    </button>
                  ) : null}
                  {!isUser && isGenerationResult && !isRunningAssistant && onRegenerateMessage ? (
                    <button
                      type="button"
                      onClick={() => onRegenerateMessage(message)}
                      className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-line1 bg-surface px-2.5 font-medium text-ink-500 shadow-xs transition-[transform,background,border,color] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover hover:text-ink-900"
                      aria-label="重生回覆"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      重生
                    </button>
                  ) : null}
                  {versionInfo ? (
                    <span className="inline-flex items-center gap-1 rounded-pill border border-line1 bg-surface p-0.5 shadow-xs">
                      <button
                        type="button"
                        disabled={!versionInfo.canPrevious}
                        onClick={() => onPreviousVersion?.(message)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition hover:bg-hover hover:text-ink-900 disabled:pointer-events-none disabled:opacity-30"
                        aria-label="上一版"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="px-1 text-[11px] font-medium text-ink-500">{versionInfo.label}</span>
                      <button
                        type="button"
                        disabled={!versionInfo.canNext}
                        onClick={() => onNextVersion?.(message)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 transition hover:bg-hover hover:text-ink-900 disabled:pointer-events-none disabled:opacity-30"
                        aria-label="下一版"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : null}
                </div>
              ) : null}

              {imageAttachments.length > 0 ? (
                <div className={`mt-3 grid gap-2 ${imageAttachments.length > 1 ? "grid-cols-2" : "grid-cols-1"} max-w-[420px]`}>
                  {imageAttachments.slice(0, 4).map((attachment, index) => (
                    <a
                      key={`${attachment.url}-${index}`}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                    className="group animate-chip-in overflow-hidden rounded-lg border border-line1 bg-surface shadow-sm transition-[transform,box-shadow,border] duration-240 ease-smooth hover:-translate-y-px hover:border-line2 hover:shadow-md"
                    style={{ animationDelay: `${index * 45}ms` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={attachment.url} alt={attachment.originalName || `附件 ${index + 1}`} className="animate-reveal-image aspect-square w-full object-cover transition-transform duration-240 ease-out group-hover:scale-[1.02]" />
                    </a>
                  ))}
                </div>
              ) : null}

              {!isUser && images.length > 0 ? (
                <div className="mt-4 grid w-full gap-3 sm:grid-cols-2">
                  {images.map((image, index) => (
                    <a
                      key={`${image.url}-${index}`}
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group animate-chip-in overflow-hidden rounded-lg border border-line1 bg-surface shadow-sm transition-[transform,box-shadow,border] duration-240 ease-smooth hover:-translate-y-px hover:border-line2 hover:shadow-md"
                      style={{ animationDelay: `${index * 45}ms` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={`生成圖 ${index + 1}`} className="animate-reveal-image aspect-square w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-ink-500">
                        <span>第一版圖像 {index + 1}</span>
                        <span>{image.model || "banana-image"}</span>
                      </div>
                    </a>
                  ))}
                </div>
              ) : null}

              {!isUser && references.length > 0 ? (
                <div className="mt-3 grid w-full gap-2 sm:grid-cols-2">
                    {references.slice(0, 4).map((reference, index) => (
                    <a
                      key={reference.url}
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer"
                      className="animate-chip-in overflow-hidden rounded-lg border border-line1 bg-surface text-left text-xs shadow-xs transition-[transform,box-shadow,border] duration-240 ease-smooth hover:-translate-y-px hover:border-line2 hover:shadow-md"
                      style={{ animationDelay: `${index * 45}ms` }}
                    >
                      {reference.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={reference.thumbnailUrl} alt={reference.title} className="h-28 w-full object-cover" />
                      ) : (
                        <div className="flex h-28 items-center justify-center bg-sunken text-ink-400">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                      <div className="p-3">
                        <div className="line-clamp-2 font-medium text-ink-900">{reference.title}</div>
                        <div className="mt-1 text-ink-500">{reference.source}</div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : null}

              {!isUser && sources.length > 0 ? (
                <div className="mt-4 w-full rounded-lg border border-line1 bg-surface p-3 shadow-sm">
                  <div className="mb-2 text-xs font-medium text-ink-500">搜尋來源</div>
                  <div className="space-y-1.5">
                    {sources.slice(0, 5).map((source, index) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink-500 transition hover:bg-hover hover:text-ink-900"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">[{index + 1}] {source.title || source.url}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              {!isUser &&
              widget &&
              (!message.isStreaming || completedStreamingIds.includes(message.id)) ? (
                <WebsiteUploadWidget
                  message={message}
                  widget={widget}
                  productOptions={productOptions}
                  disabled={locallyConsumedActionKeys.some((key) => key.startsWith(`${message.id}:website_upload_files`))}
                  onUploadFiles={(files, action, sourceMessage) => {
                    const key = actionKey(sourceMessage, action, 0);
                    setLocallyConsumedActionKeys((current) => current.includes(key) ? current : [...current, key]);
                    onUploadFiles?.(files, action, sourceMessage);
                  }}
                />
              ) : null}

              {!isUser &&
              visibleActions.length > 0 &&
              (!message.isStreaming || completedStreamingIds.includes(message.id)) ? (
                <div className={useCompactActions ? "mt-3 flex max-w-[720px] flex-wrap gap-2" : "mt-4 w-full max-w-[720px]"}>
                  {!useCompactActions ? <div className="mb-2 text-xs font-semibold text-ink-500">下一步可以這樣回覆</div> : null}
                  <div className={useCompactActions ? "contents" : "overflow-hidden rounded-lg border border-line1 bg-surface shadow-sm backdrop-blur"}>
                    {visibleActions.map((action, index) => (
                      <button
                        key={actionKey(message, action, index)}
                        type="button"
                        onClick={() => {
                          const key = actionKey(message, action, index);
                          setLocallyConsumedActionKeys((current) => current.includes(key) ? current : [...current, key]);
                          const draft = fillValue(action);
                          if (draft && onFillInput) {
                            onFillInput(draft, { ...action, sourceMessageId: message.id }, message);
                            return;
                          }
                          onQuickAction?.({ ...action, sourceMessageId: message.id }, message);
                        }}
                        className={
                          useCompactActions
                            ? "group animate-chip-in inline-flex items-center gap-2 rounded-pill border border-line1 bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 shadow-xs transition-[transform,background,border,box-shadow] duration-120 ease-snap hover:-translate-y-px hover:border-line2 hover:bg-hover hover:text-ink-900"
                            : "group animate-chip-in flex w-full items-center gap-3 border-b border-line1 px-3 py-3 text-left text-sm text-ink-700 transition-[transform,background,color] duration-120 ease-smooth last:border-b-0 hover:translate-x-0.5 hover:bg-hover hover:text-ink-900"
                        }
                        style={{ animationDelay: `${index * 55}ms` }}
                      >
                        <ArrowRight className={useCompactActions ? "h-3.5 w-3.5 text-accent-500 transition-transform duration-120 ease-snap group-hover:translate-x-0.5" : "h-4 w-4 text-accent-500 transition-transform duration-120 ease-snap group-hover:translate-x-0.5"} />
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div ref={scrollRef} />
    </div>
  );
}
