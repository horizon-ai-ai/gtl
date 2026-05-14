"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SiteSection = {
  type: string;
  title?: string;
  body?: string;
  items?: Array<string | { title?: string; body?: string }>;
  button_label?: string;
};

type SiteVersion = {
  id: string;
  version: number;
  schema: {
    title?: string;
    tagline?: string;
    primary_color?: string;
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
  const [schema, setSchema] = useState<{
    title: string;
    tagline: string;
    primary_color: string;
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
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setStatus(json.error?.message ?? "建立網站失敗");
      return;
    }

    setStatus("網站草稿已建立");
    setForm(EMPTY_FORM);
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
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">網站建置</h1>
        <p className="mt-1 text-sm text-neutral-500">
          建立站點、編輯首頁 schema、預覽並正式發布公開網址。
        </p>
      </div>

      {status ? <div className="rounded-md border bg-neutral-50 px-4 py-3 text-sm">{status}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>建立網站</CardTitle>
            <CardDescription>輸入基本資訊後，先產生單頁式 landing page 草稿。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.generate_with_ai}
                onChange={(e) => setForm((v) => ({ ...v, generate_with_ai: e.target.checked }))}
              />
              以 AI 產生首頁草稿
            </label>
            <Button type="button" onClick={() => void createSite()} disabled={creating || !form.name.trim()}>
              {creating ? "建立中..." : "建立網站"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>我的站點</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                    className={`block w-full rounded-md border p-4 text-left ${selectedSiteId === site.id ? "border-neutral-900 bg-neutral-50" : ""}`}
                  >
                    <div className="font-medium">{site.name}</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      /s/{site.slug} · {site.status} · v{site.versions[0]?.version ?? 1}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {selectedSite ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{selectedSite.name}</CardTitle>
                  <CardDescription>編輯首頁草稿，儲存新版本，並切換發布狀態。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded bg-neutral-100 px-3 py-1 text-sm">{selectedSite.status}</span>
                    <Link href={`/sites/preview/${selectedSite.id}`} target="_blank" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
                      預覽草稿
                    </Link>
                    <Link href={`/sites/dns/${selectedSite.id}`} className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
                      DNS 設定
                    </Link>
                    {selectedSite.status === "published" ? (
                      <Link href={`/s/${selectedSite.slug}`} target="_blank" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
                        查看公開網站
                      </Link>
                    ) : null}
                    <Button type="button" variant="outline" onClick={() => void saveSite()} disabled={saving}>
                      {saving ? "儲存中..." : "儲存草稿"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void saveSite(selectedSite.status === "published" ? "draft" : "published")}
                      disabled={saving}
                    >
                      {saving ? "更新中..." : selectedSite.status === "published" ? "取消發布" : "發布網站"}
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="首頁標題">
                      <input
                        value={schema.title}
                        onChange={(e) => setSchema((prev) => ({ ...prev, title: e.target.value }))}
                        className="w-full rounded border px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="主色">
                      <input
                        value={schema.primary_color}
                        onChange={(e) => setSchema((prev) => ({ ...prev, primary_color: e.target.value }))}
                        className="w-full rounded border px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="公開網址">
                      <div className="rounded border bg-neutral-50 px-3 py-2 text-sm">/s/{selectedSite.slug}</div>
                    </Field>
                  </div>

                  <Field label="自訂網域">
                    <input
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="例如 www.example.com"
                      className="w-full rounded border px-3 py-2 text-sm"
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="SEO Title">
                      <input
                        value={schema.seo.title}
                        onChange={(e) =>
                          setSchema((prev) => ({ ...prev, seo: { ...prev.seo, title: e.target.value } }))
                        }
                        className="w-full rounded border px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field label="OG Image URL">
                      <input
                        value={schema.seo.og_image}
                        onChange={(e) =>
                          setSchema((prev) => ({ ...prev, seo: { ...prev.seo, og_image: e.target.value } }))
                        }
                        className="w-full rounded border px-3 py-2 text-sm"
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
                        className="w-full rounded border px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>

                  <Field label="SEO Description">
                    <textarea
                      value={schema.seo.description}
                      onChange={(e) =>
                        setSchema((prev) => ({ ...prev, seo: { ...prev.seo, description: e.target.value } }))
                      }
                      className="min-h-24 w-full rounded border px-3 py-2 text-sm"
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
                      className="w-full rounded border px-3 py-2 text-sm"
                    />
                  </Field>

                  <div className="rounded-md border bg-neutral-50 p-4 text-sm text-neutral-600">
                    Custom domain 結構已可保存於站點資料。下一步若要正式對外，需再補 DNS 驗證與 host routing。
                  </div>

                  <Field label="首頁副標">
                    <textarea
                      value={schema.tagline}
                      onChange={(e) => setSchema((prev) => ({ ...prev, tagline: e.target.value }))}
                      className="min-h-24 w-full rounded border px-3 py-2 text-sm"
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Section Editor</CardTitle>
                  <CardDescription>直接編輯每個區塊的標題、內文、項目與按鈕。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {schema.sections.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">目前沒有 sections。</div>
                  ) : (
                    schema.sections.map((section, index) => (
                      <div key={`${section.type}-${index}`} className="rounded-md border p-4 space-y-3">
                        <div className="text-xs uppercase text-neutral-500">{section.type}</div>
                        <Field label="標題">
                          <input
                            value={section.title ?? ""}
                            onChange={(e) => updateSection(index, { title: e.target.value })}
                            className="w-full rounded border px-3 py-2 text-sm"
                          />
                        </Field>
                        <Field label="內文">
                          <textarea
                            value={section.body ?? ""}
                            onChange={(e) => updateSection(index, { body: e.target.value })}
                            className="min-h-24 w-full rounded border px-3 py-2 text-sm"
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
                            className="min-h-24 w-full rounded border px-3 py-2 text-sm"
                          />
                        </Field>
                        <Field label="按鈕文字">
                          <input
                            value={section.button_label ?? ""}
                            onChange={(e) => updateSection(index, { button_label: e.target.value })}
                            className="w-full rounded border px-3 py-2 text-sm"
                          />
                        </Field>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}
