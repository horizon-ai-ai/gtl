import { auth } from "@/lib/auth";
import { ok, fail, handleError } from "@/lib/api";
import { ensureUsage } from "@/lib/credits";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const u = await ensureUsage(session.user.id);
    return ok({
      period: u.period,
      plan_credits: Number(u.plan_credits),
      topup_credits: Number(u.topup_credits),
      used_credits: Number(u.used_credits),
      available: Number(u.plan_credits + u.topup_credits - u.used_credits),
      reset_at: u.reset_at,
    });
  } catch (err) {
    return handleError(err);
  }
}
