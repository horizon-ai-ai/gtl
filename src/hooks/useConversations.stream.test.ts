import { streamMessageFromEvent } from "./useConversations";

function sseEvent(payload: Record<string, unknown>) {
  return { data: JSON.stringify({ data: payload }) } as MessageEvent;
}

function assistantMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    conversation_id: "conv_1",
    role: "assistant",
    message_type: "ai",
    content: { type: "text", text: "完成的回覆" },
    metadata: { status: "completed" },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("streamMessageFromEvent — isStreaming on message.completed", () => {
  // Since "Stabilize conversation generation flow" (cb72c8a), completed SSE
  // assistant replies deliberately stay in the local typewriter path
  // (isStreaming: true) so long answers do not pop in all at once.
  it("keeps a completed assistant AI message in the typewriter path", () => {
    const result = streamMessageFromEvent(sseEvent(assistantMessage()), "message.completed");

    expect(result).not.toBeNull();
    expect(result?.isStreaming).toBe(true);
  });

  it("keeps the typewriter path on completion when metadata still says streaming", () => {
    const result = streamMessageFromEvent(
      sseEvent(assistantMessage({ metadata: { status: "streaming" } })),
      "message.completed"
    );

    expect(result?.isStreaming).toBe(true);
  });

  it("does not force the typewriter path for a completed user message", () => {
    const result = streamMessageFromEvent(
      sseEvent(assistantMessage({ role: "user" })),
      "message.completed"
    );

    expect(result?.isStreaming).toBeFalsy();
  });

  it("keeps isStreaming: true for a created message still in streaming status", () => {
    const result = streamMessageFromEvent(
      sseEvent(assistantMessage({ metadata: { status: "streaming" } })),
      "message.created"
    );

    expect(result?.isStreaming).toBe(true);
  });
});
