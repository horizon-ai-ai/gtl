type MessageRow = {
  id: string;
  conversation_id: string;
  design_task_id: string | null;
  role: string;
  message_type: string;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
};

const messageStore = new Map<string, MessageRow>();
let createSeq = 0;

function matches(row: MessageRow, where: Record<string, unknown>) {
  if (where.conversation_id && row.conversation_id !== where.conversation_id) return false;
  if (where.design_task_id && row.design_task_id !== where.design_task_id) return false;
  if (where.message_type && row.message_type !== where.message_type) return false;
  if (where.id && row.id !== where.id) return false;
  return true;
}

const messageDelegate = {
  create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const id = (data.id as string) ?? `msg_${++createSeq}`;
    if (messageStore.has(id)) {
      // Same shape Prisma raises for a unique-constraint violation.
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }
    const row: MessageRow = {
      id,
      conversation_id: data.conversation_id as string,
      design_task_id: (data.design_task_id as string) ?? null,
      role: data.role as string,
      message_type: data.message_type as string,
      content: data.content as Record<string, unknown>,
      metadata: data.metadata as Record<string, unknown>,
      created_at: new Date(),
    };
    messageStore.set(id, row);
    return { ...row };
  }),
  findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    return [...messageStore.values()].filter((row) => matches(row, where));
  }),
  findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    return [...messageStore.values()].find((row) => matches(row, where)) ?? null;
  }),
  findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
    const row = messageStore.get(where.id);
    return row ? { ...row } : null;
  }),
  update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = messageStore.get(where.id);
    if (!row) throw new Error("not found");
    if (data.content) row.content = data.content as Record<string, unknown>;
    if (data.metadata) row.metadata = data.metadata as Record<string, unknown>;
    return { ...row };
  }),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    message: messageDelegate,
    designTask: { update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "task_1", ...data })) },
    conversation: { update: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  },
}));

const generateBananaImagesMock = jest.fn();
jest.mock("@/lib/banana-image", () => ({
  generateBananaImages: (...args: unknown[]) => generateBananaImagesMock(...args),
}));

jest.mock("@/lib/conversation/stream", () => ({
  publishConversationEvent: jest.fn(),
}));

jest.mock("@/lib/conversation/api", () => ({
  shapeMessage: (message: unknown) => message,
}));

jest.mock("@/lib/conversation/schema-registry", () => ({
  resolveTaskDomain: () => "image",
  resolveDefaultExecutionStrategy: () => "banana",
}));

import { dispatchImageGeneration, imageCreditCost } from "./generation-dispatcher";

type DispatchTask = Parameters<typeof dispatchImageGeneration>[0]["task"];

function makeTask(): DispatchTask {
  return {
    id: "task_1",
    task_type: "logo",
    execution_strategy: null,
    collected_data: {},
    resolved_requirements: {},
    title: "Logo design",
    template_key: null,
    template_label: null,
    output_count: 1,
    preferred_model: null,
    summary: null,
  } as unknown as DispatchTask;
}

function dispatchParams() {
  return {
    conversationId: "conv_1",
    userId: "u_1",
    task: makeTask(),
  };
}

beforeEach(() => {
  messageStore.clear();
  createSeq = 0;
  jest.clearAllMocks();
  generateBananaImagesMock.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return [{ url: "https://img.example/1.png", model: "banana-2" }];
  });
});

describe("imageCreditCost", () => {
  it("multiplies the per-image cost by the requested count (default 20000)", () => {
    expect(imageCreditCost(1)).toBe(BigInt(20000));
    expect(imageCreditCost(2)).toBe(BigInt(40000));
    expect(imageCreditCost(0)).toBe(BigInt(20000));
  });
});

describe("dispatchImageGeneration — idempotency", () => {
  it("a single dispatch creates one queued marker and completes it", async () => {
    const result = await dispatchImageGeneration(dispatchParams());

    expect(result?.reused).toBe(false);
    expect(generateBananaImagesMock).toHaveBeenCalledTimes(1);
    const rows = [...messageStore.values()].filter((r) => r.message_type === "generation_result");
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.status).toBe("completed");
  });

  it("two concurrent dispatches yield one queued generation and one provider call", async () => {
    const [res1, res2] = await Promise.all([
      dispatchImageGeneration(dispatchParams()),
      dispatchImageGeneration(dispatchParams()),
    ]);

    expect(generateBananaImagesMock).toHaveBeenCalledTimes(1);
    const rows = [...messageStore.values()].filter((r) => r.message_type === "generation_result");
    expect(rows).toHaveLength(1);
    const reusedFlags = [res1?.reused, res2?.reused].sort();
    expect(reusedFlags).toEqual([false, true]);
  });

  it("a later dispatch after completion starts a fresh generation", async () => {
    await dispatchImageGeneration(dispatchParams());
    const second = await dispatchImageGeneration(dispatchParams());

    expect(second?.reused).toBe(false);
    expect(generateBananaImagesMock).toHaveBeenCalledTimes(2);
    const rows = [...messageStore.values()].filter((r) => r.message_type === "generation_result");
    expect(rows).toHaveLength(2);
  });
});
