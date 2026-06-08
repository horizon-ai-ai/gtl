import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api";

type UsageRow = {
  user_id: string;
  period: string;
  plan_credits: bigint;
  topup_credits: bigint;
  used_credits: bigint;
  reset_at: Date;
};

let usage: UsageRow | null = null;
const createdMessages: Array<Record<string, unknown>> = [];

jest.mock("@/lib/db", () => ({
  prisma: {
    conversation: {
      findFirst: jest.fn(async () => ({ id: "conv_1", user_id: "u_1", deleted_at: null })),
      findUnique: jest.fn(async () => ({ active_design_task_id: null })),
      create: jest.fn(async () => ({ id: "conv_1" })),
      update: jest.fn(async () => ({})),
    },
    designTask: { findFirst: jest.fn(async () => null), create: jest.fn() },
    message: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        createdMessages.push(data);
        return { id: `msg_${createdMessages.length}`, ...data };
      }),
      findMany: jest.fn(async () => []),
    },
    subscription: {
      findUnique: jest.fn(async () => ({ plan: { code: "free" } })),
    },
    userUsage: {
      findUnique: jest.fn(async () => (usage ? { ...usage } : null)),
      create: jest.fn(async ({ data }: { data: UsageRow }) => {
        usage = { ...data };
        return { ...usage };
      }),
      update: jest.fn(async () => ({})),
    },
  },
}));

const authMock = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

jest.mock("@/lib/chat-handoff", () => ({
  detectRecommendedActions: () => [],
  extractSuggestedItems: () => [],
}));

jest.mock("@/lib/conversation/marketing-intelligence", () => ({
  marketingIntelligence: {
    isAvailable: () => false,
    buildPromptContext: () => "",
    maybeResearch: jest.fn(),
  },
}));

const flexionStreamMock = jest.fn();
jest.mock("@/lib/flexion", () => {
  const actual = jest.requireActual("@/lib/flexion");
  return {
    ...actual,
    flexionStream: (...args: unknown[]) => flexionStreamMock(...args),
  };
});

// Model resolution is DB-driven (admin-managed AiModelSetting rows). Mock the
// resolver so the route receives a deterministic model + provider config:
// echo the requested override, falling back to "db-default" when none is given.
const resolveRequestedModelConfigMock = jest.fn(
  async (_plan: string, requested?: string | null) => ({
    model: typeof requested === "string" && requested.trim() ? requested.trim() : "db-default",
    providerConfig: {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      provider: "openai-compatible",
    },
    creditMultiplier: 5,
  }),
);
jest.mock("@/lib/ai-model-settings", () => ({
  resolveRequestedModelConfig: (plan: string, requested?: string | null) =>
    resolveRequestedModelConfigMock(plan, requested),
}));

type ChatPost = (req: NextRequest) => Promise<Response>;
let POST: ChatPost;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ POST } = require("./route"));
});

function chatRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as NextRequest;
}

function seedUsage(available: bigint) {
  usage = {
    user_id: "u_1",
    period: "2026-06",
    plan_credits: available,
    topup_credits: BigInt(0),
    used_credits: BigInt(0),
    reset_at: new Date(),
  };
}

beforeEach(() => {
  usage = null;
  createdMessages.length = 0;
  jest.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u_1" } });
  flexionStreamMock.mockImplementation(async function* () {
    yield { type: "token", delta: "Hi" };
    yield { type: "done", usage: { input_tokens: 10, output_tokens: 5 }, model: "x" };
  });
});

describe("POST /api/chat/messages — DB-driven model resolution", () => {
  it("forwards the resolved model and provider config to the provider", async () => {
    seedUsage(BigInt(1000));

    const res = await POST(
      chatRequest({ conversation_id: "conv_1", content: "hello", selectedModel: "claude-opus-4-7" })
    );
    await res.text(); // drain the SSE stream so the completion path runs

    expect(flexionStreamMock).toHaveBeenCalledTimes(1);
    expect(flexionStreamMock.mock.calls[0][0].model).toBe("claude-opus-4-7");
    expect(flexionStreamMock.mock.calls[0][0].providerConfig).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      provider: "openai-compatible",
    });
  });

  it("uses the database default when no model is requested", async () => {
    seedUsage(BigInt(1000));

    const res = await POST(chatRequest({ conversation_id: "conv_1", content: "hello" }));
    await res.text();

    expect(flexionStreamMock.mock.calls[0][0].model).toBe("db-default");
  });

  it("returns 422 and skips the provider when no model is configured", async () => {
    seedUsage(BigInt(1000));
    resolveRequestedModelConfigMock.mockRejectedValueOnce(
      new ApiError("AI_MODEL_NOT_CONFIGURED", "AI model is not configured")
    );

    const res = await POST(chatRequest({ conversation_id: "conv_1", content: "hello" }));

    expect(res.status).toBe(422);
    expect(flexionStreamMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat/messages — text-chat balance semantics", () => {
  it("dispatches with any positive balance", async () => {
    seedUsage(BigInt(1));

    const res = await POST(chatRequest({ conversation_id: "conv_1", content: "hello" }));

    expect(res.status).toBe(200);
    await res.text();
    expect(flexionStreamMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an exhausted balance with quota-exceeded before any provider work", async () => {
    seedUsage(BigInt(0));

    const res = await POST(chatRequest({ conversation_id: "conv_1", content: "hello" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("QUOTA_EXCEEDED");
    expect(flexionStreamMock).not.toHaveBeenCalled();
  });
});
