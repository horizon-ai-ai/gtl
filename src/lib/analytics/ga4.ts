import { Prisma, type GoogleAnalyticsConnection } from "@prisma/client";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getLatestAnalyticsSnapshot, saveAnalyticsSnapshot } from "./cache";
import { decryptAnalyticsSecret } from "./crypto";
import { refreshGoogleAccessToken } from "./oauth";

type RelativeDateRange = "last_7_days" | "last_28_days" | "last_90_days";

type RunReportRequest = {
  dateRange: RelativeDateRange | `${string}..${string}`;
  dimensions?: string[];
  metrics: string[];
  limit?: number;
};

type TrafficOverviewArgs = {
  date_range: RelativeDateRange | "custom";
  start_date?: string;
  end_date?: string;
  compare_to_previous?: boolean;
};

type AnalyticsReportResult = {
  totals: Record<string, number>;
  rows: Array<Record<string, string | number>>;
};

function normalizePropertyId(propertyId: string) {
  return propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;
}

function resolveDateRange(input: RunReportRequest["dateRange"]) {
  if (input === "last_7_days") {
    return {
      current: { startDate: "7daysAgo", endDate: "yesterday" },
      previous: { startDate: "14daysAgo", endDate: "8daysAgo" },
      key: input,
    };
  }
  if (input === "last_28_days") {
    return {
      current: { startDate: "28daysAgo", endDate: "yesterday" },
      previous: { startDate: "56daysAgo", endDate: "29daysAgo" },
      key: input,
    };
  }
  if (input === "last_90_days") {
    return {
      current: { startDate: "90daysAgo", endDate: "yesterday" },
      previous: { startDate: "180daysAgo", endDate: "91daysAgo" },
      key: input,
    };
  }

  const [startDate, endDate] = input.split("..");
  if (!startDate || !endDate) {
    throw new ApiError("VALIDATION_ERROR", "Invalid custom analytics date range");
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  return {
    current: { startDate, endDate },
    previous: {
      startDate: prevStart.toISOString().slice(0, 10),
      endDate: prevEnd.toISOString().slice(0, 10),
    },
    key: input,
  };
}

function summarizeRows(rows: Array<Record<string, string | number>>) {
  return rows.slice(0, 5).map((row) => Object.entries(row).map(([key, value]) => `${key}=${value}`).join(", ")).join(" | ");
}

async function ensureAccessToken(connection: GoogleAnalyticsConnection) {
  const expiresAt = connection.access_token_expires_at?.getTime() ?? 0;
  const willExpireSoon = expiresAt <= Date.now() + 5 * 60 * 1000;

  if (connection.access_token && !willExpireSoon) {
    return connection.access_token;
  }

  const refreshToken = decryptAnalyticsSecret({
    ciphertext: connection.refresh_token_ciphertext,
    iv: connection.refresh_token_iv,
    tag: connection.refresh_token_tag,
  });
  const refreshed = await refreshGoogleAccessToken(refreshToken);
  await prisma.googleAnalyticsConnection.update({
    where: { id: connection.id },
    data: {
      access_token: refreshed.access_token,
      access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
      status: "active",
    },
  });
  return refreshed.access_token;
}

async function callGaRunReport(
  connection: GoogleAnalyticsConnection,
  request: RunReportRequest,
  rawDateRange: { startDate: string; endDate: string },
) {
  const accessToken = await ensureAccessToken(connection);
  const propertyId = normalizePropertyId(connection.property_id);
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [rawDateRange],
      dimensions: (request.dimensions ?? []).map((name) => ({ name })),
      metrics: request.metrics.map((name) => ({ name })),
      limit: request.limit ?? 10,
      keepEmptyRows: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApiError("UPSTREAM_ERROR", `GA runReport failed: ${res.status}`, { body: text });
  }

  return (await res.json()) as {
    rows?: Array<{
      dimensionValues?: Array<{ value: string }>;
      metricValues?: Array<{ value: string }>;
    }>;
    totals?: Array<{ metricValues?: Array<{ value: string }> }>;
  };
}

function shapeReport(
  request: RunReportRequest,
  result: Awaited<ReturnType<typeof callGaRunReport>>,
) {
  const rows = (result.rows ?? []).map((row) => {
    const entry: Record<string, string | number> = {};
    (request.dimensions ?? []).forEach((dimension, index) => {
      entry[dimension] = row.dimensionValues?.[index]?.value ?? "";
    });
    request.metrics.forEach((metric, index) => {
      const raw = row.metricValues?.[index]?.value ?? "0";
      const numeric = Number(raw);
      entry[metric] = Number.isFinite(numeric) ? numeric : raw;
    });
    return entry;
  });

  const totals: Record<string, number> = {};
  request.metrics.forEach((metric, index) => {
    totals[metric] = Number(result.totals?.[0]?.metricValues?.[index]?.value ?? 0);
  });

  return { rows, totals };
}

