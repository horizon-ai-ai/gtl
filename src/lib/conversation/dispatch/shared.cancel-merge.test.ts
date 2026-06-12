type MessageRow = {
  id: string;
  conversation_id: string;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

const messageStore = new Map<string, MessageRow>();

jest.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = messageStore.get(where.id);
        return row ? { ...row, metadata: { ...row.metadata } } : null;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = messageStore.get(where.id);
          if (!row) throw new Error(`Row not found: ${where.id}`);
          const next = {
            ...row,
            ...(data.content !== undefined ? { content: data.content as Record<string, unknown> } : {}),
            ...(data.metadata !== undefined ? { metadata: data.metadata as Record<string, unknown> } : {}),
          };
          messageStore.set(where.id, next);
          return { ...next };
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

jest.mock("@/lib/conversation/active-path", () => ({
  appendMessage: jest.fn(),
  resolveSiblingParentMessageId: jest.fn(),
}));

import type { Message } from "@prisma/client";

import { isCancelRequested, updateGenerationMessage } from "./shared";

function seedMessage(id: string, metadata: Record<string, unknown>): Message {
  const row: MessageRow = {
    id,
    conversation_id: "c1",
    content: { type: "text_document", status: "streaming", text: "" },
    metadata,
  };
  messageStore.set(id, row);
  // Snapshot as the dispatcher holds it in memory (taken before any cancel).
  return { ...row, metadata: { ...metadata } } as unknown as Message;
}

function simulateCancelWrite(id: string) {
  const row = messageStore.get(id)!;
  messageStore.set(id, {
    ...row,
    metadata: {
      ...row.metadata,
      cancelRequested: true,
      cancelRequestedAt: "2026-06-12T00:00:00.000Z",
    },
  });
}

beforeEach(() => {
  messageStore.clear();
});

describe("updateGenerationMessage — cancel flag is merge-safe against streaming flushes", () => {
  it("preserves a cancelRequested flag written between two flushes and terminates the loop as cancelled", async () => {
    const snapshot = seedMessage("m1", { status: "streaming" });

    // First flush before any cancel.
    await updateGenerationMessage("c1", snapshot, {
      metadataMerge: { status: "streaming", outputGroups: [{ versionNumber: 1 }] },
    });

    // The cancel route writes between two flushes.
    simulateCancelWrite("m1");

    // Second flush still uses the stale in-memory snapshot.
    await updateGenerationMessage("c1", snapshot, {
      metadataMerge: { status: "streaming", outputGroups: [{ versionNumber: 1 }] },
    });

    const row = messageStore.get("m1")!;
    expect(row.metadata.cancelRequested).toBe(true);
    expect(row.metadata.cancelRequestedAt).toBe("2026-06-12T00:00:00.000Z");

    // The streaming loop's periodic check now sees the flag and terminates
    // the generation as cancelled.
    let cancelled = false;
    if (await isCancelRequested("m1")) cancelled = true;
    expect(cancelled).toBe(true);
  });

  it("does not invent a cancel flag when none was written", async () => {
    const snapshot = seedMessage("m2", { status: "streaming" });

    await updateGenerationMessage("c1", snapshot, {
      metadataMerge: { status: "streaming" },
    });

    const row = messageStore.get("m2")!;
    expect(row.metadata.cancelRequested).toBeUndefined();
    expect(await isCancelRequested("m2")).toBe(false);
  });

  it("keeps the flag when the caller finalizes the message as cancelled", async () => {
    const snapshot = seedMessage("m3", { status: "streaming" });
    simulateCancelWrite("m3");

    const updated = await updateGenerationMessage("c1", snapshot, {
      metadataMerge: { status: "cancelled", pendingOutputs: 0 },
    });

    const metadata = updated.metadata as Record<string, unknown>;
    expect(metadata.status).toBe("cancelled");
    expect(metadata.cancelRequested).toBe(true);
  });
});
