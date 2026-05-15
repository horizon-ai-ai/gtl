import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertVerifiedTradeProfile } from "@/lib/trade";

function formatPrice(min: number | null, max: number | null, currency: string) {
  if (min == null && max == null) return "待議";
  if (min != null && max != null) return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()}`;
  if (min != null) return `${currency} ${min.toLocaleString()} 起`;
  return `${currency} ${max!.toLocaleString()} 以下`;
}

export default async function TradeSellerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user) notFound();
  await assertVerifiedTradeProfile(session.user.id);

  const seller = await prisma.user.findFirst({
    where: {
      id: params.id,
      deleted_at: null,
      trade_profile: { role: { in: ["seller", "both"] } },
    },
    include: {
      company: true,
      trade_profile: true,
      products: {
        where: { deleted_at: null, status: "published" },
        orderBy: { created_at: "desc" },
        take: 50,
      },
    },
  });

  if (!seller) notFound();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {seller.company?.name ?? seller.display_name ?? seller.email}
          </h1>
          <p className="text-sm text-neutral-500 mt-2 uppercase">
            {seller.trade_profile?.role ?? "seller"}
          </p>
        </div>
        <Link href="/trade">
          <Button variant="outline">返回市場</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seller 檔案</CardTitle>
          <CardDescription>供 Buyer 評估供應商的公開資訊</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Info label="公司簡介" value={seller.trade_profile?.description ?? "未填寫"} />
          <Info label="目標市場" value={seller.trade_profile?.target_markets.join(", ") || "未填寫"} />
          <Info label="產品類別" value={seller.trade_profile?.product_categories.join(", ") || "未填寫"} />
          <Info label="產能" value={seller.trade_profile?.capacity ?? "未填寫"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seller 商品</CardTitle>
          <CardDescription>目前已發布的商品列表</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {seller.products.map((product) => (
            <div key={product.id} className="rounded-md border p-4">
              <div className="font-medium">{product.name}</div>
              <div className="mt-1 text-sm text-neutral-500">
                {product.category}
                {product.hs_code ? ` · HS ${product.hs_code}` : ""}
              </div>
              <div className="mt-2 text-sm">{formatPrice(product.price_min, product.price_max, product.currency)}</div>
              <div className="mt-3">
                <Link href={`/trade/products/${product.id}`}>
                  <Button size="sm" variant="outline">查看商品詳情</Button>
                </Link>
              </div>
            </div>
          ))}
          {seller.products.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-neutral-500 md:col-span-2">
              目前沒有已發布商品
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 font-medium whitespace-pre-wrap">{value}</div>
    </div>
  );
}
