import { act, renderHook, waitFor } from "@testing-library/react";
import { useConversations } from "./useConversations";

const CONVERSATION_ID = "conv-1";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: (event: MessageEvent) => void) {
    const list = this.listeners.get(name) ?? [];
    list.push(listener);
    this.listeners.set(name, list);
  }

  close() {}

  emit(name: string, payload: Record<string, unknown>) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify({ data: payload }) } as MessageEvent);
    }
  }
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

function abortError() {
  return Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}

function serverAssistantMessage(id: string) {
  return {
    id,
    conversation_id: CONVERSATION_ID,
    role: "assistant",
    message_type: "ai",
    content: { type: "text", text: "部分回覆" },
    metadata: { status: "streaming" },
    created_at: new Date().toISOString(),
  };
}

function serverUserMessage(id: string) {
  return {
    id,
    conversation_id: CONVERSATION_ID,
    role: "user",
    message_type: "ai",
    content: { type: "text", text: "hello" },
    metadata: null,
    created_at: new Date().toISOString(),
  };
}

describe("useConversations — pending-cancel handshake for early stop", () => {
  let cancelCalls: string[];
  let sendMessageImpl: (init?: RequestInit) => Promise<Response>;

  beforeEach(() => {
    FakeEventSource.instances = [];
    cancelCalls = [];
    sendMessageImpl = () => Promise.resolve(jsonResponse({}));
    global.EventSource = FakeEventSource as unknown as typeof EventSource;
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/conversations" && (!init?.method || init.method === "GET")) {
        return jsonResponse([]);
      }
      if (url === "/api/conversations/design-task-starters") {
        return jsonResponse({ starters: [] });
      }
      if (url === `/api/conversations/${CONVERSATION_ID}` && (!init?.method || init.method === "GET")) {
        return jsonResponse({
          id: CONVERSATION_ID,
          title: "test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        });
      }
      if (url === `/api/conversations/${CONVERSATION_ID}/messages` && init?.method === "POST") {
        return sendMessageImpl(init);
      }
      const cancelMatch = url.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)\/cancel$/);
      if (cancelMatch && init?.method === "POST") {
        cancelCalls.push(url);
        return jsonResponse({ alreadySettled: false });
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    }) as unknown as typeof fetch;
  });

  async function startSendAndStopEarly(hook: ReturnType<typeof renderHook<ReturnType<typeof useConversations>, unknown>>) {
    let sendPromise: Promise<unknown> = Promise.resolve(null);
    act(() => {
      sendPromise = hook.result.current.sendMessage(CONVERSATION_ID, { content: "請產生第一版" });
    });
    await waitFor(() =>
      expect(hook.result.current.messages.some((message) => message.id.startsWith("local-assistant"))).toBe(true),
    );
    const localAssistantId = hook.result.current.messages.find((message) =>
      message.id.startsWith("local-assistant"),
    )!.id;
    await act(async () => {
      await hook.result.current.stopActiveMessage(CONVERSATION_ID, localAssistantId);
    });
    // Wrap so the caller's `await` does not flatten/settle the send promise.
    return { sendPromise };
  }

  it("fires cancelMessage exactly once when the server id arrives via message.created after an early stop", async () => {
    sendMessageImpl = (init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) reject(abortError());
        init?.signal?.addEventListener("abort", () => reject(abortError()));
      });

    const hook = renderHook(() => useConversations(CONVERSATION_ID));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const stream = FakeEventSource.instances[0];

    const { sendPromise } = await startSendAndStopEarly(hook);
    await act(async () => {
      await expect(sendPromise).resolves.toBeNull();
    });
    expect(cancelCalls).toHaveLength(0);

    // A user message.created never claims the pending cancel.
    act(() => stream.emit("message.created", serverUserMessage("msg-user-1")));
    expect(cancelCalls).toHaveLength(0);

    // The server-assigned assistant id arrives: cancel fires immediately.
    act(() => stream.emit("message.created", serverAssistantMessage("msg-assistant-1")));
    await waitFor(() =>
      expect(cancelCalls).toEqual([
        `/api/conversations/${CONVERSATION_ID}/messages/msg-assistant-1/cancel`,
      ]),
    );

    // The pending cancel is claimed once: further created events do not re-cancel.
    act(() => stream.emit("message.created", serverAssistantMessage("msg-assistant-2")));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(cancelCalls).toHaveLength(1);
  });

  it("does not cancel when the send request fails without producing a server id", async () => {
    let rejectSend: ((error: Error) => void) | null = null;
    sendMessageImpl = () =>
      new Promise<Response>((_resolve, reject) => {
        rejectSend = reject;
      });

    const hook = renderHook(() => useConversations(CONVERSATION_ID));
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
    const stream = FakeEventSource.instances[0];

    const { sendPromise } = await startSendAndStopEarly(hook);

    // The request fails outright (not an abort): no server id will ever arrive.
    await act(async () => {
      rejectSend!(new Error("boom"));
      await expect(sendPromise).resolves.toBeNull();
    });

    // A later assistant message.created must not be cancelled — the pending
    // cancel was discarded with the failed send.
    act(() => stream.emit("message.created", serverAssistantMessage("msg-assistant-3")));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(cancelCalls).toHaveLength(0);
  });
});
