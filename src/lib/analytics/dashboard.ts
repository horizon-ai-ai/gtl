import { prisma } from "@/lib/db";
import { buildDashboardData } from "./ga4";

export async function getAnalyticsDashboard(connectionId: string, userId: string) {
  const connection = await prisma.googleAnalyticsConnection.findFirst({
    where: {
      id: connectionId,
      user_id: userId,
      status: "active",
    },
  });

  if (!connection) {
    return null;
  }

  return {
    connection: {
      id: connection.id,
      property_id: connection.property_id,
      property_name: connection.property_name,
      measurement_id: connection.measurement_id,
      last_sync_at: connection.last_sync_at,
      status: connection.status,
    },
    ...(await buildDashboardData(connection)),
  };
}
