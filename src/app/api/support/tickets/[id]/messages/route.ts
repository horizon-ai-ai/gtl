import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";

const schema = z.object({
  comment: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: params.id, user_id: session.user.id },
    });
    if (!ticket) return fail("RESOURCE_NOT_FOUND", "Ticket not found");

    const body = schema.parse(await req.json());
    const action = await prisma.adminAction.create({
      data: {
        admin_id: session.user.id,
        action: "support_ticket_user_reply",
        target_type: "support_ticket",
        target_id: ticket.id,
        payload: {
          author: session.user.email ?? "User",
          comment: body.comment,
        },
      },
    });

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: ticket.status === "resolved" ? "in_progress" : ticket.status,
      },
    });

    return ok(action);
  } catch (err) {
    return handleError(err);
  }
}
