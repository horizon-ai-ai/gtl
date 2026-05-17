"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Globe2, LayoutTemplate, PencilRuler, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SiteSection = {
  type: string;
  title?: string;
  body?: string;
  image_url?: string;
  items?: Array<string | { title?: string; body?: string; image_url?: string }>;
  button_label?: string;
};

type SiteVersion = {
  id: string;
  version: number;
  schema: {
    title?: string;
    tagline?: string;
    primary_color?: string;
    product_images?: string[];
    inquiry_cta_label?: string;
    inquiry_cta_note?: string;
    seo?: {
      title?: string;
      description?: string;
      og_image?: string;
    };
    integrations?: {
      ga_measurement_id?: string;
      meta_pixel_id?: string;
    };
    sections?: SiteSection[];
  };
};

type Site = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  custom_domain: string | null;
  current_version_id: string | null;
  versions: SiteVersion[];
};

type TradeAccess = {
  allowed: boolean;
  site_builder_allowed: boolean;
  seller_allowed: boolean;
  profile_exists: boolean;
  profile_verified: boolean;
  reason: "buyer_ready" | "seller_plan_locked" | "profile_missing" | "profile_pending_review" | "ready";
};

const EMPTY_FORM = {
  name: "",
  description: "",
  industry: "",
  audience: "",
  goal: "",
  product_notes: "",
  generate_with_ai: true,
};

