import type { DesignTask } from "@prisma/client";
import { resolvePurposeModelConfig, type ResolvedAiModel } from "@/lib/ai-model-settings";

export type MarketingIntelligenceSource = {
  title: string;
  url: string;
  publisher?: string | null;
  publishedAt?: string | null;
  snippet?: string | null;
};

export type MarketingVisualReference = {
  title: string;
  url: string;
  source: string;
  thumbnailUrl?: string | null;
  reason?: string | null;
  styleTags: string[];
  usage: "inspiration_only";
};

export type MarketingIntelligencePack = {
  provider: "openrouter";
  model: string;
  searchModel: string;
  searchDepth: "quick" | "standard" | "deep";
  freshness: "recent" | "realtime" | "evergreen";
  query: string;
  summary: string;
  insights: string[];
  sources: MarketingIntelligenceSource[];
  visualReferences: MarketingVisualReference[];
  assumptions: string[];
  createdAt: string;
  groundedMode: boolean;
  wantsVisualReferences: boolean;
  visualReferenceIntent?: string | null;
  subQueries: string[];
};

type SearchClassification = {
  category: "strategy" | "trend" | "competitive" | "factual" | "creative" | "meta";
  shouldSearch: boolean;
  wantsVisualReferences: boolean;
  visualReferenceIntent: string | null;
  reason: string;
  primaryQuery: string | null;
  subQueries: string[];
  freshness: "recent" | "realtime" | "evergreen";
  searchDepth: "quick" | "standard" | "deep";
  explicitSkipReason: string | null;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string; images?: unknown[] } }>;
  citations?: string[];
  images?: unknown[];
};

type ResponseImageCandidate = {
  imageUrl: string;
  originUrl: string;
  width: number;
  height: number;
};

const SEARCH_REQUIRED = new Set(["strategy", "trend", "competitive", "factual"]);
const VISUAL_REFERENCE_LIMIT = 6;

function taipeiDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

