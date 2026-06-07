import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrandWatermark } from "@/components/app/brand-watermark";

export default function Landing() {
  const host = headers().get("host") ?? "";
  if (host.endsWith(":3001")) {
    redirect("/admin");
  }

  const pillars = [
    {
      key: "generate",
      title: "Generate",
      cn: "設計",
      tagline: "系統化、創造、生成",
      body: "從品牌 Logo、VI、DM、簡報、社群圖文到一頁式網站，與 AI 對話完成設計交付。",
      colorClass: "text-generate-500",
      dotStyle: { background: "var(--g3-generate-300)" },
    },
    {
      key: "growth",
      title: "Growth",
      cn: "行銷",
      tagline: "數據、邏輯推動、行銷決策",
      body: "SEO 文章、社群文案、整年度行銷策略與 GA4 分析，AI 幫您把資料變成決策。",
      colorClass: "text-growth-500",
      dotStyle: { background: "var(--g3-growth-300)" },
    },
    {
      key: "global",
      title: "Global",
      cn: "貿易",
      tagline: "智能整合、整合與連結",
      body: "B2B 商品庫、詢價單、自動 Quotation PDF 與跨境拓銷，連結國際買家。",
      colorClass: "text-global-500",
      dotStyle: { background: "var(--g3-global-300)" },
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-stone-900">
      <header className="border-b border-white/40 bg-white/60 backdrop-blur">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
              <span
                className="font-light text-xl bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--g3-gradient-brand)" }}
              >
                G
              </span>
              <span
                className="-mt-3 -ml-1 text-[10px] font-medium bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--g3-gradient-brand)" }}
              >
                3
              </span>
            </span>
            <span className="text-base font-light tracking-[0.18em] text-stone-700">
              G<sup className="text-[10px]">3</sup> AI
            </span>
          </Link>
          <div className="flex gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">登入</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">註冊</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — breathing gradient with bottom fade into canvas */}
      <section className="relative isolate w-full overflow-hidden pt-20 pb-32">
        <div
          aria-hidden
          className="bg-g3-breathing pointer-events-none absolute inset-0 -z-10"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 65%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 65%, transparent 100%)",
          }}
        />
        <BrandWatermark
          className="pointer-events-none absolute left-[-6%] top-1/2 -z-10 h-[160%] w-auto -translate-y-1/2 opacity-90"
        />

        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center px-6">
          <p className="text-xs font-medium tracking-[0.3em] text-stone-500 uppercase">
            Generate · Growth · Global
          </p>
          <h1 className="mt-4 font-display text-4xl md:text-5xl font-light leading-tight text-stone-800">
            和 G<sup className="text-2xl md:text-3xl">3</sup> AI 一起，<br className="md:hidden" />
            把設計、行銷、貿易整合在一段對話裡
          </h1>
          <p className="mt-6 text-base md:text-lg text-stone-600 max-w-2xl">
            從品牌 Logo、社群文案、SEO 文章到 B2B 詢價單，一個對話框，全部交給 AI。
          </p>
          <div className="mt-8 flex gap-3">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-g3-brand text-white border-0 hover:opacity-90"
              >
                免費開始
              </Button>
            </Link>
            <Link href="#pillars">
              <Button size="lg" variant="outline">了解三大軸線</Button>
            </Link>
          </div>
        </div>
      </section>

      <main className="flex-1 px-6">
        {/* Three pillars */}
        <section id="pillars" className="mx-auto -mt-12 grid max-w-5xl gap-6 md:grid-cols-3">
          {pillars.map((p) => (
            <div
              key={p.key}
              className="group relative rounded-2xl border border-stone-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="block h-3 w-3 rounded-full"
                  style={p.dotStyle}
                />
                <div>
                  <div className={`text-lg font-semibold tracking-wide ${p.colorClass}`}>
                    {p.title}
                  </div>
                  <div className="text-xs text-stone-500">{p.cn} · {p.tagline}</div>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-stone-700">{p.body}</p>
            </div>
          ))}
        </section>

        {/* Closing CTA */}
        <section className="mx-auto mt-24 max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-light text-stone-800">
            準備好開始了嗎？
          </h2>
          <p className="mt-3 text-stone-600">
            註冊免費試用，馬上和 G<sup>3</sup> AI 聊聊您的下一個設計需求。
          </p>
          <div className="mt-6">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-g3-brand text-white border-0 hover:opacity-90"
              >
                立即註冊
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="mt-24 border-t border-stone-200 bg-white/50 py-6 text-center text-sm text-stone-500">
        © Horizon AI · G<sup>3</sup> AI — Generate · Growth · Global
      </footer>
    </div>
  );
}
