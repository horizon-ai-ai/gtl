"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardPayload = {
  connection: {
    id: string;
    property_id: string;
    property_name: string;
    measurement_id?: string | null;
    last_sync_at?: string | null;
    status: string;
  };
  overview: {
    date_range: string;
    totals: Record<string, number>;
    previous_totals?: Record<string, number> | null;
    deltas?: Record<string, { current: number; previous: number; delta_pct: number | null }> | null;
  } | null;
  sources: { rows: Array<Record<string, string | number>> } | null;
  top_pages: { rows: Array<Record<string, string | number>> } | null;
  conversions: { rows: Array<Record<string, string | number>> } | null;
};

export function AnalyticsDashboardClient({ connectionId }: { connectionId: string }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadDashboard();
  }, [connectionId]);

  async function loadDashboard() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/analytics/dashboard?connection_id=${connectionId}`);
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error?.message ?? "載入 dashboard 失敗");
      return;
    }
    setData(json.data);
  }

  if (loading) {
    return <div className="text-sm text-neutral-500">載入 analytics dashboard 中...</div>;
  }

  if (error) {
    return <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (!data) {
    return <div className="text-sm text-neutral-500">目前沒有 dashboard 資料。</div>;
  }

  const totals = data.overview?.totals ?? {};
  const deltas = data.overview?.deltas ?? {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{data.connection.property_name}</CardTitle>
          <CardDescription>
            {data.connection.property_id}
            {data.connection.last_sync_at ? ` · 最近同步 ${new Date(data.connection.last_sync_at).toLocaleString()}` : ""}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Active Users" value={formatMetric(totals.activeUsers)} delta={deltas.activeUsers?.delta_pct ?? null} />
        <MetricCard title="Sessions" value={formatMetric(totals.sessions)} delta={deltas.sessions?.delta_pct ?? null} />
        <MetricCard title="Page Views" value={formatMetric(totals.screenPageViews)} delta={deltas.screenPageViews?.delta_pct ?? null} />
        <MetricCard title="Avg Session" value={formatDuration(totals.averageSessionDuration)} delta={deltas.averageSessionDuration?.delta_pct ?? null} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataCard
          title="流量來源"
          description="最近 7 天各 channel 的 sessions / users"
          rows={data.sources?.rows ?? []}
        />
        <DataCard
          title="熱門頁面"
          description="最近 7 天 page views 與平均停留時間"
          rows={data.top_pages?.rows ?? []}
        />
      </div>

      <DataCard
        title="轉換事件"
        description="最近 7 天 conversions 事件分佈"
        rows={data.conversions?.rows ?? []}
      />
    </div>
  );
}

function MetricCard({ title, value, delta }: { title: string; value: string; delta: number | null }) {
  const tone = delta == null ? "text-neutral-500" : delta >= 0 ? "text-green-600" : "text-red-600";
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-sm ${tone}`}>{delta == null ? "無前期比較" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}</div>
      </CardContent>
    </Card>
  );
}

function DataCard({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<Record<string, string | number>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">目前沒有資料。</div>
        ) : (
          rows.map((row, index) => (
            <div key={`${title}-${index}`} className="rounded-md border p-3 text-sm">
              {Object.entries(row).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">{key}</span>
                  <span className="font-medium">{typeof value === "number" ? formatMetric(value) : value}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function formatMetric(value?: number) {
  if (value == null) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatDuration(value?: number) {
  if (!value) return "0s";
  if (value < 60) return `${value.toFixed(1)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}
