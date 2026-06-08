import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { flexionStream, pickModel, type FlexionUsage } from "@/lib/flexion";
import { buildAdminCopilotSystemPrompt, buildAdminCopilotUserPrompt } from "@/lib/admin-copilot/prompts";
import {
  buildPlanningPrompt,
  fallbackPlanAdminCopilotTools,
  parsePlannedTools,
  type PlannedTool,
} from "@/lib/admin-copilot/planner";
import { runAdminCopilotTool, type AdminCopilotToolCard } from "@/lib/admin-copilot/tools";

const schema = z.object({
  query: z.string().min(1),
});

async function collectModelText(messages: Array<{ role: "system" | "user"; content: string }>, taskHint: "fast" | "complex") {
  // Still env-based — follow-up: admin/copilot has not been migrated to
  // DB-resolved providerConfig (see fix-ai-model-resolution-review proposal
  // Non-Goals, alongside support/ask and website-builder/orchestrator).
  const model = pickModel({ plan: "pro", taskHint });
  let text = "";
  let usage: FlexionUsage = { input_tokens: 0, output_tokens: 0 };

  for await (const evt of flexionStream({
    model,
    stream: true,
    messages,
  })) {
    if (evt.type === "token") {
      text += evt.delta;
    } else if (evt.type === "done") {
      usage = evt.usage;
    }
  }

  return { text, usage, model };
}

async function resolveToolPlan(query: string): Promise<{ plan: PlannedTool[]; plannerModel: string | null }> {
  try {
    const planning = await collectModelText(
      [
        {
          role: "system",
          content: "你是精確的後台工具規劃器。只能回傳合法 JSON。",
        },
        {
          role: "user",
          content: buildPlanningPrompt(query),
        },
      ],
      "fast",
    );
    const parsed = parsePlannedTools(planning.text);
    if (parsed.length > 0) {
      return { plan: parsed, plannerModel: planning.model };
    }
  } catch {
    // fall through to heuristic plan
  }

  return {
    plan: fallbackPlanAdminCopilotTools(query),
    plannerModel: null,
  };
}

async function writeAdminCopilotAudit(input: {
  adminId: string;
  runId: string;
  query: string;
  plannerModel: string | null;
  answerModel?: string | null;
  plan: PlannedTool[];
  cards: AdminCopilotToolCard[];
  usage?: FlexionUsage | null;
  status: "success" | "error";
  errorMessage?: string;
  answer?: string;
}) {
  return prisma.adminAction.create({
    data: {
      admin_id: input.adminId,
      action: "admin_copilot_run",
      target_type: "admin_copilot",
      target_id: input.runId,
      reason: input.query.slice(0, 300),
      payload: {
        query: input.query,
        planner_model: input.plannerModel,
        answer_model: input.answerModel ?? null,
        plan: input.plan,
        cards: input.cards.map((card) => ({
          tool: card.tool,
          title: card.title,
          summary: card.summary,
          item_count: card.items.length,
        })),
        usage: input.usage ?? null,
        status: input.status,
        error_message: input.errorMessage ?? null,
        answer_excerpt: input.answer?.slice(0, 1000) ?? null,
      } satisfies Prisma.InputJsonValue,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
  if (session.user.role !== "admin" && session.user.role !== "super_admin") {
    return fail("FORBIDDEN", "Admin access required");
  }

  const body = schema.parse(await req.json());
  const runId = randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let plan: PlannedTool[] = [];
      let plannerModel: string | null = null;
      const cards: AdminCopilotToolCard[] = [];
      let answer = "";
      let answerUsage: FlexionUsage | null = null;
      let answerModel: string | null = null;

      try {
        const resolved = await resolveToolPlan(body.query);
        plan = resolved.plan;
        plannerModel = resolved.plannerModel;

        send("planned_tools", {
          run_id: runId,
          items: plan,
          planner_model: plannerModel,
        });

        for (const tool of plan) {
          send("tool_call", {
            run_id: runId,
            tool_name: tool.name,
            reason: tool.reason,
          });

          const startedAt = Date.now();
          const card = await runAdminCopilotTool(tool.name, body.query);
          cards.push(card);

          send("tool_result", {
            run_id: runId,
            tool_name: tool.name,
            duration_ms: Date.now() - startedAt,
            card,
          });
        }

        const model = pickModel({ plan: "pro", taskHint: "complex" });
        answerModel = model;

        for await (const evt of flexionStream({
          model,
          stream: true,
          messages: [
            { role: "system", content: buildAdminCopilotSystemPrompt() },
            { role: "user", content: buildAdminCopilotUserPrompt({ query: body.query, plan, cards }) },
          ],
        })) {
          if (evt.type === "token") {
            answer += evt.delta;
            send("token", { delta: evt.delta });
          } else {
            answerUsage = evt.usage;
            send("done", {
              run_id: runId,
              usage: evt.usage,
              model: evt.model,
            });
          }
        }

        await writeAdminCopilotAudit({
          adminId: session.user.id,
          runId,
          query: body.query,
          plannerModel,
          answerModel,
          plan,
          cards,
          usage: answerUsage,
          status: "success",
          answer,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Copilot 執行失敗";
        send("error", { message, run_id: runId });
        await writeAdminCopilotAudit({
          adminId: session.user.id,
          runId,
          query: body.query,
          plannerModel,
          answerModel,
          plan,
          cards,
          usage: answerUsage,
          status: "error",
          errorMessage: message,
          answer,
        }).catch(() => {});
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
