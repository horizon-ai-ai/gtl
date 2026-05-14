import { prisma } from "@/lib/db";

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function ensureDefaultSubscription(userId: string) {
  const existing = await prisma.subscription.findUnique({
    where: { user_id: userId },
    include: { plan: true },
  });
  if (existing) return existing;

  const freePlan = await prisma.plan.findUnique({ where: { code: "free" } });
  if (!freePlan) return null;

  const now = new Date();
  return prisma.subscription.create({
    data: {
      user_id: userId,
      plan_id: freePlan.id,
      status: "active",
      current_period_start: now,
      current_period_end: addDays(now, 30),
    },
    include: { plan: true },
  });
}