function formatSectionItems(items: SiteSection["items"]) {
  return (items ?? [])
    .map((item) => {
      if (typeof item === "string") return item;

      const title = item.title?.trim() ?? "";
      const body = item.body?.trim() ?? "";

      if (title && body) return `${title}: ${body}`;
      return title || body;
    })
    .filter(Boolean)
    .join("\n");
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessLoading, setAccessLoading] = useState(true);
  const [tradeAccess, setTradeAccess] = useState<TradeAccess | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [workspaceTab, setWorkspaceTab] = useState<"create" | "overview" | "sections">("create");
  const [siteImages, setSiteImages] = useState<File[]>([]);
  const [schema, setSchema] = useState<{
    title: string;
    tagline: string;
    primary_color: string;
    product_images?: string[];
    inquiry_cta_label?: string;
    inquiry_cta_note?: string;
    seo: { title: string; description: string; og_image: string };
    integrations: { ga_measurement_id: string; meta_pixel_id: string };
    sections: SiteSection[];
  }>({
    title: "",
    tagline: "",
    primary_color: "#171717",
    seo: { title: "", description: "", og_image: "" },
    integrations: { ga_measurement_id: "", meta_pixel_id: "" },
    sections: [],
  });
  const [customDomain, setCustomDomain] = useState("");

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );
  const publishedCount = useMemo(
    () => sites.filter((site) => site.status === "published").length,
    [sites],
  );
  const customDomainCount = useMemo(
    () => sites.filter((site) => Boolean(site.custom_domain)).length,
    [sites],
  );

  useEffect(() => {
    void (async () => {
      await loadTradeAccess();
    })();
  }, []);

  useEffect(() => {
    if (selectedSite && workspaceTab === "create") {
      setWorkspaceTab("overview");
    }
  }, [selectedSite, workspaceTab]);

  useEffect(() => {
    if (!selectedSite && sites.length > 0) {
      setSelectedSiteId(sites[0].id);
      return;
    }

    if (!selectedSite) return;
    const currentSchema = selectedSite.versions[0]?.schema ?? {};
    setSchema({
      title: currentSchema.title ?? selectedSite.name,
      tagline: currentSchema.tagline ?? selectedSite.description ?? "",
      primary_color: currentSchema.primary_color ?? "#171717",
      product_images: Array.isArray(currentSchema.product_images) ? currentSchema.product_images : [],
      inquiry_cta_label:
        typeof currentSchema.inquiry_cta_label === "string" ? currentSchema.inquiry_cta_label : "立即詢價",
      inquiry_cta_note:
        typeof currentSchema.inquiry_cta_note === "string"
          ? currentSchema.inquiry_cta_note
          : "想了解這個商品的報價、MOQ 或合作方式，歡迎立即詢價。",
      seo: {
        title: currentSchema.seo?.title ?? currentSchema.title ?? selectedSite.name,
        description: currentSchema.seo?.description ?? currentSchema.tagline ?? selectedSite.description ?? "",
        og_image: currentSchema.seo?.og_image ?? "",
      },
      integrations: {
        ga_measurement_id: currentSchema.integrations?.ga_measurement_id ?? "",
        meta_pixel_id: currentSchema.integrations?.meta_pixel_id ?? "",
      },
      sections: Array.isArray(currentSchema.sections) ? currentSchema.sections : [],
    });
    setCustomDomain(selectedSite.custom_domain ?? "");
  }, [selectedSite, sites]);

  async function loadSites() {
    setLoading(true);
    const res = await fetch("/api/sites");
    const json = await res.json();
    if (res.ok) {
      const nextSites = (json.data ?? []) as Site[];
      setSites(nextSites);
      setSelectedSiteId((current) => current ?? nextSites[0]?.id ?? null);
    }
    setLoading(false);
  }

  async function createSite() {
    setCreating(true);
    setStatus("");
    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("industry", form.industry);
    formData.set("audience", form.audience);
    formData.set("goal", form.goal);
    formData.set("product_notes", form.product_notes);
    formData.set("generate_with_ai", String(form.generate_with_ai));
    siteImages.forEach((file) => formData.append("images", file));

    const res = await fetch("/api/sites", {
      method: "POST",
      body: formData,
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setStatus(json.error?.message ?? "建立網站失敗");
      return;
    }

    setStatus("網站草稿已建立");
    setForm(EMPTY_FORM);
    setSiteImages([]);
    await loadSites();
    setSelectedSiteId((json.data as Site).id);
    setWorkspaceTab("overview");
  }

  async function saveSite(nextStatus?: "draft" | "published") {
    if (!selectedSite) return;
    setSaving(true);
    setStatus("");

    const res = await fetch(`/api/sites/${selectedSite.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selectedSite.name,
        description: selectedSite.description,
        status: nextStatus,
        custom_domain: customDomain || null,
        schema,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setStatus(json.error?.message ?? "更新網站失敗");
      return;
    }

    setStatus(nextStatus ? "網站狀態已更新" : "網站草稿已儲存");
    await loadSites();
    setSelectedSiteId((json.data as Site).id);
  }

  function updateSection(index: number, patch: Partial<SiteSection>) {
    setSchema((prev) => ({
      ...prev,
      sections: prev.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    }));
  }

  async function loadTradeAccess() {
    setAccessLoading(true);
    const res = await fetch("/api/trade/access");
    const json = await res.json();
    const nextAccess = (json.data ??
      {
        allowed: false,
        site_builder_allowed: false,
        seller_allowed: false,
        profile_exists: false,
        profile_verified: false,
        reason: "seller_plan_locked",
      }) as TradeAccess;
    setTradeAccess(nextAccess);
    setAccessLoading(false);

    if (nextAccess.site_builder_allowed) {
      await loadSites();
      return;
    }

    setLoading(false);
  }

  if (accessLoading) {
    return <div className="mx-auto max-w-6xl p-8 text-sm text-neutral-500">載入網站建置工作台中...</div>;
  }

  if (!tradeAccess?.site_builder_allowed) {
    return (
      <div className="mx-auto max-w-5xl space-y-8 p-8">
        <section className="overflow-hidden rounded-[28px] border border-neutral-200 bg-[linear-gradient(135deg,_#ffffff,_#f6f8fb)] shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="grid gap-8 px-8 py-9 lg:grid-cols-[1.25fr,0.9fr]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-neutral-600">
                <Sparkles className="h-3.5 w-3.5" />
                Trade Seller Workflow
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">
                  建網站已整合進 Trade 賣家工作流
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-neutral-600">
                  這裡不是獨立模組，而是 Trade 裡的商品頁建置工作台。只要你已升級到 trade 方案，就可以先測試建站、
                  上傳商品圖、用 AI 生成一頁式商品頁；真正需要身份審核的是商品上架與 seller 操作。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/trade" className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white hover:bg-neutral-800">
                  回到貿易模組
                </Link>
                <Link href="/billing" className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50">
                  升級成賣家
                </Link>
              </div>
            </div>

            <div className="rounded-[24px] border border-neutral-900 bg-neutral-950 p-5 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">啟用條件</div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-white/75">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  1. 訂閱包含 `trade_module` 的方案
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  2. 可先建立商品頁並測試視覺編輯
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  3. 商品上架與 seller quotation 才需要身份審核
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.05)] md:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
            <div className="text-sm font-semibold text-neutral-950">你現在能做的</div>
            <p className="mt-2 text-sm leading-6 text-neutral-600">瀏覽市場商品、送出詢價、收 buyer quotation，先熟悉貿易流程。</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
              <div className="text-sm font-semibold text-neutral-950">成為賣家後能做的</div>
              <p className="mt-2 text-sm leading-6 text-neutral-600">建立商品、把 landing page 綁到商品、管理 seller quotation、接買家詢價。</p>
            </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
            <div className="text-sm font-semibold text-neutral-950">後續編輯方式</div>
            <p className="mt-2 text-sm leading-6 text-neutral-600">AI 先生成商品頁草稿，之後再接 Puck 進可視化畫布編排。</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <section className="overflow-hidden rounded-[28px] border border-neutral-200 bg-gradient-to-br from-white via-[#f7f3ec] to-[#f2efe8] shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
        <div className="grid gap-6 px-8 py-8 lg:grid-cols-[1.35fr,0.95fr] lg:px-10">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
              <Globe2 className="h-3.5 w-3.5" />
              Site Builder
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-neutral-950 md:text-4xl">
                網站建置工作台
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-neutral-600 md:text-[15px]">
                建立品牌站點、生成首頁草稿、調整公開設定與追蹤碼，最後再發布到公開網址或自訂網域。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white/85 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">站點總數</div>
                <div className="mt-2 text-3xl font-semibold text-neutral-950">{sites.length}</div>
                <div className="mt-1 text-sm text-neutral-500">包含草稿與已發布站點</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/85 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">已發布</div>
                <div className="mt-2 text-3xl font-semibold text-neutral-950">
                  {publishedCount}
                </div>
                <div className="mt-1 text-sm text-neutral-500">可直接對外開啟的網站</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/85 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">自訂網域</div>
                <div className="mt-2 text-3xl font-semibold text-neutral-950">
                  {customDomainCount}
                </div>
                <div className="mt-1 text-sm text-neutral-500">已設定 custom domain 的站點</div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-neutral-900 bg-neutral-950 p-5 text-white shadow-[0_18px_48px_rgba(15,23,42,0.24)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">目前編輯站點</div>
                <div className="mt-3 text-xl font-semibold">{selectedSite?.name ?? "尚未選擇"}</div>
                <div className="mt-1 text-sm text-white/60">
                  {selectedSite ? `/s/${selectedSite.slug}` : "先從右側清單選一個站點"}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">目前狀態</div>
                <div className="mt-3 text-xl font-semibold">
                  {selectedSite?.status === "published" ? "已發布" : selectedSite ? "草稿中" : "待建立"}
                </div>
                <div className="mt-1 text-sm text-white/60">
                  {selectedSite ? `v${selectedSite.versions[0]?.version ?? 1}` : "建立後可生成首頁草稿"}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/70">
              建議流程：先建立網站草稿，再從右側清單選站點，於「概覽設定」更新 SEO、追蹤碼與網址，最後切到
              「Section Editor」微調首頁內容。
            </div>
          </div>
        </div>
      </section>

      <div>
        <h2 className="text-xl font-semibold text-neutral-950">網站編輯區</h2>
        <p className="mt-1 text-sm text-neutral-500">
          先建立 AI 草稿，再切到站點設定與內容編輯。工作區拆開後，流程會更像正式建站產品。
        </p>
      </div>

      {status ? <div className="rounded-md border bg-neutral-50 px-4 py-3 text-sm">{status}</div> : null}

      <section className="grid gap-4 rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.05)] md:grid-cols-4">
        {[
          {
            step: "01",
            title: "上傳商品素材",
            body: "用戶通常只想給圖片、商品名和幾句賣點，希望先快速變成像樣的一頁式商品頁。",
          },
          {
            step: "02",
            title: "AI 生成草稿",
            body: "系統應該自動生成完整頁面結構，而不是只吐幾段文案。這一步最怕結果過度通用、沒有商品感。",
          },
          {
            step: "03",
            title: "直接視覺編輯",
            body: "用戶預期能看到頁面並立即改字、換圖、調順序。這也是接 Puck 最自然的落點。",
          },
          {
            step: "04",
            title: "確認發布與串接貿易",
            body: "最後要拿到可用網址，並能和商品資料關聯，讓市場商品與 landing page 是同一套故事。",
          },
        ].map((item) => (
          <div key={item.step} className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{item.step}</div>
            <div className="mt-3 text-base font-semibold text-neutral-950">{item.title}</div>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{item.body}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px,minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="overflow-hidden rounded-[24px] border-neutral-200 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <CardHeader className="border-b border-neutral-100 bg-neutral-50/70">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                  <LayoutTemplate className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>我的站點</CardTitle>
                  <CardDescription>先從清單選擇一個站點，再切換到右下方編輯內容。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              <div className="grid gap-3">
                <Button type="button" className="h-11 rounded-xl" onClick={() => setWorkspaceTab("create")}>
                  建立新草稿
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => setWorkspaceTab("overview")}
                  disabled={!selectedSite}
                >
                  站點設定
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => setWorkspaceTab("sections")}
                  disabled={!selectedSite}
                >
                  內容編輯
                </Button>
              </div>
              {loading ? (
                <div className="text-sm text-neutral-500">載入中...</div>
              ) : sites.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">尚無站點</div>
              ) : (
                sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => setSelectedSiteId(site.id)}
                    className={`block w-full rounded-2xl border p-4 text-left transition ${
                      selectedSiteId === site.id
                        ? "border-neutral-900 bg-neutral-50 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
                        : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-neutral-950">{site.name}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          /s/{site.slug} · {site.status} · v{site.versions[0]?.version ?? 1}
                        </div>
                      </div>
                      <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                        {site.status}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
          {selectedSite ? (
            <Card className="overflow-hidden rounded-[24px] border-neutral-200 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
              <CardHeader className="border-b border-neutral-100 bg-neutral-950 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">目前編輯站點</div>
                    <div className="mt-2 text-2xl font-semibold">{selectedSite.name}</div>
                    <div className="mt-1 text-sm text-white/70">
                      /s/{selectedSite.slug} · {selectedSite.status} · v{selectedSite.versions[0]?.version ?? 1}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/sites/preview/${selectedSite.id}`} target="_blank" className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/90 hover:bg-white/10">
                      預覽草稿
                    </Link>
                    <Link href={`/trade/sites/${selectedSite.id}/edit`} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/90 hover:bg-white/10">
                      視覺編輯
                    </Link>
                    <Link href={`/sites/dns/${selectedSite.id}`} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/90 hover:bg-white/10">
                      DNS 設定
                    </Link>
                    {selectedSite.status === "published" ? (
                      <Link href={`/s/${selectedSite.slug}`} target="_blank" className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/90 hover:bg-white/10">
                        查看公開網站
                      </Link>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden rounded-[24px] border-neutral-200 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
            <CardHeader className="border-b border-neutral-100 bg-neutral-50/80">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                  {workspaceTab === "create" ? <Sparkles className="h-5 w-5" /> : <PencilRuler className="h-5 w-5" />}
                </div>
                <div>
                  <CardTitle>
                    {workspaceTab === "create"
                      ? "建立網站草稿"
                      : workspaceTab === "overview"
                        ? "站點設定"
                        : "頁面內容編輯"}
                  </CardTitle>
                  <CardDescription>
                    {workspaceTab === "create"
                      ? "先上傳商品圖和幾句文字，讓 AI 幫你生成一頁式商品頁草稿。"
                      : workspaceTab === "overview"
                        ? "整理站點標題、SEO、網址、CTA 與追蹤碼。"
                        : "微調首頁 sections，這裡會是後續接 Puck 視覺編輯器的主要工作區。"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              <div className="inline-flex rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
                {[
                  { key: "create", label: "建立草稿" },
                  { key: "overview", label: "站點設定" },
                  { key: "sections", label: "內容編輯" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setWorkspaceTab(tab.key as "create" | "overview" | "sections")}
                    disabled={!selectedSite && tab.key !== "create"}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      workspaceTab === tab.key ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {workspaceTab === "create" ? (
                <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
                  <div className="space-y-4">
                    <Field label="品牌/網站名稱">
                      <input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm" />
                    </Field>
                    <Field label="網站描述">
                      <textarea value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} className="min-h-24 w-full rounded-xl border px-3 py-2.5 text-sm" />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="產業">
                        <input value={form.industry} onChange={(e) => setForm((v) => ({ ...v, industry: e.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm" />
                      </Field>
                      <Field label="目標客群">
                        <input value={form.audience} onChange={(e) => setForm((v) => ({ ...v, audience: e.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm" />
                      </Field>
                    </div>
                    <Field label="網站目標">
                      <input value={form.goal} onChange={(e) => setForm((v) => ({ ...v, goal: e.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm" />
                    </Field>
                    <Field label="商品補充說明">
                      <textarea
                        value={form.product_notes}
                        onChange={(e) => setForm((v) => ({ ...v, product_notes: e.target.value }))}
                        placeholder="輸入少量商品描述、主要特色、產地、賣點即可，AI 會用這些資訊搭配商品圖生成一頁式商品網站。"
                        className="min-h-28 w-full rounded-xl border px-3 py-2.5 text-sm"
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.generate_with_ai}
                        onChange={(e) => setForm((v) => ({ ...v, generate_with_ai: e.target.checked }))}
                      />
                      以 AI 產生首頁草稿
                    </label>
                    <Button type="button" className="h-11 rounded-xl px-5" onClick={() => void createSite()} disabled={creating || !form.name.trim()}>
                      {creating ? "建立中..." : "建立網站"}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <Field label="商品圖片">
                      <div className="space-y-3">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => setSiteImages(Array.from(e.target.files ?? []).slice(0, 6))}
                          className="block w-full rounded-xl border border-dashed border-neutral-300 bg-white px-3 py-3 text-sm"
                        />
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-600">
                          這裡的核心預期是：用戶只傳商品圖和幾句話，就能自動得到一頁式商品 landing page，最底下會固定掛上「立即詢價」CTA。
                        </div>
                        {siteImages.length > 0 ? (
                          <div className="grid grid-cols-3 gap-3">
                            {siteImages.map((file, index) => (
                              <div key={`${file.name}-${index}`} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={URL.createObjectURL(file)} alt={file.name} className="aspect-square h-full w-full object-cover" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-500">
                            上傳 1~6 張商品圖，AI 會優先用這些素材組出 hero、gallery 與商品亮點區塊。
                          </div>
                        )}
                      </div>
                    </Field>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                      <div className="font-semibold">目前最容易出現的斷點</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li>用戶以為一生成就能直接拿去上架商品，但實際上還需要回站點工作區微調與發布。</li>
                        <li>站點和貿易商品目前仍是兩個工作流，尚未做到「商品建立時直接綁定 landing page」。</li>
                        <li>目前編輯仍是 schema / section 型式，真正的可視化拖拉編輯會由 Puck 接手。</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : !selectedSite ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-sm text-neutral-500">
                  先建立一個站點草稿，或從左側清單選擇現有站點，再進行設定與內容編輯。
                </div>
              ) : workspaceTab === "overview" ? (
                <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="首頁標題">
                        <input
                          value={schema.title}
                          onChange={(e) => setSchema((prev) => ({ ...prev, title: e.target.value }))}
                          className="w-full rounded-xl border px-3 py-2.5 text-sm"
                        />
                      </Field>
                      <Field label="主色">
                        <input
                          value={schema.primary_color}
                          onChange={(e) => setSchema((prev) => ({ ...prev, primary_color: e.target.value }))}
                          className="w-full rounded-xl border px-3 py-2.5 text-sm"
                        />
                      </Field>
                    <Field label="公開網址">
                      <div className="rounded-xl border bg-neutral-50 px-3 py-2.5 text-sm">/s/{selectedSite.slug}</div>
                    </Field>
                  </div>

                  {schema.product_images?.length ? (
                    <div className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">商品主視覺</div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {schema.product_images.slice(0, 3).map((imageUrl, index) => (
                          <div key={`${imageUrl}-${index}`} className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={imageUrl} alt={`商品圖 ${index + 1}`} className="aspect-[4/3] h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <Field label="首頁副標">
                    <textarea
                        value={schema.tagline}
                        onChange={(e) => setSchema((prev) => ({ ...prev, tagline: e.target.value }))}
                        className="min-h-24 w-full rounded-xl border px-3 py-2.5 text-sm"
                      />
                    </Field>

                    <Field label="自訂網域">
                      <input
                        value={customDomain}
                        onChange={(e) => setCustomDomain(e.target.value)}
                        placeholder="例如 www.example.com"
                        className="w-full rounded-xl border px-3 py-2.5 text-sm"
                      />
                    </Field>

                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="SEO Title">
                        <input
                          value={schema.seo.title}
                          onChange={(e) =>
                            setSchema((prev) => ({ ...prev, seo: { ...prev.seo, title: e.target.value } }))
                          }
                          className="w-full rounded-xl border px-3 py-2.5 text-sm"
                        />
                      </Field>
                      <Field label="OG Image URL">
                        <input
                          value={schema.seo.og_image}
                          onChange={(e) =>
                            setSchema((prev) => ({ ...prev, seo: { ...prev.seo, og_image: e.target.value } }))
                          }
                          className="w-full rounded-xl border px-3 py-2.5 text-sm"
                        />
                      </Field>
                      <Field label="GA Measurement ID">
                        <input
                          value={schema.integrations.ga_measurement_id}
                          onChange={(e) =>
                            setSchema((prev) => ({
                              ...prev,
                              integrations: { ...prev.integrations, ga_measurement_id: e.target.value },
                            }))
                          }
                          placeholder="G-XXXXXXXXXX"
                          className="w-full rounded-xl border px-3 py-2.5 text-sm"
                        />
                      </Field>
                    </div>

                    <Field label="SEO Description">
                      <textarea
                        value={schema.seo.description}
                        onChange={(e) =>
                          setSchema((prev) => ({ ...prev, seo: { ...prev.seo, description: e.target.value } }))
                        }
                        className="min-h-24 w-full rounded-xl border px-3 py-2.5 text-sm"
                      />
                    </Field>

                    <Field label="Meta Pixel ID">
                      <input
                        value={schema.integrations.meta_pixel_id}
                        onChange={(e) =>
                          setSchema((prev) => ({
                            ...prev,
                            integrations: { ...prev.integrations, meta_pixel_id: e.target.value },
                          }))
                        }
                        placeholder="1234567890"
                        className="w-full rounded-xl border px-3 py-2.5 text-sm"
                      />
                    </Field>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="底部 CTA 按鈕">
                        <input
                          value={schema.inquiry_cta_label ?? "立即詢價"}
                          onChange={(e) => setSchema((prev) => ({ ...prev, inquiry_cta_label: e.target.value }))}
                          className="w-full rounded-xl border px-3 py-2.5 text-sm"
                        />
                      </Field>
                      <Field label="CTA 說明">
                        <input
                          value={schema.inquiry_cta_note ?? ""}
                          onChange={(e) => setSchema((prev) => ({ ...prev, inquiry_cta_note: e.target.value }))}
                          className="w-full rounded-xl border px-3 py-2.5 text-sm"
                        />
                      </Field>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">
                      Custom domain 結構已可保存於站點資料。下一步若要正式對外，需再補 DNS 驗證與 host routing。
                    </div>

                    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-sky-900">
                      如果你想直接在畫面上拖拉與改字，下一步請進「視覺編輯」。這一層會由 Puck 接手，適合在 AI 生成草稿後做快速微調。
                      <div className="mt-3">
                        <Link
                          href={`/trade/sites/${selectedSite.id}/edit`}
                          className="inline-flex rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100"
                        >
                          打開 Puck 視覺編輯
                        </Link>
                      </div>
                    </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-sky-900">
                    下一步接 Puck 時，這裡會變成真正的可視化畫布。現在先保留 section 結構化編輯，讓 AI 草稿、儲存版本與公開渲染都共用同一份 schema。
                  </div>
                  {schema.sections.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-8 text-sm text-neutral-500">目前沒有 sections。</div>
                  ) : (
                    schema.sections.map((section, index) => (
                      <div key={`${section.type}-${index}`} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
                            {section.type}
                          </div>
                          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-500">
                            section {index + 1}
                          </span>
                        </div>
                        <Field label="標題">
                          <input
                            value={section.title ?? ""}
                            onChange={(e) => updateSection(index, { title: e.target.value })}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm"
                          />
                        </Field>
                        <Field label="內文">
                          <textarea
                            value={section.body ?? ""}
                            onChange={(e) => updateSection(index, { body: e.target.value })}
                            className="min-h-24 w-full rounded-xl border px-3 py-2.5 text-sm"
                          />
                        </Field>
                        <Field label="項目（每行一個）">
                          <textarea
                            value={formatSectionItems(section.items)}
                            onChange={(e) =>
                              updateSection(index, {
                                items: e.target.value
                                  .split("\n")
                                  .map((item) => item.trim())
                                  .filter(Boolean),
                              })
                            }
                            className="min-h-24 w-full rounded-xl border px-3 py-2.5 text-sm"
                          />
                        </Field>
                        <Field label="按鈕文字">
                          <input
                            value={section.button_label ?? ""}
                            onChange={(e) => updateSection(index, { button_label: e.target.value })}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm"
                          />
                        </Field>
                      </div>
                    ))
                  )}
                </div>
              )}

              {selectedSite ? (
                <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-6">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => void saveSite()} disabled={saving}>
                    {saving ? "儲存中..." : "儲存草稿"}
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    onClick={() => void saveSite(selectedSite.status === "published" ? "draft" : "published")}
                    disabled={saving}
                  >
                    {saving ? "更新中..." : selectedSite.status === "published" ? "取消發布" : "發布網站"}
                  </Button>
                </div>
              ) : null}
              </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">{label}</div>
      {children}
    </div>
  );
}
