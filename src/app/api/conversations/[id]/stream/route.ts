import { NextRequest } from "next/server";

import { handleError } from "@/lib/api";
import { getOwnedConversation, requireSessionUser } from "@/lib/conversation/api";
import { subscribeConversationEvents } from "@/lib/conversation/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(event: { id: string; type: string; payload: unknown; createdAt: string }) {
  return [
    `id: ${event.id}`,
    `event: ${event.type}`,
    `data: ${JSON.stringify({ type: event.type, data: event.payload, createdAt: event.createdAt })}`,
    "",
    "",
  ].join("\n");
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireSessionUser();
    await getOwnedConversation(params.id, user.id);

    const encoder = new TextEncoder();
    let cleanup: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            encodeEvent({
              id: "connected",
              type: "connected",
              payload: { conversationId: params.id },
              createdAt: new Date().toISOString(),
            }),
          ),
        );

        cleanup = subscribeConversationEvents(params.id, {
          send(event) {
            controller.enqueue(encoder.encode(encodeEvent(event)));
          },
        });

        heartbeat = setInterval(() => {
          controller.enqueue(
            encoder.encode(
              encodeEvent({
                id: `heartbeat-${Date.now()}`,
                type: "heartbeat",
                payload: { ok: true },
                createdAt: new Date().toISOString(),
              }),
            ),
          );
        }, 25_000);
      },
      cancel() {
        cleanup?.();
        cleanup = null;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
      },
    });

    req.signal.addEventListener("abort", () => {
      cleanup?.();
      cleanup = null;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
