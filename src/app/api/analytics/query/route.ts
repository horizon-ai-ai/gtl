import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { findOwnedAnalyticsConnection, getTrafficOverview, logAnalyticsToolCall } from "@/lib/analytics/ga4";

const schema = z.object({
  connection_id: z.string().min(1),
  tool_name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

const trafficOverviewArgsSchema = z.object({
  date_range: z.enum(["last_7_days", "last_28_days", "last_90_days", "custom"]).default("last_7_days"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  compare_to_previous: z.boolean().optional(),
});

export async function POST(req: Request) {
  let parsedBody:
    | {
        connection_id: string;
        tool_name: string;
        arguments: Record<string, unknown>;
      }
    | null = null;
  let userId: string | null = null;

  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    userId = session.user.id;

    const body = schema.parse(await req.json());
    parsedBody = body;
    const startedAt = Date.now();
    const connection = await findOwnedAnalyticsConnection(body.connection_id, session.user.id);

    if (body.tool_name !== "get_traffic_overview") {
      throw new ApiError("VALIDATION_ERROR", `Unsupported analytics tool: ${body.tool_name}`);
    }

    const args = trafficOverviewArgsSchema.parse(body.arguments);
    const result = await getTrafficOverview(connection, args);

    await logAnalyticsToolCall({
      user_id: session.user.id,
      tool_name: body.tool_name,
      arguments: body.arguments as Prisma.InputJsonValue,
      result_summary: JSON.stringify(result.totals),
      status: "success",
      duration_ms: Date.now() - startedAt,
    });

    return ok({
      connection_id: connection.id,
      tool_name: body.tool_name,
      result,
    });
  } catch (err) {
    if (err instanceof Error && parsedBody?.tool_name && userId) {
        await logAnalyticsToolCall({
          user_id: userId,
          tool_name: parsedBody.tool_name,
          arguments: parsedBody.arguments as Prisma.InputJsonValue,
          status: "error",
          error_message: err.message,
        }).catch(() => {});
    }
    return handleError(err);
  }
}
