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
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editorTab, setEditorTab] = useState<"overview" | "sections">("overview");
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

  useEffect(() => {
    void loadSites();
  }, []);

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
                  {sites.filter((site) => site.status === "published").length}
                </div>
                <div className="mt-1 text-sm text-neutral-500">可直接對外開啟的網站</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/85 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">自訂網域</div>
                <div className="mt-2 text-3xl font-semibold text-neutral-950">
                  {sites.filter((site) => Boolean(site.custom_domain)).length}
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
          左側快速建立新站點，右側集中管理站點列表、頁面設定與 section schema。
        </p>
      </div>

      {status ? <div className="rounded-md border bg-neutral-50 px-4 py-3 text-sm">{status}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.88fr,1.12fr]">
        <Card className="overflow-hidden rounded-[24px] border-neutral-200 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <CardHeader className="border-b border-neutral-100 bg-neutral-50/80">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>建立網站</CardTitle>
                <CardDescription>輸入基本資訊後，先產生單頁式 landing page 草稿。</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <Field label="品牌/網站名稱">
              <input value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} className="w-full rounded border px-3 py-2 text-sm" />
            </Field>
            <Field label="網站描述">
              <textarea value={form.description} onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))} className="min-h-24 w-full rounded border px-3 py-2 text-sm" />
            </Field>
            <Field label="產業">
              <input value={form.industry} onChange={(e) => setForm((v) => ({ ...v, industry: e.target.value }))} className="w-full rounded border px-3 py-2 text-sm" />
            </Field>
            <Field label="目標客群">
              <input value={form.audience} onChange={(e) => setForm((v) => ({ ...v, audience: e.target.value }))} className="w-full rounded border px-3 py-2 text-sm" />
            </Field>
            <Field label="網站目標">
              <input value={form.goal} onChange={(e) => setForm((v) => ({ ...v, goal: e.target.value }))} className="w-full rounded border px-3 py-2 text-sm" />
            </Field>
            <Field label="商品補充說明">
              <textarea
                value={form.product_notes}
                onChange={(e) => setForm((v) => ({ ...v, product_notes: e.target.value }))}
                placeholder="輸入少量商品描述、主要特色、產地、賣點即可，AI 會用這些資訊搭配商品圖生成一頁式商品網站。"
                className="min-h-28 w-full rounded border px-3 py-2 text-sm"
              />
            </Field>
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
                  用戶上傳商品圖後，系統會先做商品辨識，再和你輸入的簡短文字一起生成一頁式商品網站。頁尾會固定掛上「立即詢價」CTA。
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
                ) : null}
              </div>
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
          </CardContent>
        </Card>

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
              <CardHeader className="border-b border-neutral-100 bg-neutral-50/70">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
                      <PencilRuler className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle>{selectedSite.name}</CardTitle>
                      <CardDescription>編輯首頁草稿、section 內容、追蹤碼與自訂網域設定。</CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm font-medium">
                      {selectedSite.status}
                    </span>
                    <Link href={`/sites/preview/${selectedSite.id}`} target="_blank" className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50">
                      預覽草稿
                    </Link>
                    <Link href={`/sites/dns/${selectedSite.id}`} className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50">
                      DNS 設定
                    </Link>
                    {selectedSite.status === "published" ? (
                      <Link href={`/s/${selectedSite.slug}`} target="_blank" className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50">
                        查看公開網站
                      </Link>
                    ) : null}
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
                </div>
              </CardHeader>

              <CardContent className="space-y-6 p-6">
                <div className="inline-flex rounded-2xl border border-neutral-200 bg-neutral-50 p-1">
                  <button
                    type="button"
                    onClick={() => setEditorTab("overview")}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      editorTab === "overview" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                    }`}
                  >
                    概覽設定
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("sections")}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      editorTab === "sections" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"
                    }`}
                  >
                    Section Editor
                  </button>
                </div>

                {editorTab === "overview" ? (
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
                  </div>
                ) : (
                  <div className="space-y-4">
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
              </CardContent>
            </Card>
          ) : null}
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
