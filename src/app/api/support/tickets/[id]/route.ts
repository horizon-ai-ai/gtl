import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";
import { mapSupportTimeline } from "@/lib/support";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: params.id, user_id: session.user.id },
    });
    if (!ticket) return fail("RESOURCE_NOT_FOUND", "Ticket not found");

    const actions = await prisma.adminAction.findMany({
      where: {
        target_type: "support_ticket",
        target_id: ticket.id,
      },
      orderBy: { created_at: "asc" },
    });

    const adminIds = Array.from(new Set(actions.map((action) => action.admin_id)));
    const admins = adminIds.length
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, email: true, display_name: true },
        })
      : [];
    const adminLookup = new Map(admins.map((admin) => [admin.id, admin.display_name ?? admin.email]));

    const timeline = mapSupportTimeline(actions, adminLookup).filter((entry) => entry.visibility === "public");

    return ok({ ...ticket, timeline });
  } catch (err) {
    return handleError(err);
  }
}
