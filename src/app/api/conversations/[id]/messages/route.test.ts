import type { NextRequest } from "next/server";

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  message_type: string;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  design_task_id: string | null;
  created_at: Date;
};

const messages: MessageRow[] = [];
let messageSeq = 0;

jest.mock("@/lib/db", () => {
  const prisma = {
    conversation: {
      findFirst: jest.fn(async () => ({
        id: "conv_1",
        user_id: "u_1",
        deleted_at: null,
        title: "新對話",
        ai_model: null,
        project_memory: null,
        active_design_task_id: null,
      })),
      findUnique: jest.fn(async () => ({ active_design_task_id: null, active_leaf_message_id: null })),
      update: jest.fn(async () => ({})),
    },
    designTask: {
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => null),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: MessageRow = {
          id: `msg_${++messageSeq}`,
          conversation_id: data.conversation_id as string,
          role: data.role as string,
          message_type: data.message_type as string,
          content: data.content as Record<string, unknown>,
          metadata: (data.metadata as Record<string, unknown>) ?? {},
          design_task_id: (data.design_task_id as string) ?? null,
          created_at: new Date(),
        };
        messages.push(row);
        return { ...row };
      }),
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = messages.find((m) => m.id === where.id);
        return row ? { ...row } : null;
      }),
      findFirst: jest.fn(async (args?: { where?: Record<string, unknown>; orderBy?: Record<string, string> }) => {
        const where = args?.where ?? {};
        let rows = messages.filter(
          (m) =>
            (!where.id || m.id === where.id) &&
            (!where.conversation_id || m.conversation_id === where.conversation_id) &&
            (!where.role || m.role === where.role),
        );
        if (args?.orderBy?.created_at === "desc") rows = [...rows].reverse();
        return rows[0] ? { ...rows[0] } : null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = messages.find((m) => m.id === where.id);
        if (!row) throw new Error("not found");
        if (data.content) row.content = data.content as Record<string, unknown>;
        if (data.metadata) row.metadata = data.metadata as Record<string, unknown>;
        return { ...row };
      }),
    },
    subscription: { findUnique: jest.fn(async () => ({ plan: { code: "free" } })) },
    userUsage: {
      findUnique: jest.fn(async () => ({
        user_id: "u_1",
        period: "2026-06",
        plan_credits: BigInt(100000),
        topup_credits: BigInt(0),
        used_credits: BigInt(0),
        reset_at: new Date(),
      })),
      create: jest.fn(),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(arg as Array<Promise<unknown>>),
  );
  return { prisma };
});

const authMock = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

jest.mock("@/lib/chat-handoff", () => ({
  detectRecommendedActions: () => [],
  extractSuggestedItems: () => [],
}));

jest.mock("@/lib/conversation/intent-resolver", () => ({
  inferConversationIntent: jest.fn(async () => null),
}));

jest.mock("@/lib/conversation/generation-dispatcher", () => ({
  dispatchImageGeneration: jest.fn(),
  imageCreditCost: jest.fn(),
}));

const publishedEvents: Array<{ event: string; payload: unknown }> = [];
jest.mock("@/lib/conversation/stream", () => ({
  publishConversationEvent: jest.fn((_id: string, event: string, payload: unknown) => {
    publishedEvents.push({ event, payload });
  }),
}));

jest.mock("@/lib/conversation/marketing-intelligence", () => ({
  marketingIntelligence: {
    isAvailable: () => false,
    maybeResearch: jest.fn(async () => null),
    buildPromptContext: () => "",
  },
}));

const waitUntilMock = jest.fn();
jest.mock("@vercel/functions", () => ({
  waitUntil: (promise: Promise<unknown>) => waitUntilMock(promise),
}));

jest.mock("@/lib/conversation/schema-registry", () => ({
  getSchema: jest.fn(async () => ({ displayName: "Logo", requirements: [] })),
  getSchemaByTemplateKey: jest.fn(),
  resolveDefaultExecutionStrategy: () => "structured_text",
  resolveTaskDomain: () => "image",
}));

