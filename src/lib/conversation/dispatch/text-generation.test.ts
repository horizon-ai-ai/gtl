type MessageRow = {
  id: string;
  conversation_id: string;
  design_task_id: string | null;
  message_type: string;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Date;
};

const messageStore: MessageRow[] = [];

jest.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findFirst: jest.fn(
        async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: Record<string, string> }) => {
          let rows = messageStore.filter(
            (row) =>
              (!where.id || row.id === where.id) &&
              (!where.conversation_id || row.conversation_id === where.conversation_id) &&
              (!where.design_task_id || row.design_task_id === where.design_task_id) &&
              (!where.message_type || row.message_type === where.message_type),
          );
          if (orderBy?.created_at === "desc") {
            rows = rows.slice().sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
          }
          return rows[0] ? { ...rows[0] } : null;
        },
      ),
    },
  },
}));

jest.mock("@/lib/conversation/stream", () => ({
  publishConversationEvent: jest.fn(),
}));

jest.mock("@/lib/conversation/api", () => ({
  shapeMessage: (message: unknown) => message,
}));

import type { DesignTask } from "@prisma/client";

import { buildTextGenerationPrompt, sourceTextFromPriorVersion } from "./text-generation";

const task = {
  title: "SEO 文章",
  task_type: "seo_article",
  collected_data: {},
  resolved_requirements: {},
  missing_requirements: {},
} as Pick<DesignTask, "title" | "task_type" | "collected_data" | "resolved_requirements" | "missing_requirements">;

function promptFromSource(sourceText: string) {
  return buildTextGenerationPrompt({
    task,
    schemaDisplayName: "SEO 文章",
    executionStrategy: "structured_text",
    sourceText,
    sourceVersionNumber: null,
    instruction: "改一下標題",
  });
}

function seedRow(row: Partial<MessageRow> & { id: string }) {
  messageStore.push({
    conversation_id: "c1",
    design_task_id: "t1",
    message_type: "ai",
    content: {},
    metadata: {},
    created_at: new Date(),
    ...row,
  });
}

beforeEach(() => {
  messageStore.length = 0;
});

describe("sourceTextFromPriorVersion", () => {
  it("rejects a user message supplied as the source id (creation prompt built)", async () => {
    seedRow({
      id: "user_1",
      message_type: "ai",
      content: { type: "text", text: "我想要一篇 SEO 文章" },
    });

    const sourceText = await sourceTextFromPriorVersion({
      conversationId: "c1",
      taskId: "t1",
      sourceMessageId: "user_1",
    });

    expect(sourceText).toBe("");
    const prompt = promptFromSource(sourceText);
    expect(prompt).not.toContain("被修改的前版內容");
    expect(prompt).not.toContain("請輸出修正版完整成品");
    expect(prompt).toContain("請直接輸出第一版完整成品");
  });

  it("accepts a generation_result source (revision prompt built)", async () => {
    seedRow({
      id: "gen_1",
      message_type: "generation_result",
      metadata: {
        outputGroups: [
          { versionNumber: 1, items: [{ content: "第一版正文內容" }] },
        ],
      },
    });

    const sourceText = await sourceTextFromPriorVersion({
      conversationId: "c1",
      taskId: "t1",
      sourceMessageId: "gen_1",
    });

    expect(sourceText).toBe("第一版正文內容");
    const prompt = promptFromSource(sourceText);
    expect(prompt).toContain("被修改的前版內容：\n第一版正文內容");
    expect(prompt).toContain("請輸出修正版完整成品");
    expect(prompt).not.toContain("請直接輸出第一版完整成品");
  });

  it("builds the creation prompt when the task has no generation results at all", async () => {
    const sourceText = await sourceTextFromPriorVersion({
      conversationId: "c1",
      taskId: "t1",
      sourceMessageId: null,
    });

    expect(sourceText).toBe("");
    const prompt = promptFromSource(sourceText);
    expect(prompt).not.toContain("被修改的前版內容");
    expect(prompt).toContain("請直接輸出第一版完整成品");
  });
});
