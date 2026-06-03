import { auth } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const wallet = await prisma.pointWallet.upsert({
      where: { customer_id: session.user.id },
      update: {},
      create: { customer_id: session.user.id, balance: 0 },
    });
    const transactions = await prisma.pointTransaction.findMany({
      where: { customer_id: session.user.id },
      orderBy: { created_at: "desc" },
      take: 50,
    });
    const payments = await prisma.projectPayment.findMany({
      where: { customer_id: session.user.id },
      orderBy: { created_at: "desc" },
      take: 50,
    });
    return ok({ wallet, transactions, payments });
  } catch (err) {
    return handleError(err);
  }
}
