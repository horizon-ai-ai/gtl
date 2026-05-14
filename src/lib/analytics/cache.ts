import { createHash } from "crypto";
import { prisma } from "@/lib/db";

type SnapshotQuery = {
  connectionId: string;
  dateRange: string;
  dimensions: string[];
  metrics: string[];
};

export function createAnalyticsQueryHash(input: Omit<SnapshotQuery, "connectionId">) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

export async function getLatestAnalyticsSnapshot(query: SnapshotQuery) {
  return prisma.analyticsSnapshot.findFirst({
    where: {
      connection_id: query.connectionId,
      query_hash: createAnalyticsQueryHash({
        dateRange: query.dateRange,
        dimensions: query.dimensions,
        metrics: query.metrics,
      }),
      expires_at: { gt: new Date() },
    },
    orderBy: { fetched_at: "desc" },
  });
}

export async function saveAnalyticsSnapshot(query: SnapshotQuery, result: unknown, retentionDays = 90) {
  return prisma.analyticsSnapshot.create({
    data: {
      connection_id: query.connectionId,
      query_hash: createAnalyticsQueryHash({
        dateRange: query.dateRange,
        dimensions: query.dimensions,
        metrics: query.metrics,
      }),
      date_range: query.dateRange,
      dimensions: query.dimensions,
      metrics: query.metrics,
      result: result as object,
      expires_at: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
    },
  });
}
