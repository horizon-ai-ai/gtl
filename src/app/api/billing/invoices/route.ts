import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const invoices = await prisma.invoice.findMany({
      where: { user_id: session.user.id },
      orderBy: { created_at: "desc" },
      take: 20,
    });

    return ok(
      invoices.map((invoice) => ({
        id: invoice.id,
        type: invoice.type,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        paid_at: invoice.paid_at,
        created_at: invoice.created_at,
        metadata: invoice.metadata,
      })),
    );
  } catch (err) {
    return handleError(err);
  }
}