export async function executeSnapshotAwareReport(connection: GoogleAnalyticsConnection, request: RunReportRequest) {
  const cached = await getLatestAnalyticsSnapshot({
    connectionId: connection.id,
    dateRange: request.dateRange,
    dimensions: request.dimensions ?? [],
    metrics: request.metrics,
  });
  if (cached) {
    return cached.result;
  }

  const dateRange = resolveDateRange(request.dateRange);
  const raw = await callGaRunReport(connection, request, dateRange.current);
  const shaped = shapeReport(request, raw);

  await saveAnalyticsSnapshot(
    {
      connectionId: connection.id,
      dateRange: request.dateRange,
      dimensions: request.dimensions ?? [],
      metrics: request.metrics,
    },
    shaped,
  );

  await prisma.googleAnalyticsConnection.update({
    where: { id: connection.id },
    data: { last_sync_at: new Date() },
  });

  return shaped;
}

export async function getTrafficOverview(connection: GoogleAnalyticsConnection, args: TrafficOverviewArgs) {
  const dateRange: RunReportRequest["dateRange"] =
    args.date_range === "custom"
      ? `${args.start_date ?? ""}..${args.end_date ?? ""}`
      : args.date_range;

  const current = (await executeSnapshotAwareReport(connection, {
    dateRange,
    metrics: ["activeUsers", "sessions", "screenPageViews", "averageSessionDuration"],
  })) as AnalyticsReportResult;

  let previous: AnalyticsReportResult | null = null;
  if (args.compare_to_previous !== false) {
    const resolved = resolveDateRange(dateRange);
    const previousKey: RunReportRequest["dateRange"] = `${resolved.previous.startDate}..${resolved.previous.endDate}`;
    previous = (await executeSnapshotAwareReport(connection, {
      dateRange: previousKey,
      metrics: ["activeUsers", "sessions", "screenPageViews", "averageSessionDuration"],
    })) as AnalyticsReportResult;
  }

  const deltas = previous
    ? Object.fromEntries(
        Object.entries(current.totals).map(([metric, value]) => {
          const prev = previous?.totals?.[metric] ?? 0;
          const deltaPct = prev === 0 ? null : ((value - prev) / prev) * 100;
          return [metric, { current: value, previous: prev, delta_pct: deltaPct }];
        }),
      )
    : null;

  return {
    date_range: dateRange,
    totals: current.totals,
    previous_totals: previous?.totals ?? null,
    deltas,
    summary: summarizeRows(current.rows),
  };
}

export async function buildDashboardData(connection: GoogleAnalyticsConnection) {
  const [overview, sources, topPages, conversions] = await Promise.all([
    getTrafficOverview(connection, { date_range: "last_7_days", compare_to_previous: true }),
    executeSnapshotAwareReport(connection, {
      dateRange: "last_7_days",
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions", "activeUsers"],
      limit: 8,
    }),
    executeSnapshotAwareReport(connection, {
      dateRange: "last_7_days",
      dimensions: ["pagePath"],
      metrics: ["screenPageViews", "averageSessionDuration"],
      limit: 8,
    }),
    executeSnapshotAwareReport(connection, {
      dateRange: "last_7_days",
      dimensions: ["eventName"],
      metrics: ["conversions"],
      limit: 8,
    }),
  ]);

  return {
    overview,
    sources,
    top_pages: topPages,
    conversions,
  };
}

export async function findOwnedAnalyticsConnection(connectionId: string, userId: string) {
  const connection = await prisma.googleAnalyticsConnection.findFirst({
    where: { id: connectionId, user_id: userId, status: "active" },
  });
  if (!connection) {
    throw new ApiError("RESOURCE_NOT_FOUND", "Analytics connection not found");
  }
  return connection;
}

export async function logAnalyticsToolCall(input: {
  user_id: string;
  connection_id?: string;
  conversation_id?: string;
  message_id?: string;
  tool_name: string;
  arguments: Prisma.InputJsonValue;
  result_summary?: string;
  status: string;
  error_message?: string;
  duration_ms?: number;
}) {
  return prisma.analyticsToolCall.create({
    data: {
      user_id: input.user_id,
      conversation_id: input.conversation_id,
      message_id: input.message_id,
      tool_name: input.tool_name,
      arguments: input.arguments,
      result_summary: input.result_summary,
      credits_charged: BigInt(0),
      status: input.status,
      error_message: input.error_message,
      duration_ms: input.duration_ms,
    },
  });
}
