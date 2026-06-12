type MessageRow = {
  id: string;
  conversation_id: string;
  parent_message_id: string | null;
  design_task_id: string | null;
  role: string;
  message_type: string;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type ConversationRow = {
  id: string;
  active_leaf_message_id: string | null;
};

const messageStore = new Map<string, MessageRow>();
const conversationStore = new Map<string, ConversationRow>();
let createSeq = 0;
let clockSeq = 0;
let failNextCreate: Error | null = null;

function nextDate() {
  clockSeq += 1;
  return new Date(2026, 0, 1, 0, 0, clockSeq);
}

function rowsByConversation(conversationId: string) {
  return [...messageStore.values()]
    .filter((row) => row.conversation_id === conversationId)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
}

function matchesWhere(row: MessageRow, where: Record<string, unknown>) {
  if (where.id && row.id !== where.id) return false;
  if (where.conversation_id && row.conversation_id !== where.conversation_id) return false;
  if (where.created_at && typeof where.created_at === "object") {
    const lt = (where.created_at as { lt?: Date }).lt;
    if (lt && !(row.created_at.getTime() < lt.getTime())) return false;
  }
  return true;
}

function buildMessageDelegate() {
  return {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (failNextCreate) {
        const error = failNextCreate;
        failNextCreate = null;
        throw error;
      }
      const id = (data.id as string) ?? `msg_${++createSeq}`;
      const row: MessageRow = {
        id,
        conversation_id: data.conversation_id as string,
        parent_message_id: (data.parent_message_id as string | null) ?? null,
        design_task_id: (data.design_task_id as string | null) ?? null,
        role: (data.role as string) ?? "user",
        message_type: (data.message_type as string) ?? "ai",
        content: (data.content as Record<string, unknown>) ?? {},
        metadata: (data.metadata as Record<string, unknown>) ?? {},
        created_at: nextDate(),
      };
      messageStore.set(id, row);
      return { ...row };
    },
    findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: Record<string, string> }) => {
      let rows = [...messageStore.values()].filter((row) => matchesWhere(row, where));
      if (orderBy?.created_at === "desc") {
        rows = rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      } else if (orderBy?.created_at === "asc") {
        rows = rows.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
      }
      return rows[0] ? { ...rows[0] } : null;
    },
    findMany: async ({ where }: { where: Record<string, unknown> }) => {
      return rowsByConversation(where.conversation_id as string).map((row) => ({ ...row }));
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const row of messageStore.values()) {
        if (!matchesWhere(row, where)) continue;
        if ("parent_message_id" in where && row.parent_message_id !== where.parent_message_id) continue;
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    },
  };
}

function buildConversationDelegate() {
  return {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = conversationStore.get(where.id);
      return row ? { ...row } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = conversationStore.get(where.id);
      if (!row) throw new Error("conversation not found");
      if ("active_leaf_message_id" in data) {
        row.active_leaf_message_id = data.active_leaf_message_id as string | null;
      }
      return { ...row };
    },
  };
}

const prismaMock = {
  message: buildMessageDelegate(),
  conversation: buildConversationDelegate(),
  $transaction: async (arg: unknown) => {
    if (typeof arg === "function") {
      // Interactive transaction: snapshot both stores so a thrown error
      // rolls everything back, mirroring Postgres semantics.
      const messagesSnapshot = new Map(
        [...messageStore.entries()].map(([id, row]) => [id, { ...row }]),
      );
      const conversationsSnapshot = new Map(
        [...conversationStore.entries()].map(([id, row]) => [id, { ...row }]),
      );
      try {
        return await (arg as (tx: typeof prismaMock) => Promise<unknown>)(prismaMock);
      } catch (error) {
        messageStore.clear();
        for (const [id, row] of messagesSnapshot) messageStore.set(id, row);
        conversationStore.clear();
        for (const [id, row] of conversationsSnapshot) conversationStore.set(id, row);
        throw error;
      }
    }
    return Promise.all(arg as Array<Promise<unknown>>);
  },
};

jest.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { appendMessage } from "./active-path";

function seedConversation(id: string, activeLeafMessageId: string | null = null) {
  conversationStore.set(id, { id, active_leaf_message_id: activeLeafMessageId });
}

function seedMessage(id: string, conversationId: string, parentMessageId: string | null = null) {
  messageStore.set(id, {
    id,
    conversation_id: conversationId,
    parent_message_id: parentMessageId,
    design_task_id: null,
    role: "user",
    message_type: "ai",
    content: { type: "text", text: id },
    metadata: {},
    created_at: nextDate(),
  });
}

const baseData = {
  role: "user",
  message_type: "ai",
  content: { type: "text", text: "hello" },
  metadata: {},
} as Parameters<typeof appendMessage>[1];

beforeEach(() => {
  messageStore.clear();
  conversationStore.clear();
  createSeq = 0;
  clockSeq = 0;
  failNextCreate = null;
});

describe("appendMessage", () => {
  it("defaults the parent to the conversation's current active leaf and bumps the leaf", async () => {
    seedMessage("m1", "c1");
    seedMessage("m2", "c1", "m1");
    seedConversation("c1", "m2");

    const created = await appendMessage("c1", baseData);

    expect(created.parent_message_id).toBe("m2");
    expect(conversationStore.get("c1")?.active_leaf_message_id).toBe(created.id);
  });

  it("honors an explicit parentMessageId override and still bumps the leaf", async () => {
    seedMessage("m1", "c1");
    seedMessage("m2", "c1", "m1");
    seedConversation("c1", "m2");

    const created = await appendMessage("c1", baseData, { parentMessageId: "m1" });

    expect(created.parent_message_id).toBe("m1");
    expect(conversationStore.get("c1")?.active_leaf_message_id).toBe(created.id);
  });

  it("creates an explicit root sibling when parentMessageId is null", async () => {
    seedMessage("m1", "c1");
    seedMessage("m2", "c1", "m1");
    seedConversation("c1", "m2");

    const created = await appendMessage("c1", baseData, { parentMessageId: null });

    expect(created.parent_message_id).toBeNull();
    expect(conversationStore.get("c1")?.active_leaf_message_id).toBe(created.id);
  });

  it("falls back to the latest message when the conversation has no leaf pointer", async () => {
    seedMessage("m1", "c1");
    seedMessage("m2", "c1");
    seedConversation("c1", null);

    const created = await appendMessage("c1", baseData);

    expect(created.parent_message_id).toBe("m2");
    expect(conversationStore.get("c1")?.active_leaf_message_id).toBe(created.id);
  });

  it("creates a root message when the conversation is empty", async () => {
    seedConversation("c1", null);

    const created = await appendMessage("c1", baseData);

    expect(created.parent_message_id).toBeNull();
    expect(conversationStore.get("c1")?.active_leaf_message_id).toBe(created.id);
  });

  it("falls back to the active leaf when the explicit parent does not exist", async () => {
    seedMessage("m1", "c1");
    seedConversation("c1", "m1");

    const created = await appendMessage("c1", baseData, { parentMessageId: "ghost" });

    expect(created.parent_message_id).toBe("m1");
  });

  it("leaves message and leaf unchanged when the transaction fails", async () => {
    seedMessage("m1", "c1");
    seedConversation("c1", "m1");
    failNextCreate = new Error("create exploded");

    await expect(appendMessage("c1", baseData)).rejects.toThrow("create exploded");

    expect(messageStore.size).toBe(1);
    expect(conversationStore.get("c1")?.active_leaf_message_id).toBe("m1");
  });
});
