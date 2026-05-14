import { hasFeature } from "./feature-flags";
import { prisma } from "./db";
import { ApiError } from "./api";

export async function canAccessTradeModule(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  return hasFeature(userId, "trade_module");
}

export async function assertTradeModuleAccess(userId: string) {
  const ok = await canAccessTradeModule(userId);
  if (!ok) {
    throw new ApiError("PLAN_FEATURE_LOCKED", "Trade module requires Pro plan or above");
  }
}
