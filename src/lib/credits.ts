import { prisma } from "./db";
import { ApiError } from "./api";

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthFirst(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export async function ensureUsage(userId: string) {
  const period = currentPeriod();
  let usage = await prisma.userUsage.findUnique({
    where: { user_id_period: { user_id: userId, period } },
  });
  if (!usage) {
    const sub = await prisma.subscription.findUnique({
      where: { user_id: userId },
      include: { plan: true },
    });
    const planCredits = sub?.plan.monthly_credits ?? BigInt(100_000);
    usage = await prisma.userUsage.create({
      data: {
        user_id: userId,
        period,
        plan_credits: planCredits,
        topup_credits: BigInt(0),
        used_credits: BigInt(0),
        reset_at: nextMonthFirst(),
      },
    });
  }
  return usage;
}

export async function getAvailableCredits(userId: string): Promise<bigint> {
  const usage = await ensureUsage(userId);
  return usage.plan_credits + usage.topup_credits - usage.used_credits;
}

export async function consumeCredits(userId: string, credits: bigint) {
  const period = currentPeriod();
  await prisma.userUsage.update({
    where: { user_id_period: { user_id: userId, period } },
    data: { used_credits: { increment: credits } },
  });
}

export async function assertCreditsAvailable(userId: string) {
  const available = await getAvailableCredits(userId);
  if (available <= BigInt(0)) {
    throw new ApiError("QUOTA_EXCEEDED", "Token credits exhausted for this period");
  }
}
