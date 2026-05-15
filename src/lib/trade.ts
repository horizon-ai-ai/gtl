import { hasFeature } from "./feature-flags";
import { prisma } from "./db";
import { ApiError } from "./api";

export type TradeAccessState = {
  allowed: boolean;
  seller_allowed: boolean;
  profile_exists: boolean;
  profile_verified: boolean;
  reason: "buyer_ready" | "seller_plan_locked" | "profile_missing" | "profile_pending_review" | "ready";
};

export async function canAccessTradeModule(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;
  return true;
}

export async function canAccessSellerTrade(userId: string) {
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
    return {
      allowed: false,
      seller_allowed: false,
      profile_exists: false,
      profile_verified: false,
      reason: "seller_plan_locked",
    };
  }

  if (user.role === "admin" || user.role === "super_admin") {
    return {
      allowed: true,
      seller_allowed: true,
      profile_exists: true,
      profile_verified: true,
      reason: "ready",
    };
  }

  const planAllowed = await hasFeature(userId, "trade_module");
  if (!planAllowed) {
    return {
      allowed: true,
      seller_allowed: false,
      profile_exists: false,
      profile_verified: false,
      reason: "seller_plan_locked",
    };
  }

  if (!user.trade_profile) {
    return {
      allowed: true,
      seller_allowed: false,
      profile_exists: false,
      profile_verified: false,
      reason: "profile_missing",
    };
  }

  if (!user.trade_profile.verified) {
    return {
      allowed: true,
      seller_allowed: false,
      profile_exists: true,
      profile_verified: false,
      reason: "profile_pending_review",
    };
  }

  return {
    allowed: true,
    seller_allowed: true,
    profile_exists: true,
    profile_verified: true,
    reason: "ready",
  };
}

export async function assertTradeModuleAccess(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "User not found");
  }
}

export async function assertSellerTradeAccess(userId: string) {
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

  const planAllowed = await hasFeature(userId, "trade_module");
  if (!planAllowed) {
    throw new ApiError("PLAN_FEATURE_LOCKED", "Seller features require a subscribed trade plan");
  }

  if (!user.trade_profile) {
    throw new ApiError("BUSINESS_RULE_VIOLATION", "Please create your seller trade profile before using seller features");
  }

  if (!user.trade_profile.verified) {
    throw new ApiError("BUSINESS_RULE_VIOLATION", "Your seller trade profile is pending admin review");
  }
}

export async function assertVerifiedTradeProfile(userId: string) {
  return assertSellerTradeAccess(userId);
}
