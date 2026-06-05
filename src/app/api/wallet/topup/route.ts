import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

const topupSchema = z.object({
  points: z.number().int().positive().max(100000),
  amount: z.number().int().nonnegative().default(0),
  method: z.enum(["card", "transfer", "manual"]).default("manual"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = topupSchema.parse(await req.json());
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.pointWallet.upsert({
        where: { customer_id: session.user.id },
        update: { balance: { increment: body.points } },
        create: { customer_id: session.user.id, balance: body.points },
      });
      await tx.pointTransaction.create({
        data: { customer_id: session.user.id, delta: body.points, reason: "topup" },
      });
      await tx.projectPayment.create({
        data: {
          customer_id: session.user.id,
          kind: "points_topup",
          amount: body.amount,
          method: body.method,
          status: "paid",
          paid_at: new Date(),
        },
      });
      return wallet;
    });
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
