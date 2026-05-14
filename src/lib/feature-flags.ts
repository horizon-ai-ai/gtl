// Feature flag gating — see docs/03_spec_billing.md §8

import { prisma } from "./db";

export type FeatureFlag =
  | "chat.model.sonnet"
  | "chat.model.opus"
  | "analytics.ga4"
  | "analytics.weekly_summary"
  | "analytics.anomaly_detection"
  | "analytics.max_connections"
  | "pagebuilder"
  | "pagebuilder.custom_domain"
  | "pagebuilder.max_sites"
  | "trade_module"
  | "rag.advanced"
  | "team.max_members"
  | "api_access";

export async function getUserFeatures(userId: string): Promise<Record<string, unknown>> {
  const sub = await prisma.subscription.findUnique({
    where: { user_id: userId },
    include: { plan: true },
  });
  if (!sub) return {};
  return (sub.plan.features as Record<string, unknown>) ?? {};
}

export async function hasFeature(userId: string, flag: FeatureFlag): Promise<boolean> {
  const features = await getUserFeatures(userId);
  return Boolean(features[flag]);
}

export async function getNumericFeature(userId: string, flag: FeatureFlag): Promise<number | null> {
  const features = await getUserFeatures(userId);
  const value = features[flag];
  return typeof value === "number" ? value : null;
}
