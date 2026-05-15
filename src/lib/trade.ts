import { hasFeature } from "./feature-flags";
import { prisma } from "./db";
import { ApiError } from "./api";

export type TradeAccessState = {
  allowed: boolean;
  profile_exists: boolean;
  profile_verified: boolean;
  reason: "plan_locked" | "profile_missing" | "profile_pending_review" | "ready";
};

export async function canAccessTradeModule(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  return hasFeature(userId, "trade_module");
}

export async function getTradeAccessState(userId: string): Promise<TradeAccessState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      trade_profile: {
        select: {
          user_id: true,
          verified: true,
        },
      },
    },
  });

  if (!user) {
    return { allowed: false, profile_exists: false, profile_verified: false, reason: "plan_locked" };
  }

  if (user.role === "admin" || user.role === "super_admin") {
    return { allowed: true, profile_exists: true, profile_verified: true, reason: "ready" };
  }

  const planAllowed = await hasFeature(userId, "trade_module");
  if (!planAllowed) {
    return { allowed: false, profile_exists: false, profile_verified: false, reason: "plan_locked" };
  }

  if (!user.trade_profile) {
    return { allowed: false, profile_exists: false, profile_verified: false, reason: "profile_missing" };
  }

  if (!user.trade_profile.verified) {
    return { allowed: false, profile_exists: true, profile_verified: false, reason: "profile_pending_review" };
  }

  return { allowed: true, profile_exists: true, profile_verified: true, reason: "ready" };
}

export async function assertTradeModuleAccess(userId: string) {
  const ok = await canAccessTradeModule(userId);
  if (!ok) {
    throw new ApiError("PLAN_FEATURE_LOCKED", "Trade module requires Pro plan or above");
  }
}

export async function assertVerifiedTradeProfile(userId: string) {
  await assertTradeModuleAccess(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      trade_profile: {
        select: {
          verified: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError("UNAUTHORIZED", "User not found");
  }

  if (user.role === "admin" || user.role === "super_admin") return;

  if (!user.trade_profile) {
    throw new ApiError("BUSINESS_RULE_VIOLATION", "Please create your trade profile before using trade features");
  }

  if (!user.trade_profile.verified) {
    throw new ApiError("BUSINESS_RULE_VIOLATION", "Your trade profile is pending admin review");
  }
}
