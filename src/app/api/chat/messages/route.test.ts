import type { NextRequest } from "next/server";

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

type ChatPost = (req: NextRequest) => Promise<Response>;
let POST: ChatPost;
let planDefaultModel: string;

beforeAll(() => {
  delete process.env.FLEXION_MODEL;
  delete process.env.FLEXION_API_BASE_URL;
  delete process.env.CONVERSATION_MODEL_OPTIONS;
  delete process.env.OPENROUTER_API_KEY;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ POST } = require("./route"));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  planDefaultModel = require("@/lib/flexion").pickModel({ plan: "free" });
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

describe("POST /api/chat/messages — model plan gating", () => {
  it("clamps an out-of-plan selectedModel to the plan default before the provider call", async () => {
    seedUsage(BigInt(1000));

    const res = await POST(
      chatRequest({ conversation_id: "conv_1", content: "hello", selectedModel: "claude-opus-4-7" })
    );
    await res.text(); // drain the SSE stream so the completion path runs

    expect(flexionStreamMock).toHaveBeenCalledTimes(1);
    expect(flexionStreamMock.mock.calls[0][0].model).toBe(planDefaultModel);
    expect(flexionStreamMock.mock.calls[0][0].model).not.toBe("claude-opus-4-7");
  });

  it("honors an in-plan requested model", async () => {
    seedUsage(BigInt(1000));

    const res = await POST(
      chatRequest({ conversation_id: "conv_1", content: "hello", selectedModel: "gemini-3.1-pro-preview" })
    );
    await res.text();

    expect(flexionStreamMock.mock.calls[0][0].model).toBe("gemini-3.1-pro-preview");
  });

  it("uses the plan default when no model is requested", async () => {
    seedUsage(BigInt(1000));

    const res = await POST(chatRequest({ conversation_id: "conv_1", content: "hello" }));
    await res.text();

    expect(flexionStreamMock.mock.calls[0][0].model).toBe(planDefaultModel);
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