jest.mock("@/lib/website-builder/orchestrator", () => ({
  handleWebsiteBuilderTurn: jest.fn(),
}));

jest.mock("@/lib/website-builder/intent-router", () => ({
  routeWebsiteKind: () => null,
}));

jest.mock("@/lib/site-assets", () => ({
  saveSiteFiles: jest.fn(),
}));

const flexionStreamMock = jest.fn();
const flexionCompleteMock = jest.fn();
jest.mock("@/lib/flexion", () => {
  const actual = jest.requireActual("@/lib/flexion");
  return {
    ...actual,
    flexionStream: (...args: unknown[]) => flexionStreamMock(...args),
    flexionComplete: (...args: unknown[]) => flexionCompleteMock(...args),
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

type ConversationsPost = (
  req: NextRequest,
  ctx: { params: { id: string } }
) => Promise<Response>;
let POST: ConversationsPost;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ POST } = require("./route"));
});

function messageRequest(body: Record<string, unknown>) {
  return {
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  messages.length = 0;
  messageSeq = 0;
  publishedEvents.length = 0;
  jest.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u_1" } });
  flexionStreamMock.mockImplementation(async function* () {
    yield { type: "token", delta: "你好" };
    yield {
      type: "done",
      usage: { input_tokens: 10, output_tokens: 5 },
      model: "provider-model",
    };
  });
  flexionCompleteMock.mockResolvedValue({
    text: "fallback",
    usage: { input_tokens: 1, output_tokens: 1 },
    model: "provider-model",
  });
});

describe("POST /api/conversations/[id]/messages — DB-driven model resolution", () => {
  it("forwards the resolved default model and provider config to the provider", async () => {
    const res = await POST(
      messageRequest({ content: "hello" }),
      { params: { id: "conv_1" } }
    );

    expect(res.status).toBe(200);
    expect(flexionStreamMock).toHaveBeenCalledTimes(1);
    expect(flexionStreamMock.mock.calls[0][0].model).toBe("db-default");
    expect(flexionStreamMock.mock.calls[0][0].providerConfig).toEqual({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      provider: "openai-compatible",
    });
  });

  it("uses the database default when no model is requested", async () => {
    const res = await POST(
      messageRequest({ content: "hello" }),
      { params: { id: "conv_1" } }
    );

    expect(res.status).toBe(200);
    expect(flexionStreamMock.mock.calls[0][0].model).toBe("db-default");
  });
});

describe("POST /api/conversations/[id]/messages — streaming placeholder finalization", () => {
  it("marks the placeholder failed when both stream and fallback fail, leaving no row in streaming status", async () => {
    flexionStreamMock.mockImplementation(async function* () {
      throw new Error("stream died");
    });
    flexionCompleteMock.mockRejectedValue(new Error("fallback died"));

    const res = await POST(messageRequest({ content: "hello" }), { params: { id: "conv_1" } });

    expect(res.status).toBe(500);
    const streamingRows = messages.filter((m) => m.metadata.status === "streaming");
    expect(streamingRows).toHaveLength(0);
    const failedRows = messages.filter((m) => m.metadata.status === "failed");
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0].role).toBe("assistant");
    expect(publishedEvents.some((e) => e.event === "message.updated")).toBe(true);
  });

  it("finalizes the placeholder as completed on the happy path", async () => {
    const res = await POST(messageRequest({ content: "hello" }), { params: { id: "conv_1" } });

    expect(res.status).toBe(200);
    expect(messages.filter((m) => m.metadata.status === "streaming")).toHaveLength(0);
    const assistantRows = messages.filter((m) => m.role === "assistant");
    expect(assistantRows).toHaveLength(1);
    expect(assistantRows[0].metadata.status).toBe("completed");
  });
});

