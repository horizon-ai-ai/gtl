"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Connection = {
  id: string;
  google_account_email: string;
  property_id: string;
  property_name: string;
  measurement_id?: string | null;
  status: string;
  last_sync_at?: string | null;
};

type Property = {
  property_id: string;
  property_name: string;
  measurement_id?: string | null;
};

export function IntegrationsClient({
  initialConnections,
  showPropertySelector,
  analyticsAllowed,
}: {
  initialConnections: Connection[];
  showPropertySelector: boolean;
  analyticsAllowed: boolean;
}) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [connectingPropertyId, setConnectingPropertyId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!showPropertySelector || !analyticsAllowed) return;
    void loadProperties();
  }, [showPropertySelector, analyticsAllowed]);

  async function loadProperties() {
    setLoadingProperties(true);
    setError("");
    const res = await fetch("/api/integrations/google-analytics/properties");
    const json = await res.json();
    setLoadingProperties(false);
    if (!res.ok) {
      setError(json.error?.message ?? "載入 GA Property 失敗");
      return;
    }
    setProperties(json.data ?? []);
  }

  async function connectProperty(property: Property) {
    setConnectingPropertyId(property.property_id);
    setError("");
    const res = await fetch("/api/integrations/google-analytics/properties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(property),
    });
    const json = await res.json();
    setConnectingPropertyId(null);
    if (!res.ok) {
      setError(json.error?.message ?? "連接 Property 失敗");
      return;
    }

    setConnections((prev) => [json.data, ...prev.filter((item) => item.id !== json.data.id)]);
    router.replace(`/analytics?connection_id=${json.data.id}`);
    router.refresh();
  }

  async function revokeConnection(id: string) {
    setRevokingId(id);
    setError("");
    const res = await fetch(`/api/integrations/google-analytics/connections/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    setRevokingId(null);
    if (!res.ok) {
      setError(json.error?.message ?? "撤銷授權失敗");
      return;
    }
    setConnections((prev) => prev.map((item) => (item.id === id ? { ...item, status: "revoked" } : item)));
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {showPropertySelector ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-medium text-amber-900">選擇要連接的 GA4 Property</div>
          <div className="mt-1 text-sm text-amber-800">
            OAuth 已完成，現在請從 Google 帳戶中挑一個 Property 建立連接。
          </div>
          <div className="mt-4 space-y-3">
            {loadingProperties ? (
              <div className="flex items-center gap-2 text-sm text-amber-900">
                <Loader2 className="h-4 w-4 animate-spin" /> 載入 Property 清單中...
              </div>
            ) : properties.length === 0 ? (
              <div className="rounded-md border border-dashed border-amber-300 p-4 text-sm text-amber-800">
                目前沒有可選 Property，或 pending OAuth token 已過期。請重新連接一次。
              </div>
            ) : (
              properties.map((property) => (
                <div key={property.property_id} className="flex items-center justify-between gap-3 rounded-md border bg-white p-4">
                  <div>
                    <div className="font-medium">{property.property_name}</div>
                    <div className="mt-1 text-sm text-neutral-500">{property.property_id}</div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void connectProperty(property)}
                    disabled={connectingPropertyId === property.property_id}
                  >
                    <Link2 className="h-4 w-4" />
                    {connectingPropertyId === property.property_id ? "連接中..." : "連接此 Property"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {connections.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">尚無已連接的 GA Property。</div>
        ) : (
          connections.map((connection) => (
            <div key={connection.id} className="rounded-md border p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{connection.property_name}</div>
                  <div className="mt-1 text-neutral-500">{connection.google_account_email}</div>
                  <div className="mt-1 text-neutral-500">{connection.property_id}</div>
                  <div className="mt-2 text-xs text-neutral-500">
                    status: {connection.status}
                    {connection.last_sync_at ? ` · last sync ${new Date(connection.last_sync_at).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/analytics?connection_id=${connection.id}`}>
                    <Button size="sm" variant="outline">查看 dashboard</Button>
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void revokeConnection(connection.id)}
                    disabled={connection.status === "revoked" || revokingId === connection.id}
                  >
                    <Trash2 className="h-4 w-4" />
                    {revokingId === connection.id ? "撤銷中..." : connection.status === "revoked" ? "已撤銷" : "撤銷"}
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
