// Flexion Token API client
// See docs/02_spec_chat.md §5

export type FlexionMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | unknown;
  tool_call_id?: string;
};

export type FlexionTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type FlexionRequest = {
  model: string;
  messages: FlexionMessage[];
  tools?: FlexionTool[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  response_format?: Record<string, unknown>;
};

export type FlexionUsage = {
  input_tokens: number;
  output_tokens: number;
};

const MODEL_MULTIPLIER: Record<string, number> = {
  "claude-haiku-4-5": 1,
  "claude-sonnet-4-6": 5,
  "claude-opus-4-7": 25,
  "gemini-3.1-pro-preview": 5,
  "gpt-5.4": 10,
  "kimi-k2-turbo-preview": 2,
  "kimi-k2.5": 5,
  "kimi-k2.6": 5,
  "kimi-k2-thinking": 10,
  "openai/gpt-4o-mini": 2,
  "openai/gpt-4.1-mini": 2,
  "anthropic/claude-3.5-haiku": 2,
  "anthropic/claude-sonnet-4.5": 5,
  "google/gemini-2.5-flash": 2,
  "google/gemini-2.5-pro": 5,
};

export function rawToCredits(model: string, usage: FlexionUsage): bigint {
  const mult = MODEL_MULTIPLIER[model] ?? 5;
  return BigInt((usage.input_tokens + usage.output_tokens) * mult);
}

export function pickModel(opts: {
  plan: string;
  taskHint?: "fast" | "normal" | "complex";
}): string {
  if (MODEL_OVERRIDE) return MODEL_OVERRIDE;

  const isMoonshot = BASE_URL.includes("api.moonshot.ai") || BASE_URL.includes("api.moonshot.cn");
  const isOpenRouter = BASE_URL.includes("openrouter.ai");
  const { plan, taskHint = "normal" } = opts;
  if (isOpenRouter) {
    if (taskHint === "complex") return process.env.OPENROUTER_COMPLEX_MODEL?.trim() || "anthropic/claude-sonnet-4.5";
    if (taskHint === "fast") return process.env.OPENROUTER_FAST_MODEL?.trim() || "openai/gpt-4o-mini";
    return process.env.CONVERSATION_AI_MODEL?.trim() || "openai/gpt-4o-mini";
  }
  if (isMoonshot) {
    if (plan === "free" || plan === "starter") {
      return taskHint === "fast" ? "kimi-k2-turbo-preview" : "kimi-k2.5";
    }
    if (taskHint === "complex") return "kimi-k2-thinking";
    if (taskHint === "fast") return "kimi-k2-turbo-preview";
    return "kimi-k2.5";
  }
  if (plan === "free" || plan === "starter") {
    return taskHint === "fast" ? "gemini-3.1-pro-preview" : "gpt-5.4";
  }
  if (taskHint === "complex") return "claude-opus-4-7";
  if (taskHint === "fast") return "gemini-3.1-pro-preview";
  return "gpt-5.4";
}

const BASE_URL =
  process.env.FLEXION_API_BASE_URL || "";
const API_KEY = process.env.FLEXION_API_KEY || "";
const MODEL_OVERRIDE = process.env.FLEXION_MODEL?.trim() ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
const PROVIDER_TITLE = process.env.FLEXION_APP_TITLE || "Marketing AI Platform";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_API_BASE_URL ?? "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION ?? "2023-06-01";

type StreamEvent =
  | { type: "token"; delta: string }
  | { type: "done"; usage: FlexionUsage; model: string };

function providerHeaders() {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
    "X-Tenant-Id": "marketing-ai-platform",
  };

  if (BASE_URL.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = APP_URL;
    headers["X-Title"] = PROVIDER_TITLE;
  }

  return headers;
}

function missingProviderError() {
  return new Error(
    "LLM provider is not configured. Set FLEXION_API_BASE_URL and FLEXION_API_KEY, or set ANTHROPIC_API_KEY.",
  );
}

function extractAnthropicSystem(messages: FlexionMessage[]) {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => stringifyContent(message.content))
    .join("\n\n");
}

function stringifyContent(content: string | unknown) {
  if (typeof content === "string") return content;
  if (
    content &&
    typeof content === "object" &&
    "text" in (content as Record<string, unknown>) &&
    typeof (content as { text?: unknown }).text === "string"
  ) {
    return (content as { text: string }).text;
  }
  return JSON.stringify(content);
}

