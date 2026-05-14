import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";

export default async function SiteDnsSetupPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) notFound();

  const site = await prisma.site.findFirst({
    where: {
      id: params.id,
      user_id: session.user.id,
      deleted_at: null,
    },
  });

  if (!site) notFound();

  const host = site.custom_domain ?? "未設定";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">DNS Setup</h1>
          <p className="mt-1 text-sm text-neutral-500">
            為站點 {site.name} 設定自訂網域與對應的 host routing。
          </p>
        </div>
        <Link href="/sites" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
          回到網站建置
        </Link>
      </div>

      <Card className="p-5 space-y-4">
        <div className="font-medium">目前設定</div>
        <div className="rounded-md border bg-neutral-50 p-4 text-sm">
          <div>站點：{site.name}</div>
          <div>Slug：/s/{site.slug}</div>
          <div>Custom domain：{host}</div>
          <div>狀態：{site.status}</div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="font-medium">DNS 設定建議</div>
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="rounded-md border p-4">
            <div className="font-medium">如果你的網域是根網域</div>
            <div className="mt-2">新增 A Record 指向你的部署主機 IP。</div>
          </div>
          <div className="rounded-md border p-4">
            <div className="font-medium">如果你的網域是子網域，例如 www.example.com</div>
            <div className="mt-2">新增 CNAME Record 指向你的平台部署網域。</div>
          </div>
          <div className="rounded-md border p-4">
            <div className="font-medium">驗證方式</div>
            <div className="mt-2">
              目前系統已支援 host-based routing。只要 request host 與 `custom_domain` 相符，且站點為 published，
              就會直接渲染該站點。
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-medium">部署後測試</div>
        <div className="rounded-md border bg-neutral-50 p-4 text-sm text-neutral-700">
          1. 將 DNS 指到正式部署網域
          <br />
          2. 確認站點狀態為 published
          <br />
          3. 用自訂網域打開首頁，middleware 會將 host rewrite 到站點 renderer
        </div>
      </Card>
    </div>
  );
}
