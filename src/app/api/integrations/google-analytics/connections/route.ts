import { auth } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const connections = await prisma.googleAnalyticsConnection.findMany({
      where: { user_id: session.user.id },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        google_account_email: true,
        property_id: true,
        property_name: true,
        measurement_id: true,
        scopes: true,
        status: true,
        last_sync_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    return ok(connections);
  } catch (err) {
    return handleError(err);
  }
}