function toAnthropicMessages(messages: FlexionMessage[]) {
  return messages
    .filter((message) => message.role !== "system" && message.role !== "tool")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text: stringifyContent(message.content) }],
    }));
}

async function* anthropicStream(req: FlexionRequest): AsyncGenerator<StreamEvent> {
  const system = extractAnthropicSystem(req.messages);
  const messages = toAnthropicMessages(req.messages);
  const res = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: req.model,
      system: system || undefined,
      messages,
      max_tokens: req.max_tokens ?? 1024,
      temperature: req.temperature,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const usage: FlexionUsage = { input_tokens: 0, output_tokens: 0 };
  let model = req.model;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      try {
        const json = JSON.parse(payload);
        if (json.type === "message_start") {
          usage.input_tokens = json.message?.usage?.input_tokens ?? usage.input_tokens;
          usage.output_tokens = json.message?.usage?.output_tokens ?? usage.output_tokens;
          model = json.message?.model ?? model;
        } else if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
          yield { type: "token", delta: json.delta.text };
        } else if (json.type === "message_delta") {
          usage.output_tokens = json.usage?.output_tokens ?? usage.output_tokens;
        } else if (json.type === "message_stop") {
          yield { type: "done", usage, model };
          return;
        }
      } catch {
        // ignore malformed SSE payloads
      }
    }
  }

  yield { type: "done", usage, model };
}

export async function* flexionStream(req: FlexionRequest) {
  if (ANTHROPIC_API_KEY) {
    yield* anthropicStream(req);
    return;
  }

  if (!BASE_URL || !API_KEY) throw missingProviderError();

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: providerHeaders(),
    body: JSON.stringify({
      ...req,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Flexion error: ${res.status} ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield { type: "token" as const, delta };
        if (json.usage) {
          yield {
            type: "done" as const,
            usage: {
              input_tokens: json.usage.input_tokens ?? json.usage.prompt_tokens ?? 0,
              output_tokens: json.usage.output_tokens ?? json.usage.completion_tokens ?? 0,
            },
            model: json.model ?? req.model,
          };
        }
      } catch {
        // ignore
      }
    }
  }
}

export type FlexionCompleteResult = {
  text: string;
  usage: FlexionUsage;
  model: string;
};

type AnthropicTextBlock = {
  type: string;
  text?: string;
};

async function anthropicComplete(req: FlexionRequest): Promise<FlexionCompleteResult> {
  const system = extractAnthropicSystem(req.messages);
  const messages = toAnthropicMessages(req.messages);
  const res = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: req.model,
      system: system || undefined,
      messages,
      max_tokens: req.max_tokens ?? 1024,
      temperature: req.temperature,
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const text = (json.content ?? [])
    .filter((block: AnthropicTextBlock) => block.type === "text")
    .map((block: AnthropicTextBlock) => block.text ?? "")
    .join("");

  return {
    text,
    usage: {
      input_tokens: json.usage?.input_tokens ?? 0,
      output_tokens: json.usage?.output_tokens ?? 0,
    },
    model: json.model ?? req.model,
  };
}

export async function flexionComplete(
  req: FlexionRequest,
): Promise<FlexionCompleteResult> {
  if (ANTHROPIC_API_KEY) return anthropicComplete(req);

  if (!BASE_URL || !API_KEY) throw missingProviderError();

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: providerHeaders(),
    body: JSON.stringify({ ...req, stream: false }),
  });

  if (!res.ok) throw new Error(`Flexion error: ${res.status} ${await res.text()}`);

  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? "",
    usage: {
      input_tokens: json.usage?.input_tokens ?? json.usage?.prompt_tokens ?? 0,
      output_tokens: json.usage?.output_tokens ?? json.usage?.completion_tokens ?? 0,
    },
    model: json.model ?? req.model,
  };
}

export async function flexionCompleteJSON<T = unknown>(
  req: FlexionRequest,
): Promise<{ data: T; usage: FlexionUsage; model: string }> {
  const result = await flexionComplete({
    ...req,
    ...({ response_format: { type: "json_object" } } as Partial<FlexionRequest>),
  });
  const cleaned = result.text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  return { data: JSON.parse(cleaned) as T, usage: result.usage, model: result.model };
}