function safeJson(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  const withoutFence =
    trimmed.startsWith("```json")
      ? trimmed.slice("```json".length).trim()
      : trimmed.startsWith("```")
        ? trimmed.slice("```".length).trim()
        : trimmed;
  const unfenced = withoutFence.endsWith("```")
    ? withoutFence.slice(0, withoutFence.length - "```".length).trim()
    : withoutFence;
  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  const objectSlice =
    firstBrace >= 0 && lastBrace > firstBrace ? value.slice(firstBrace, lastBrace + 1) : "";
  const candidates = [
    value,
    unfenced,
    objectSlice,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function stringArray(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, limit)
    : [];
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function hostname(url: string) {
  try {
    const host = new URL(url).hostname;
    return host.toLowerCase().startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "Web";
  }
}

function normalizeSources(value: unknown): MarketingIntelligenceSource[] {
  if (!Array.isArray(value)) return [];
  const output: MarketingIntelligenceSource[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!isHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    output.push({
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : url,
      url,
      publisher: typeof record.publisher === "string" && record.publisher.trim() ? record.publisher.trim() : null,
      publishedAt: typeof record.publishedAt === "string" && record.publishedAt.trim() ? record.publishedAt.trim() : null,
      snippet: typeof record.snippet === "string" && record.snippet.trim() ? record.snippet.trim() : null,
    });
    if (output.length >= 8) break;
  }
  return output;
}

function normalizeVisualReferences(value: unknown): MarketingVisualReference[] {
  if (!Array.isArray(value)) return [];
  const output: MarketingVisualReference[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!isHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    output.push({
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : url,
      url,
      source: typeof record.source === "string" && record.source.trim() ? record.source.trim() : hostname(url),
      thumbnailUrl:
        typeof record.thumbnailUrl === "string" && isHttpUrl(record.thumbnailUrl)
          ? record.thumbnailUrl.trim()
          : null,
      reason: typeof record.reason === "string" && record.reason.trim() ? record.reason.trim() : null,
      styleTags: stringArray(record.styleTags, 5),
      usage: "inspiration_only",
    });
    if (output.length >= VISUAL_REFERENCE_LIMIT) break;
  }
  return output;
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function hostMatches(sourceUrl: string, candidateOriginUrl: string) {
  const sourceHost = hostname(sourceUrl);
  const candidateHost = hostname(candidateOriginUrl);
  return candidateHost === sourceHost || candidateHost.endsWith(`.${sourceHost}`);
}

function responseImageCandidates(response: ChatCompletionResponse): ResponseImageCandidate[] {
  const images = [
    ...(Array.isArray(response.images) ? response.images : []),
    ...(Array.isArray(response.choices?.[0]?.message?.images) ? response.choices?.[0]?.message?.images ?? [] : []),
  ];
  const output: ResponseImageCandidate[] = [];
  const seen = new Set<string>();
  for (const item of images) {
    const record = typeof item === "object" && item ? (item as Record<string, unknown>) : {};
    const imageUrl =
      typeof item === "string"
        ? item
        : getString(record, ["imageUrl", "image_url", "url", "thumbnailUrl", "thumbnail_url"]);
    if (!isHttpUrl(imageUrl) || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    const originUrl = getString(record, ["originUrl", "origin_url", "sourceUrl", "source_url"]) || imageUrl;
    output.push({
      imageUrl,
      originUrl: isHttpUrl(originUrl) ? originUrl : imageUrl,
      width: getNumber(record, ["width"]),
      height: getNumber(record, ["height"]),
    });
  }
  return output;
}

// Pure in-memory enrichment. The previous version fetched each source URL,
// parsed HTML for og:image, then did HEAD/GET to verify each thumbnail —
// 10-30s of latency that blocked the main reply. We now trust whatever the
// search model returns plus the image candidates it emits inline, dedupe,
// and ship. Visual reference cards that lack a thumbnail just render
// text-only — better than waiting 20s for an og:image.
function absolutizeUrl(baseUrl: string, candidate: string) {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return "";
  }
}

function readHtmlAttr(tag: string, attrName: string) {
  const lower = tag.toLowerCase();
  const needle = attrName.toLowerCase();
  const start = lower.indexOf(needle);
  if (start < 0) return "";
  const eq = lower.indexOf("=", start + needle.length);
  if (eq < 0) return "";
  let cursor = eq + 1;
  while (cursor < tag.length && tag[cursor] === " ") cursor += 1;
  const quote = tag[cursor];
  if (quote !== '"' && quote !== "'") return "";
  const end = tag.indexOf(quote, cursor + 1);
  return end > cursor ? tag.slice(cursor + 1, end).trim() : "";
}

function metaImageFromHtml(html: string, sourceUrl: string) {
  const candidates = ["og:image", "twitter:image", "twitter:image:src"];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.toLowerCase().indexOf("<meta", cursor);
    if (start < 0) break;
    const end = html.indexOf(">", start);
    if (end < 0) break;
    const tag = html.slice(start, end + 1);
    const property = readHtmlAttr(tag, "property") || readHtmlAttr(tag, "name");
    const content = readHtmlAttr(tag, "content");
    if (content && candidates.includes(property.toLowerCase())) {
      const absolute = absolutizeUrl(sourceUrl, content);
      if (isHttpUrl(absolute)) return absolute;
    }
    cursor = end + 1;
  }
  return "";
}

async function fetchPagePreviewImage(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 GTLBot/1.0" },
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) return "";
    const html = (await response.text()).slice(0, 90000);
    return metaImageFromHtml(html, sourceUrl);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function fillMissingPreviewImages(references: MarketingVisualReference[]) {
  const targets = references
    .map((reference, index) => ({ reference, index }))
    .filter(({ reference }) => !reference.thumbnailUrl)
    .slice(0, 4);
  if (targets.length === 0) return references;
  const images = await Promise.all(targets.map(({ reference }) => fetchPagePreviewImage(reference.url)));
  const next = references.slice();
  targets.forEach(({ index }, targetIndex) => {
    const thumbnailUrl = images[targetIndex];
    if (!thumbnailUrl) return;
    next[index] = { ...next[index], thumbnailUrl };
  });
  return next;
}

async function enrichVisualReferences(params: {
  sources: MarketingIntelligenceSource[];
  visualReferences: MarketingVisualReference[];
  imageCandidates: ResponseImageCandidate[];
}): Promise<MarketingVisualReference[]> {
  const output: MarketingVisualReference[] = [];
  const seenUrls = new Set<string>();
  const seenImages = new Set<string>();

  const addReference = (reference: MarketingVisualReference) => {
    const imageKey = reference.thumbnailUrl || "";
    if (seenUrls.has(reference.url) || (imageKey && seenImages.has(imageKey))) return;
    seenUrls.add(reference.url);
    if (imageKey) seenImages.add(imageKey);
    output.push(reference);
  };

  // First: pair each source with the best matching inline image candidate.
  for (const source of params.sources.slice(0, VISUAL_REFERENCE_LIMIT)) {
    const candidate = params.imageCandidates
      .filter((image) => hostMatches(source.url, image.originUrl))
      .filter((image) => image.width === 0 || image.width >= 600)
      .sort((a, b) => b.width - a.width)[0];
    if (!candidate) continue;
    addReference({
      title: source.title || source.url,
      url: source.url,
      source: source.publisher || hostname(source.url),
      thumbnailUrl: candidate.imageUrl,
      reason: source.snippet || null,
      styleTags: [],
      usage: "inspiration_only",
    });
  }

  // Next: LLM-returned visual references (we trust their thumbnailUrl as-is).
  for (const reference of params.visualReferences) {
    addReference(reference);
    if (output.length >= VISUAL_REFERENCE_LIMIT) break;
  }

  // Finally: any leftover image candidates as standalone references.
  for (const candidate of params.imageCandidates) {
    addReference({
      title: candidate.originUrl,
      url: candidate.originUrl,
      source: hostname(candidate.originUrl),
      thumbnailUrl: candidate.imageUrl,
      reason: null,
      styleTags: [],
      usage: "inspiration_only",
    });
    if (output.length >= VISUAL_REFERENCE_LIMIT) break;
  }

  return fillMissingPreviewImages(output.slice(0, VISUAL_REFERENCE_LIMIT));
}

async function openRouterChat(params: {
  model: string;
  providerConfig: ResolvedAiModel["providerConfig"];
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  extra?: Record<string, unknown>;
}): Promise<ChatCompletionResponse> {
  const key = params.providerConfig?.apiKey;
  const baseUrl = params.providerConfig?.baseUrl;
  if (!key || !baseUrl) throw new Error("Marketing model provider is not configured");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (baseUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = appUrl();
    headers["X-Title"] = process.env.FLEXION_APP_TITLE || "Marketing AI Platform";
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0,
      max_tokens: params.maxTokens,
      ...params.extra,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter search error: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ChatCompletionResponse;
}

function parsedClassification(parsed: Record<string, unknown> | null): SearchClassification | null {
  if (!parsed) return null;
  const category = ["strategy", "trend", "competitive", "factual", "creative", "meta"].includes(
    String(parsed.category),
  )
    ? (parsed.category as SearchClassification["category"])
    : "creative";
  const explicitSkipReason =
    typeof parsed.explicitSkipReason === "string" && parsed.explicitSkipReason.trim()
      ? parsed.explicitSkipReason.trim()
      : null;
  const wantsVisualReferences = parsed.wantsVisualReferences === true;
  const categoryRequiresSearch = SEARCH_REQUIRED.has(category);
  const shouldSearch = wantsVisualReferences
    ? !explicitSkipReason
    : categoryRequiresSearch
      ? !explicitSkipReason
      : parsed.shouldSearch === true;
  const primaryQuery =
    typeof parsed.primaryQuery === "string" && parsed.primaryQuery.trim()
      ? parsed.primaryQuery.trim()
      : stringArray(parsed.subQueries, 1)[0] ?? null;

  return {
    category,
    shouldSearch,
    wantsVisualReferences,
    visualReferenceIntent:
      typeof parsed.visualReferenceIntent === "string" && parsed.visualReferenceIntent.trim()
        ? parsed.visualReferenceIntent.trim()
        : null,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
    primaryQuery: shouldSearch ? primaryQuery : null,
    subQueries: shouldSearch ? stringArray(parsed.subQueries, 10) : [],
    freshness: ["recent", "realtime", "evergreen"].includes(String(parsed.freshness))
      ? (parsed.freshness as SearchClassification["freshness"])
      : "evergreen",
    searchDepth: ["quick", "standard", "deep"].includes(String(parsed.searchDepth))
      ? (parsed.searchDepth as SearchClassification["searchDepth"])
      : categoryRequiresSearch || wantsVisualReferences
        ? "standard"
        : "quick",
    explicitSkipReason,
  };
}

export class MarketingIntelligenceService {
  private static instance: MarketingIntelligenceService;

  static getInstance() {
    if (!MarketingIntelligenceService.instance) {
      MarketingIntelligenceService.instance = new MarketingIntelligenceService();
    }
    return MarketingIntelligenceService.instance;
  }

  isAvailable() {
    return process.env.MARKETING_INTELLIGENCE_ENABLED !== "false";
  }

  async maybeResearch(params: {
    userMessage: string;
    task: DesignTask | null;
    recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
    forceSearch?: boolean;
    forceVisualReferences?: boolean;
    onProgress?: (step: { label: string; detail?: string }) => void | Promise<void>;
  }): Promise<MarketingIntelligencePack | null> {
    if (!this.isAvailable()) return null;

    await params.onProgress?.({ label: "判斷是否需要搜尋", detail: "正在判斷這輪是否需要外部資料補強" });
    const routerModel = await resolvePurposeModelConfig("marketing_router");
    const searchModel = await resolvePurposeModelConfig("marketing_search");
    const deepSearchModel = await resolvePurposeModelConfig("marketing_deep");
    // No usable search model means research can never complete, so skip the
    // router classification LLM call entirely rather than classifying first and
    // discarding the result at the post-classification search-model check.
    if (!searchModel && !deepSearchModel) return null;
    if (!params.forceSearch && !routerModel) return null;

    if (!params.forceSearch) {
      await params.onProgress?.({ label: "分析問題類型", detail: "正在判斷是一般對話、建議，還是需要查案例與來源" });
    }
    const classification = params.forceSearch
      ? this.forcedRecommendationClassification(params)
      : routerModel
        ? await this.classify(params, routerModel)
        : null;
    if (!classification?.shouldSearch || !classification.primaryQuery) return null;

    const queries = [classification.primaryQuery, ...classification.subQueries]
      .filter((query) => query.trim())
      .slice(0, classification.searchDepth === "deep" ? 10 : classification.searchDepth === "quick" ? 2 : 6);
    if (queries.length === 0) return null;

    const selectedSearchModel = classification.searchDepth === "deep" ? (deepSearchModel ?? searchModel) : searchModel;
    if (!selectedSearchModel) return null;
    await params.onProgress?.({
      label: "查找市場資料",
      detail: `正在查找 ${queries.length} 組參考資料，優先整理可引用來源`,
    });
    const research = await this.research({
      classification,
      model: selectedSearchModel,
      query: queries.join("\n"),
      task: params.task,
    });
    await params.onProgress?.({ label: "整理搜尋結果", detail: "正在把來源、洞察與參考卡片整理進回覆上下文" });

    return {
      provider: "openrouter",
      model: routerModel?.model ?? "forced",
      searchModel: selectedSearchModel.model,
      searchDepth: classification.searchDepth,
      freshness: classification.freshness,
      query: classification.primaryQuery,
      summary: research.summary,
      insights: research.insights,
      sources: research.sources,
      visualReferences: research.visualReferences,
      assumptions: research.assumptions,
      createdAt: new Date().toISOString(),
      groundedMode: research.sources.length > 0,
      wantsVisualReferences: classification.wantsVisualReferences,
      visualReferenceIntent: classification.visualReferenceIntent,
      subQueries: queries,
    };
  }

  buildPromptContext(pack: MarketingIntelligencePack | null) {
    if (!pack) return "";
    const lines = [
      "- 下面 sources 是這輪可用的外部依據。",
      "- 涉及趨勢、平台規格、競品狀態、市場觀察時，請在句尾標 [N] 引用來源編號。",
      "- 沒有來源支持的地方，請明說是你的設計/行銷假設。",
      `搜尋問題：${pack.query}`,
      `搜尋摘要：${pack.summary}`,
    ];
    if (pack.insights.length > 0) {
      lines.push("洞察：", ...pack.insights.slice(0, 8).map((insight) => `- ${insight}`));
    }
    if (pack.sources.length > 0) {
      lines.push("sources：");
      pack.sources.slice(0, 8).forEach((source, index) => {
        const meta = [source.publisher, source.publishedAt].filter(Boolean).join(" / ");
        lines.push(
          `[${index + 1}] ${source.title}${meta ? `（${meta}）` : ""}: ${source.url}${
            source.snippet ? ` — ${source.snippet.slice(0, 180)}` : ""
          }`,
        );
      });
    }
    if (pack.visualReferences.length > 0) {
      lines.push("靈感參考卡片：");
      pack.visualReferences.slice(0, 6).forEach((reference, index) => {
        const tags = reference.styleTags.length ? `；tags=${reference.styleTags.join(", ")}` : "";
        lines.push(`[R${index + 1}] ${reference.title}（${reference.source}）: ${reference.url}${tags}`);
      });
    }
    return lines.join("\n");
  }

  private forcedRecommendationClassification(params: {
    userMessage: string;
    task: DesignTask | null;
    forceVisualReferences?: boolean;
  }): SearchClassification {
    const taskLabel = [params.task?.title, params.task?.task_type].filter(Boolean).join(" ");
    const userMessage = params.userMessage.trim();
    const primaryQuery = [
      taskLabel || "品牌設計 行銷",
      userMessage || "設計方向建議",
      "案例 參考 靈感 趨勢",
    ].join(" ");
    return {
      category: "creative",
      shouldSearch: true,
      wantsVisualReferences: params.forceVisualReferences !== false,
      visualReferenceIntent: "style_examples",
      reason: "使用者要求 AI 協助建議或表示不確定，需要先補足案例、視覺參考與可執行方向。",
      primaryQuery,
      subQueries: [
        `${taskLabel || "品牌設計"} 視覺風格 參考案例`,
        `${taskLabel || "行銷設計"} landing page logo campaign inspiration`,
      ],
      freshness: "evergreen",
      searchDepth: "standard",
      explicitSkipReason: null,
    };
  }

  private async classify(params: {
    userMessage: string;
    task: DesignTask | null;
    recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
  }, routerModel: ResolvedAiModel) {
    const response = await openRouterChat({
      model: routerModel.model,
      providerConfig: routerModel.providerConfig,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            `今天是 ${taipeiDate()}（Asia/Taipei）。`,
            "You are a search planner for a senior design and marketing consultant.",
            "Classify the latest user turn and decide whether outside web search materially improves the answer.",
            "Search when the user asks for current trends, platform facts, competitor/market cases, benchmarks, examples, inspiration, reference images, or visual examples.",
            "Do not search for ordinary task openings, direct generation, small corrections, data updates, or normal requirement Q&A.",
            "If the user wants external visual material to look at, set wantsVisualReferences=true and shouldSearch=true.",
            "If ambiguous, lean no-search.",
            "Return strict JSON only:",
            '{"category":"strategy|trend|competitive|factual|creative|meta","shouldSearch":boolean,"wantsVisualReferences":boolean,"visualReferenceIntent":"none|external_visual_examples|moodboard|competitive_cases|style_examples|conceptual_advice","reason":string,"primaryQuery":string|null,"subQueries":string[],"freshness":"recent|realtime|evergreen","searchDepth":"quick|standard|deep","explicitSkipReason":string|null}',
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            userMessage: params.userMessage,
            activeTask: params.task
              ? {
                  taskType: params.task.task_type,
                  title: params.task.title,
                  collectedData: params.task.collected_data,
                }
              : null,
            recentTurns: params.recentTurns.slice(-6),
          }),
        },
      ],
    });
    return parsedClassification(safeJson(response.choices?.[0]?.message?.content || ""));
  }

  private async research(params: {
    classification: SearchClassification;
    model: ResolvedAiModel;
    query: string;
    task: DesignTask | null;
  }) {
    const response = await openRouterChat({
      model: params.model.model,
      providerConfig: params.model.providerConfig,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            `今天是 ${taipeiDate()}（Asia/Taipei）。`,
            "你是設計與行銷研究員，請用搜尋結果補強設計對話。",
            "不要寫長報告；輸出能讓設計助理自然引用的重點。",
            "若使用者要參考資料、案例、靈感圖、風格範例，請整理 visualReferences。",
            "visualReferences 是前端顯示的靈感參考卡片，不是授權素材。優先具體內容頁，不要只回平台首頁。",
            "不要編造圖片網址；thumbnailUrl 只有搜尋結果明確可得時才填，否則填 null。",
            "回覆嚴格 JSON：{summary, insights[], sources[], visualReferences[], assumptions[]}。",
            "sources 每筆含 title,url,publisher,publishedAt,snippet。",
            "visualReferences 每筆含 title,url,source,thumbnailUrl,reason,styleTags,usage。usage 固定 inspiration_only。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            query: params.query,
            category: params.classification.category,
            wantsVisualReferences: params.classification.wantsVisualReferences,
            taskType: params.task?.task_type ?? null,
            taskTitle: params.task?.title ?? null,
          }),
        },
      ],
      extra: {
        return_images: params.classification.wantsVisualReferences,
        image_domain_filter: [
          "-gettyimages.com",
          "-shutterstock.com",
          "-istockphoto.com",
          "-alamy.com",
          "-dreamstime.com",
          "-depositphotos.com",
          "-freepik.com",
        ],
        image_format_filter: ["jpeg", "jpg", "png", "webp"],
      },
    });

    const raw = response.choices?.[0]?.message?.content || "";
    const parsed = safeJson(raw);
    const citationSources = Array.isArray(response.citations)
      ? response.citations
          .filter(isHttpUrl)
          .map((url) => ({ title: url, url, publisher: hostname(url), publishedAt: null, snippet: null }))
      : [];
    const sources = normalizeSources(parsed?.sources).concat(citationSources).slice(0, 8);
    const visualReferences = normalizeVisualReferences(parsed?.visualReferences);
    const imageCandidates = responseImageCandidates(response);
    const enrichedVisualReferences = await enrichVisualReferences({
      sources,
      visualReferences,
      imageCandidates,
    });

    return {
      summary:
        typeof parsed?.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : raw.trim().slice(0, 800) || "搜尋未回傳可用摘要。",
      insights: stringArray(parsed?.insights, 8),
      sources,
      visualReferences: enrichedVisualReferences,
      assumptions: stringArray(parsed?.assumptions, 5),
    };
  }
}

export const marketingIntelligence = MarketingIntelligenceService.getInstance();
