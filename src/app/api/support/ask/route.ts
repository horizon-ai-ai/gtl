import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { fail } from "@/lib/api";
import { flexionStream, pickModel } from "@/lib/flexion";
import { retrieveKnowledge } from "@/lib/kb";
import { resolveSupportToolResults } from "@/lib/support-tools";

const schema = z.object({
  question: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

  const body = schema.parse(await req.json());
  const { citations, context } = await retrieveKnowledge(body.question, session.user.id);
  const { results: toolResults, context: toolContext } = await resolveSupportToolResults(session.user.id, body.question);
  // Still env-based — follow-up: this standalone endpoint has not been migrated
  // to DB-resolved providerConfig (see fix-ai-model-resolution-review proposal
  // Non-Goals, alongside admin/copilot and website-builder/orchestrator).
  const model = pickModel({ plan: "pro", taskHint: "normal" });

  const prompt = [
    "你是 Marketing AI Platform 的客服助理。",
    "請根據提供的知識內容與平台資料回答，若資訊不足就明確說不知道。",
    "優先使用平台資料回答使用者個人狀態問題，例如方案、用量、訂單、工單。",
    "若引用知識庫內容，回答最後請保留 [1] [2] 這種 citation 編號。",
    "平台資料屬於即時帳戶資訊，不需要加知識庫 citation 編號，但不能捏造不存在的資料。",
    "",
    "平台資料：",
    toolContext || "目前沒有可用的平台資料。",
    "",
    "知識內容：",
    context || "目前沒有可用知識內容。",
  ].join("\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("tool_results", { items: toolResults });
      send("citations", { items: citations, retrieval_mode: "pgvector_hybrid" });
      try {
        for await (const evt of flexionStream({
          model,
          stream: true,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: body.question },
          ],
        })) {
          if (evt.type === "token") {
            send("token", { delta: evt.delta });
          } else {
            send("done", { usage: evt.usage, citations, tool_results: toolResults });
          }
        }
      } catch (err) {
        send("error", { message: (err as Error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
