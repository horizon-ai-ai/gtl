import { auth } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { company: true, subscription: { include: { plan: true } } },
  });
  if (!user) return fail("RESOURCE_NOT_FOUND", "User not found");
  return ok({
    id: user.id,
    email: user.email,
    type: user.type,
    role: user.role,
    display_name: user.display_name,
    company: user.company,
    plan: user.subscription?.plan
      ? { code: user.subscription.plan.code, name: user.subscription.plan.name }
      : null,
  });
}
