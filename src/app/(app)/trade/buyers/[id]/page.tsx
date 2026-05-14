import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertTradeModuleAccess } from "@/lib/trade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function TradeBuyerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user) notFound();
  await assertTradeModuleAccess(session.user.id);

  const buyer = await prisma.user.findFirst({
    where: {
      id: params.id,
      deleted_at: null,
      OR: [
        { id: session.user.id },
        { inquiries_sent: { some: { seller_id: session.user.id } } },
        { inquiries_recv: { some: { buyer_id: session.user.id } } },
      ],
    },
    include: {
      company: true,
      trade_profile: true,
      inquiries_sent: {
        orderBy: { created_at: "desc" },
        take: 20,
        include: {
          product: true,
          seller: {
            select: {
              id: true,
              email: true,
              display_name: true,
              company: true,
            },
          },
        },
      },
    },
  });

  if (!buyer) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">
            {buyer.company?.name ?? buyer.display_name ?? buyer.email}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Buyer profile
            {buyer.trade_profile?.budget_range ? ` · 預算 ${buyer.trade_profile.budget_range}` : ""}
          </p>
        </div>
        <Link href="/trade">
          <Button variant="outline">返回貿易市場</Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr,0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Buyer 資訊</CardTitle>
            <CardDescription>公司與採購需求基礎資料</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoGrid
              items={[
                ["聯絡人", buyer.company?.contact_name ?? buyer.display_name ?? "未填寫"],
                ["電話", buyer.company?.contact_phone ?? "未填寫"],
                ["產業", buyer.company?.industry ?? "未填寫"],
                ["統編", buyer.company?.tax_id ?? "未填寫"],
              ]}
            />
            <div>
              <div className="text-sm font-medium mb-2">需求簡介</div>
              <p className="text-sm whitespace-pre-wrap text-neutral-700">
                {buyer.trade_profile?.description ?? "尚未填寫"}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div>
                <div className="text-neutral-500">目標市場</div>
                <div className="mt-1 font-medium">
                  {buyer.trade_profile?.target_markets?.length
                    ? buyer.trade_profile.target_markets.join(", ")
                    : "未填寫"}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">採購類別</div>
                <div className="mt-1 font-medium">
                  {buyer.trade_profile?.product_categories?.length
                    ? buyer.trade_profile.product_categories.join(", ")
                    : "未填寫"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>近期詢價</CardTitle>
            <CardDescription>這位 Buyer 最近發出的詢價紀錄</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {buyer.inquiries_sent.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">尚無詢價紀錄</div>
            ) : (
              buyer.inquiries_sent.map((inquiry) => (
                <div key={inquiry.id} className="rounded-md border p-4">
                  <div className="font-medium">{inquiry.product.name}</div>
                  <div className="mt-1 text-sm text-neutral-500">
                    對象：{inquiry.seller.company?.name ?? inquiry.seller.display_name ?? inquiry.seller.email}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-neutral-500">數量</div>
                      <div className="mt-1 font-medium">{inquiry.quantity}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500">狀態</div>
                      <div className="mt-1 font-medium">{inquiry.status}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-neutral-500">{label}</div>
          <div className="mt-1 font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}
