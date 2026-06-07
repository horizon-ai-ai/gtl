import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requireSessionUser } from "@/lib/conversation/api";

function intParam(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const searchParams = req.nextUrl.searchParams;
    const page = intParam(searchParams.get("page"), 1, 1000);
    const limit = intParam(searchParams.get("limit"), 100, 100);
    const q = (searchParams.get("q") || "").trim();
    const items = await prisma.conversation.findMany({
      where: {
        user_id: user.id,
        deleted_at: null,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                {
                  messages: {
                    some: {
                      content: {
                        path: ["text"],
                        string_contains: q,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        { pinned: "desc" },
        { last_message_at: { sort: "desc", nulls: "last" } },
        { updated_at: "desc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        category: true,
        pinned: true,
        archived: true,
        ai_model: true,
        active_design_task_id: true,
        last_message_at: true,
        created_at: true,
        updated_at: true,
        _count: { select: { messages: true, design_tasks: true } },
      },
    });
    return ok(items);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSessionUser();
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : undefined;
    const aiModel = typeof body.aiModel === "string" && body.aiModel.trim()
      ? body.aiModel.trim()
      : undefined;

    const c = await prisma.conversation.create({
      data: {
        user_id: user.id,
        ...(title ? { title } : {}),
        ...(aiModel ? { ai_model: aiModel } : {}),
        last_message_at: new Date(),
      },
    });
    return ok(c);
  } catch (err) {
    return handleError(err);
  }
}
