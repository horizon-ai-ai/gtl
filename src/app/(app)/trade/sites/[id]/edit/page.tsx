import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertTradeSiteBuilderAccess } from "@/lib/trade";
import type { SiteSchema } from "@/lib/site-builder";
import { TradeSitePuckEditor } from "./trade-site-puck-editor";

export default async function TradeSiteVisualEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  await assertTradeSiteBuilderAccess(session.user.id);

  const site = await prisma.site.findFirst({
    where: {
      id: params.id,
      user_id: session.user.id,
      deleted_at: null,
    },
    include: {
      versions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  if (!site) {
    notFound();
  }

  const currentVersion = site.versions[0];
  const schema = ((currentVersion?.schema ?? {}) as SiteSchema) || ({} as SiteSchema);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6">
      <section className="rounded-[28px] border border-neutral-200 bg-[linear-gradient(135deg,_#ffffff,_#f7f3ec)] px-8 py-7 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
              <Sparkles className="h-3.5 w-3.5" />
              Puck Visual Editor
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">{site.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-600">
                這裡是商品頁的可視化編輯畫布。AI 先生成 section 草稿，你可以直接改文案、替換圖片欄位與調整內容節奏，
                再回到 Seller workflow 發布並綁定到商品。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
              <span>/s/{site.slug}</span>
              <span>·</span>
              <span>{site.status === "published" ? "已發布" : "草稿中"}</span>
              <span>·</span>
              <span>v{currentVersion?.version ?? 1}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/trade/sites"
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-white"
            >
              回商品頁建置
            </Link>
            <Link
              href={`/sites/preview/${site.id}`}
              target="_blank"
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-white"
            >
              預覽草稿
            </Link>
            {site.status === "published" ? (
              <Link
                href={`/s/${site.slug}`}
                target="_blank"
                className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
              >
                查看公開網站
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <TradeSitePuckEditor
        siteId={site.id}
        siteName={site.name}
        siteStatus={site.status}
        previewUrl={`/sites/preview/${site.id}`}
        publicUrl={`/s/${site.slug}`}
        initialSchema={schema}
      />
    </div>
  );
}
