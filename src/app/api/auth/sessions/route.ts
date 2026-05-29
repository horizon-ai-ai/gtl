import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const rows = await prisma.session.findMany({
      where: {
        user_id: session.user.id,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: {
        id: true,
        ip: true,
        user_agent: true,
        created_at: true,
        last_seen_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    const currentSid = session.sid;
    const sessions = rows.map((row) => ({
      id: row.id,
      ip: row.ip,
      user_agent: row.user_agent,
      created_at: row.created_at,
      last_seen_at: row.last_seen_at,
      current: row.id === currentSid,
    }));

    return ok({ sessions });
  } catch (err) {
    return handleError(err);
  }
}
