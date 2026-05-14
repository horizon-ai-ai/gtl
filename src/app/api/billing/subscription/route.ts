import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail, handleError, ApiError } from "@/lib/api";
import { ensureDefaultSubscription } from "@/lib/subscriptions";
import { z } from "zod";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("switch_plan"),
    plan_code: z.string().min(1),
  }),
  z.object({
    action: z.literal("cancel_at_period_end"),
  }),
  z.object({
    action: z.literal("resume"),
  }),
]);

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const sub = await ensureDefaultSubscription(session.user.id);
    if (!sub) return ok(null);
    return ok({
      status: sub.status,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
      plan: {
        code: sub.plan.code,
        name: sub.plan.name,
        price_monthly: sub.plan.price_monthly,
        monthly_credits: Number(sub.plan.monthly_credits),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const body = patchSchema.parse(await req.json());
    const now = new Date();

    const [currentSub, activePlans] = await Promise.all([
      ensureDefaultSubscription(session.user.id),
      prisma.plan.findMany({ where: { active: true } }),
    ]);

    if (body.action === "cancel_at_period_end") {
      if (!currentSub) throw new ApiError("RESOURCE_NOT_FOUND", "Subscription not found");
      const updated = await prisma.subscription.update({
        where: { user_id: session.user.id },
        data: { cancel_at_period_end: true },
        include: { plan: true },
      });
      return ok(updated);
    }

    if (body.action === "resume") {
      if (!currentSub) throw new ApiError("RESOURCE_NOT_FOUND", "Subscription not found");
      const updated = await prisma.subscription.update({
        where: { user_id: session.user.id },
        data: { cancel_at_period_end: false },
        include: { plan: true },
      });
      return ok(updated);
    }

    const nextPlan = activePlans.find((plan) => plan.code === body.plan_code);
    if (!nextPlan) throw new ApiError("RESOURCE_NOT_FOUND", "Plan not found");

    const nextPeriodStart = now;
    const nextPeriodEnd = addDays(now, 30);

    const subscription = currentSub
      ? await prisma.subscription.update({
          where: { user_id: session.user.id },
          data: {
            plan_id: nextPlan.id,
            status: "active",
            cancel_at_period_end: false,
            next_plan_id: null,
            current_period_start: nextPeriodStart,
            current_period_end: nextPeriodEnd,
            version: { increment: 1 },
          },
          include: { plan: true },
        })
      : await prisma.subscription.create({
          data: {
            user_id: session.user.id,
            plan_id: nextPlan.id,
            status: "active",
            current_period_start: nextPeriodStart,
            current_period_end: nextPeriodEnd,
          },
          include: { plan: true },
        });

    if (!currentSub || currentSub.plan_id !== nextPlan.id) {
      await prisma.invoice.create({
        data: {
          user_id: session.user.id,
          type: "subscription",
          amount: nextPlan.price_monthly,
          currency: "TWD",
          status: "paid",
          paid_at: now,
          metadata: {
            source: "billing_page_sandbox",
            plan_code: nextPlan.code,
            plan_name: nextPlan.name,
            previous_plan_code: currentSub?.plan.code ?? null,
          },
        },
      });
    }

    return ok(subscription);
  } catch (err) {
    return handleError(err);
  }
}
