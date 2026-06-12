/**
 * Forced first-version generation honors the resolved provider + multiplier (#2).
 *
 * When the user confirms generation (`proceed_generate`) on a text-delivery
 * task, `createGenerationResult` must forward the resolved `providerConfig` to
 * `flexionComplete` and charge credits using the resolved `creditMultiplier`
 * (not the static per-model default).
 */
import type { NextRequest } from "next/server";

type TaskRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  task_type: string;
  title: string;
  status: string;
  execution_strategy: string | null;
  collected_data: unknown;
  resolved_requirements: unknown;
  missing_requirements: unknown;
  summary: string | null;
  preferred_model: string | null;
  clarification_count: number;
};

const taskRow: TaskRow = {
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
      findFirst: jest.fn(async () => ({ ...taskRow })),
      findUnique: jest.fn(async () => ({ ...taskRow })),
      create: jest.fn(),
      update: jest.fn(async () => ({ ...taskRow, status: "completed" })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "msg_1",
        ...data,
        created_at: new Date(),
      })),
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      // updateGenerationMessage re-reads the row to preserve a concurrently
      // written cancelRequested flag; null means "no cancel recorded".
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    subscription: { findUnique: jest.fn(async () => ({ plan: { code: "free" } })) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(arg as Array<Promise<unknown>>),
  );
  return { prisma };
});

const consumeCreditsMock = jest.fn(async () => {});
jest.mock("@/lib/credits", () => ({
  assertCreditsAvailable: jest.fn(async () => {}),
  consumeCredits: consumeCreditsMock,
}));

const authMock = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => authMock(...args) }));

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

jest.mock("@/lib/conversation/stream", () => ({
  publishConversationEvent: jest.fn(),
}));

jest.mock("@/lib/conversation/marketing-intelligence", () => ({
  marketingIntelligence: {
    isAvailable: () => false,
    maybeResearch: jest.fn(async () => null),
    buildPromptContext: () => "",
  },
}));

// Text-delivery task: resolveTaskDomain returns a non-image domain so
// createGenerationResult takes the flexionComplete path (not image dispatch).
jest.mock("@/lib/conversation/schema-registry", () => ({
  getSchema: jest.fn(async () => ({ displayName: "Logo", requirements: [] })),
  getSchemaByTemplateKey: jest.fn(),
  resolveDefaultExecutionStrategy: () => "structured_text",
  resolveTaskDomain: () => "text",
}));

jest.mock("@/lib/website-builder/orchestrator", () => ({
  handleWebsiteBuilderTurn: jest.fn(),
}));
jest.mock("@/lib/website-builder/intent-router", () => ({ routeWebsiteKind: () => null }));
jest.mock("@/lib/site-assets", () => ({ saveSiteFiles: jest.fn() }));

const flexionCompleteMock = jest.fn();
jest.mock("@/lib/flexion", () => {
  const actual = jest.requireActual("@/lib/flexion");
  return {
    ...actual,
    flexionStream: jest.fn(),
    flexionComplete: (...args: unknown[]) => flexionCompleteMock(...args),
  };
});

const RESOLVED_PROVIDER = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  provider: "openai-compatible",
};
// creditMultiplier 3 is distinct from rawToCredits' static default (5), so a
// charge of (input+output)*3 proves the resolved multiplier was used.
jest.mock("@/lib/ai-model-settings", () => ({
  resolveRequestedModelConfig: jest.fn(async () => ({
    model: "db-default",
    providerConfig: RESOLVED_PROVIDER,
    creditMultiplier: 3,
  })),
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
  jest.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u_1" } });
  flexionCompleteMock.mockResolvedValue({
    text: "第一版成果",
    usage: { input_tokens: 10, output_tokens: 10 },
    model: "provider-model",
  });
});

describe("POST forced generation — resolved provider + multiplier", () => {
  it("forwards providerConfig to flexionComplete and charges with the resolved multiplier", async () => {
    const res = await POST(
      messageRequest({
        content: "生成第一版",
        designTaskId: "task_1",
        metadata: { quickReply: { action: "proceed_generate", taskId: "task_1" } },
      }),
      { params: { id: "conv_1" } }
    );

    expect(res.status).toBe(200);
    expect(flexionCompleteMock).toHaveBeenCalledTimes(1);
    expect(flexionCompleteMock.mock.calls[0][0].providerConfig).toEqual(RESOLVED_PROVIDER);

    // (10 + 10) * 3 = 60, using the resolved multiplier rather than default 5.
    expect(consumeCreditsMock).toHaveBeenCalledWith("u_1", BigInt(60));
  });
});
