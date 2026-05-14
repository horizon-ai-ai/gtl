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
};

export type FlexionUsage = {
  input_tokens: number;
  output_tokens: number;
};

const MODEL_MULTIPLIER: Record<string, number> = {
  "claude-haiku-4-5": 1,
  "claude-sonnet-4-6": 5,
  "claude-opus-4-7": 25,
  "kimi-k2-turbo-preview": 2,
  "kimi-k2.5": 5,
  "kimi-k2.6": 5,
  "kimi-k2-thinking": 10,
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
  const { plan, taskHint = "normal" } = opts;
  if (isMoonshot) {
    if (plan === "free" || plan === "starter") {
      return taskHint === "fast" ? "kimi-k2-turbo-preview" : "kimi-k2.5";
    }
    if (taskHint === "complex") return "kimi-k2-thinking";
    if (taskHint === "fast") return "kimi-k2-turbo-preview";
    return "kimi-k2.5";
  }
  if (plan === "free" || plan === "starter") {
    return taskHint === "fast" ? "claude-haiku-4-5" : "claude-sonnet-4-6";
  }
  if (taskHint === "complex") return "claude-opus-4-7";
  if (taskHint === "fast") return "claude-haiku-4-5";
  return "claude-sonnet-4-6";
}

const BASE_URL = process.env.FLEXION_API_BASE_URL ?? "";
const API_KEY = process.env.FLEXION_API_KEY ?? "";
const MODEL_OVERRIDE = process.env.FLEXION_MODEL?.trim() ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_API_BASE_URL ?? "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION ?? "2023-06-01";

type StreamEvent =
  | { type: "token"; delta: string }
  | { type: "done"; usage: FlexionUsage; model: string };

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

  if (!API_KEY) {
    // Development fallback: emit a fake stream so the UI is testable without keys
    const text = "（開發模式）Flexion API key 尚未設定，這是模擬回應。";
    for (const ch of text) {
      yield { type: "token" as const, delta: ch };
      await new Promise((r) => setTimeout(r, 15));
    }
    yield {
      type: "done" as const,
      usage: { input_tokens: 10, output_tokens: text.length },
      model: req.model,
    };
    return;
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      "X-Tenant-Id": "marketing-ai-platform",
    },
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
