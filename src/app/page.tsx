import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const host = headers().get("host") ?? "";
  if (host.endsWith(":3001")) {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div className="font-semibold">Marketing AI Platform</div>
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

      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl">
          對話即行銷 — 跟 AI 聊天，完成所有行銷工作
        </h1>
        <p className="mt-6 text-lg text-neutral-600 max-w-2xl">
          從內容生成、網頁建置、到 B2B 商機媒合與訂單成立，一站式行銷 AI SaaS。
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/register">
            <Button size="lg">免費開始</Button>
          </Link>
          <Link href="#features">
            <Button size="lg" variant="outline">查看功能</Button>
          </Link>
        </div>

        <section id="features" className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
          {[
            { title: "AI Chat 行銷顧問", body: "對話生成文案、企劃、SEO、廣告策略" },
            { title: "一鍵建站", body: "Puck Editor + AI 生成行銷網頁（Phase 2）" },
            { title: "B2B 貿易模組", body: "商品庫、詢價、自動 Quotation PDF（Phase 3）" },
          ].map((f) => (
            <div key={f.title} className="text-left p-6 border rounded-lg bg-white">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-neutral-600 mt-2">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t text-sm text-neutral-500 p-6 text-center">
        © Horizon AI · Marketing AI Platform
      </footer>
    </div>
  );
}