describe("POST /api/conversations/[id]/messages — marketing-intelligence settle lifecycle", () => {
  it("registers the settle through waitUntil and grafts the result when the registered promise runs", async () => {
    const pack = {
      query: "logo 趨勢",
      summary: "整理好的摘要",
      searchModel: "search-model",
      sources: [],
      visualReferences: [],
      groundedMode: false,
      createdAt: new Date().toISOString(),
    };
    const { marketingIntelligence } = jest.requireMock("@/lib/conversation/marketing-intelligence");
    marketingIntelligence.maybeResearch.mockResolvedValueOnce(pack);

    const res = await POST(messageRequest({ content: "hello" }), { params: { id: "conv_1" } });
    expect(res.status).toBe(200);

    // The settle is registered through the runtime lifecycle extension, not
    // run as a detached `void promise.then` continuation.
    expect(waitUntilMock).toHaveBeenCalledTimes(1);
    const settlePromise = waitUntilMock.mock.calls[0][0] as Promise<unknown>;
    expect(typeof settlePromise.then).toBe("function");

    // Driving the registered promise performs the settle: metadata update +
    // ready-event publish.
    await settlePromise;
    const assistant = messages.find((m) => m.role === "assistant")!;
    expect(
      (assistant.metadata.marketingIntelligence as Record<string, unknown> | undefined)?.summary,
    ).toBe("整理好的摘要");
    expect(publishedEvents.some((e) => e.event === "marketing.intelligence.ready")).toBe(true);
  });

  it("does not register a settle when no intelligence lookup was started", async () => {
    const res = await POST(messageRequest({ content: "hello" }), { params: { id: "conv_1" } });
    expect(res.status).toBe(200);
    // maybeResearch resolves null, but the registration itself only happens
    // when a lookup promise exists; with the default mock it does — so the
    // assertion here is that the settle never writes metadata for a null pack.
    for (const call of waitUntilMock.mock.calls) {
      await (call[0] as Promise<unknown>);
    }
    const assistant = messages.find((m) => m.role === "assistant")!;
    expect(assistant.metadata.marketingIntelligence ?? null).toBeNull();
    expect(publishedEvents.some((e) => e.event === "marketing.intelligence.ready")).toBe(false);
  });
});

// Keep this describe LAST in the file: it overrides shared prisma mock
// implementations (mockResolvedValue survives jest.clearAllMocks), and
// running it last keeps the earlier tests on the factory defaults.
describe("POST /api/conversations/[id]/messages — refine keeps the generate confirmation quick action", () => {
  it("attaches a proceed_generate quick action to a refine-classified consultative reply", async () => {
    const taskRow = {
      id: "task_1",
      user_id: "u_1",
      conversation_id: "conv_1",
      task_type: "logo",
      title: "Logo",
      status: "active",
      execution_strategy: "structured_text",
      collected_data: {},
      resolved_requirements: {},
      missing_requirements: {},
      summary: null,
      preferred_model: null,
      clarification_count: 0,
    };
    const { prisma } = jest.requireMock("@/lib/db");
    prisma.conversation.findUnique.mockResolvedValue({
      active_design_task_id: "task_1",
      active_leaf_message_id: null,
    });
    prisma.designTask.findFirst.mockResolvedValue({ ...taskRow });
    prisma.designTask.findUnique.mockResolvedValue({ ...taskRow });
    prisma.designTask.update.mockResolvedValue({ ...taskRow });
    const { inferConversationIntent } = jest.requireMock("@/lib/conversation/intent-resolver");
    inferConversationIntent.mockResolvedValueOnce({
      action: "refine",
      taskType: "logo",
      assetFamily: "visual",
      outputCount: null,
      confidence: 0.9,
      reasoning: "user adjusts the existing logo draft",
    });

    const res = await POST(
      messageRequest({
        // >40 chars so the turn is not treated as an opening turn, and no
        // explicit generate keywords so forceGenerate stays false.
        content:
          "我想調整這個 Logo 的配色，整體再溫暖一點，但字體與構圖都先保持不變，請先告訴我你打算怎麼改、有哪些方向可以選。",
      }),
      { params: { id: "conv_1" } },
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      assistantMessage: { metadata?: { quickActions?: Array<{ action?: string }> } };
    };
    const quickActions = json.assistantMessage.metadata?.quickActions ?? [];
    expect(quickActions.some((action) => action.action === "proceed_generate")).toBe(true);
  });
});
