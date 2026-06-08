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
let task: Record<string, unknown> | null = null;

const userUsageDelegate = {
  findUnique: jest.fn(async () => (usage ? { ...usage } : null)),
  create: jest.fn(async ({ data }: { data: UsageRow }) => {
    usage = { ...data };
    return { ...usage };
  }),
  update: jest.fn(async () => ({})),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    designTask: { findFirst: jest.fn(async () => task) },
    subscription: { findUnique: jest.fn(async () => null) },
    userUsage: userUsageDelegate,
  },
}));

jest.mock("@/lib/conversation/api", () => ({
  getOwnedConversation: jest.fn(async () => ({ id: "conv_1", ai_model: null })),
  parseExecutionStrategy: () => null,
  requireSessionUser: jest.fn(async () => ({ id: "u_1" })),
  shapeDesignTask: (value: unknown) => value,
  shapeMessage: (value: unknown) => value,
}));

jest.mock("@/lib/conversation/schema-registry", () => ({
  getSchema: jest.fn(async () => ({ displayName: "Logo" })),
  resolveDefaultExecutionStrategy: () => "banana",
  resolveTaskDomain: () => "image",
}));

const dispatchImageGenerationMock = jest.fn();
jest.mock("@/lib/conversation/generation-dispatcher", () => ({
  dispatchImageGeneration: (...args: unknown[]) => dispatchImageGenerationMock(...args),
  imageCreditCost: (count: number) => BigInt(20000 * Math.max(1, count)),
}));

jest.mock("@/lib/flexion", () => ({
  flexionComplete: jest.fn(),
  pickModel: () => "flexion-default",
  rawToCredits: () => BigInt(0),
}));

// Pre-dispatch model resolution is DB-driven; mock it so the route never
// touches prisma raw methods (which this suite's db mock does not provide).
jest.mock("@/lib/ai-model-settings", () => ({
  resolveRequestedModelConfig: jest.fn(async () => ({
    model: "db-model",
    providerConfig: {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      provider: "openai-compatible",
    },
    creditMultiplier: 5,
  })),
}));

jest.mock("@/lib/site-builder", () => ({
  generateSiteSchema: jest.fn(),
  slugifySiteName: () => "site",
}));

jest.mock("@/lib/conversation/stream", () => ({
  publishConversationEvent: jest.fn(),
}));

import { POST } from "./route";

function generateRequest() {
  return { json: async () => ({}) } as unknown as NextRequest;
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

function seedTask(outputCount: number) {
  task = {
    id: "task_1",
    conversation_id: "conv_1",
    user_id: "u_1",
    task_type: "logo",
    execution_strategy: null,
    preferred_model: null,
    collected_data: {},
    resolved_requirements: {},
    missing_requirements: [],
    title: "Logo design",
    output_count: outputCount,
  };
}

beforeEach(() => {
  usage = null;
  task = null;
  jest.clearAllMocks();
  dispatchImageGenerationMock.mockResolvedValue({
    task: { id: "task_1" },
    message: { id: "msg_1" },
    credits: BigInt(20000),
    reused: false,
  });
});

describe("POST generate — cost-aware credit floor for image tasks", () => {
  it("rejects a short balance with INSUFFICIENT_CREDITS before any paid work", async () => {
    seedUsage(BigInt(1));
    seedTask(1);

    const res = await POST(generateRequest(), { params: { id: "conv_1", taskId: "task_1" } });
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.error.code).toBe("INSUFFICIENT_CREDITS");
    expect(dispatchImageGenerationMock).not.toHaveBeenCalled();
    expect(userUsageDelegate.update).not.toHaveBeenCalled();
  });

  it("dispatches when available covers the single-image cost", async () => {
    seedUsage(BigInt(20000));
    seedTask(1);

    const res = await POST(generateRequest(), { params: { id: "conv_1", taskId: "task_1" } });

    expect(res.status).toBe(200);
    expect(dispatchImageGenerationMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a multi-image request the balance cannot cover (30000 < 2 × 20000)", async () => {
    seedUsage(BigInt(30000));
    seedTask(2);

    const res = await POST(generateRequest(), { params: { id: "conv_1", taskId: "task_1" } });
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.error.code).toBe("INSUFFICIENT_CREDITS");
    expect(dispatchImageGenerationMock).not.toHaveBeenCalled();
    expect(userUsageDelegate.update).not.toHaveBeenCalled();
  });

  it("dispatches a multi-image request the balance covers (40000 >= 2 × 20000)", async () => {
    seedUsage(BigInt(40000));
    seedTask(2);

    const res = await POST(generateRequest(), { params: { id: "conv_1", taskId: "task_1" } });

    expect(res.status).toBe(200);
    expect(dispatchImageGenerationMock).toHaveBeenCalledTimes(1);
  });
});
