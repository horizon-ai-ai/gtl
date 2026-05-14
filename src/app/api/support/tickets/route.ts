import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";

const createSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  category: z.string().trim().min(1).default("general"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const tickets = await prisma.supportTicket.findMany({
      where: { user_id: session.user.id },
      orderBy: { created_at: "desc" },
      take: 100,
    });

    return ok(tickets);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const body = createSchema.parse(await req.json());

    const ticket = await prisma.supportTicket.create({
      data: {
        user_id: session.user.id,
        conversation_id: body.conversation_id,
        category: body.category,
        priority: body.priority,
        subject: body.subject,
        body: body.body,
      },
    });

    await prisma.supportConversation.upsert({
      where: { id: body.conversation_id ?? ticket.id },
      update: {
        mode: "human",
        status: "open",
      },
      create: {
        id: body.conversation_id ?? ticket.id,
        user_id: session.user.id,
        mode: "human",
        status: "open",
      },
    });

    return ok(ticket);
  } catch (err) {
    return handleError(err);
  }
}
