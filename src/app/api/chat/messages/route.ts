import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail } from "@/lib/api";
import { detectRecommendedActions, extractSuggestedItems } from "@/lib/chat-handoff";
import { flexionStream, pickModel, rawToCredits } from "@/lib/flexion";
import { assertCreditsAvailable, consumeCredits } from "@/lib/credits";
import type { MessageRole } from "@prisma/client";

const SYSTEM_PROMPT =
  "你是 Marketing AI Platform 的行銷顧問助理，專長為協助台灣中小企業完成行銷工作流：內容生成、網站建置、訂單成立、B2B 詢價。請以繁體中文回覆，語氣專業且具體，必要時主動提出可執行的下一步建議。若你判斷對話已進入成交、報價、付款、交期、客製化需求確認等階段，請明確建議使用者下一步可『建立訂單草稿』或『轉人工處理』。";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

  let body: { conversation_id?: string; content: string };
  try {
    body = await req.json();
  } catch {
    return fail("VALIDATION_ERROR", "Invalid JSON");
  }
  if (!body.content?.trim()) return fail("VALIDATION_ERROR", "Empty message");

  try {
    await assertCreditsAvailable(session.user.id);
  } catch {
    return fail("QUOTA_EXCEEDED", "Token credits exhausted");
  }

  let conversationId = body.conversation_id;
  if (!conversationId) {
    const c = await prisma.conversation.create({
      data: { user_id: session.user.id },
    });
    conversationId = c.id;
  } else {
    const c = await prisma.conversation.findFirst({
      where: { id: conversationId, user_id: session.user.id, deleted_at: null },
    });
    if (!c) return fail("RESOURCE_NOT_FOUND", "Conversation not found");
  }

  await prisma.message.create({
    data: {
      conversation_id: conversationId,
      role: "user" as MessageRole,
      content: { type: "text", text: body.content },
    },
  });

  const history = await prisma.message.findMany({
    where: { conversation_id: conversationId },
    orderBy: { created_at: "asc" },
    take: 50,
  });

  const sub = await prisma.subscription.findUnique({
    where: { user_id: session.user.id },
    include: { plan: true },
  });
  const planCode = sub?.plan.code ?? "free";
  const model = pickModel({ plan: planCode });

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map((m) => {
      const c = m.content as { type?: string; text?: string };
      return {
        role: m.role as "user" | "assistant" | "system" | "tool",
        content: typeof c === "string" ? c : c.text ?? JSON.stringify(c),
      };
    }),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("conversation", { id: conversationId });

      let assembled = "";
      let usage = { input_tokens: 0, output_tokens: 0 };
      try {
        for await (const evt of flexionStream({ model, messages, stream: true })) {
          if (evt.type === "token") {
            assembled += evt.delta;
            send("token", { delta: evt.delta });
          } else if (evt.type === "done") {
            usage = evt.usage;
          }
        }
      } catch (err) {
        send("error", { message: (err as Error).message });
      }

      const credits = rawToCredits(model, usage);
      const recommendedActions = detectRecommendedActions(assembled);
      const suggestedItems = extractSuggestedItems(assembled);
      await prisma.message.create({
        data: {
          conversation_id: conversationId!,
          role: "assistant" as MessageRole,
          content: { type: "text", text: assembled },
          tokens_input: usage.input_tokens,
          tokens_output: usage.output_tokens,
          credits_used: credits,
          model,
        },
      });
      await prisma.conversation.update({
        where: { id: conversationId! },
        data: {
          last_message_at: new Date(),
          ...(history.length <= 1 && assembled
            ? { title: assembled.slice(0, 20).replace(/\n/g, " ") }
            : {}),
        },
      });
      await consumeCredits(session.user.id, credits);

      if (recommendedActions.length > 0) {
        send("recommendation", {
          actions: recommendedActions,
          suggested_items: suggestedItems,
        });
      }
      send("done", { usage, credits: Number(credits) });
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
