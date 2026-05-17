"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Puck } from "@measured/puck";
import "@measured/puck/puck.css";
import type { SiteSchema } from "@/lib/site-builder";
import { puckDataToSiteSchema, sitePuckConfig, siteSchemaToPuckData } from "@/lib/site-puck";

type PuckDataShape = ReturnType<typeof siteSchemaToPuckData>;

export function TradeSitePuckEditor({
  siteId,
  siteName,
  siteStatus,
  previewUrl,
  publicUrl,
  initialSchema,
}: {
  siteId: string;
  siteName: string;
  siteStatus: string;
  previewUrl: string;
  publicUrl: string;
  initialSchema: SiteSchema;
}) {
  const [status, setStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<PuckDataShape>(() => siteSchemaToPuckData(initialSchema));
  const schemaRef = useRef<SiteSchema>(initialSchema);

  const isPublished = useMemo(() => siteStatus === "published", [siteStatus]);

  async function persist(nextData: PuckDataShape, publish?: boolean) {
    setSaving(true);
    setStatus("");

    const nextSchema = puckDataToSiteSchema(schemaRef.current, nextData);

    const res = await fetch(`/api/sites/${siteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schema: nextSchema,
        status: publish ? "published" : undefined,
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setStatus(json.error?.message ?? "儲存視覺編輯內容失敗");
      return;
    }

    schemaRef.current = nextSchema;
    setStatus(publish ? "視覺編輯內容已發布" : "視覺編輯內容已儲存");
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 rounded-[24px] border border-neutral-200 bg-white px-5 py-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="text-lg font-semibold text-neutral-950">可視化編排</div>
          <p className="text-sm leading-6 text-neutral-600">
            這裡先用 Puck 接第一版視覺編輯。適合用來快速調整 hero、亮點、規格與 CTA，不必回 schema 表單逐欄修改。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={previewUrl}
            target="_blank"
            className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            預覽草稿
          </Link>
          {isPublished ? (
            <Link
              href={publicUrl}
              target="_blank"
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              查看公開網站
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void persist(data)}
            disabled={saving}
            className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "儲存中..." : "儲存草稿"}
          </button>
          <button
            type="button"
            onClick={() => void persist(data, true)}
            disabled={saving}
            className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "發布中..." : "儲存並發布"}
          </button>
        </div>
      </section>

      {status ? <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{status}</div> : null}

      <div className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <Puck
          config={sitePuckConfig}
          data={data}
          onChange={(nextData) => setData(nextData as PuckDataShape)}
          headerTitle={`${siteName} 視覺編輯`}
          headerPath="Trade -> 商品頁建置 -> 視覺編輯"
        />
      </div>
    </div>
  );
}
