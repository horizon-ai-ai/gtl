import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTradeAccessState } from "@/lib/trade";
import { getInquiryColumnSupport } from "@/lib/trade-quotations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  href?: string;
  status: string;
};

function buildNotifications(params: {
  sent: Array<{
    id: string;
    status: string;
    updated_at: Date;
    quotation_version: number;
    product: { name: string };
    seller: { display_name: string | null; company: { name: string } | null; email: string };
  }>;
  received: Array<{
    id: string;
    status: string;
    updated_at: Date;
    quotation_version: number;
    product: { name: string };
    buyer: { display_name: string | null; company: { name: string } | null; email: string };
  }>;
  products: Array<{
    id: string;
    name: string;
    status: string;
    updated_at: Date;
  }>;
}) {
  const items: NotificationItem[] = [];

  for (const inquiry of params.sent) {
    const counterparty = inquiry.seller.company?.name ?? inquiry.seller.display_name ?? inquiry.seller.email;
    const title =
      inquiry.status === "replied"
        ? `你收到 ${inquiry.product.name} 的報價`
        : inquiry.status === "negotiating"
          ? `${inquiry.product.name} 進入議價中`
          : inquiry.status === "closed"
            ? `${inquiry.product.name} 詢價已結案`
            : inquiry.status === "expired"
              ? `${inquiry.product.name} 詢價已過期`
              : `你送出的詢價更新`;
    const body =
      inquiry.quotation_version > 0
        ? `${counterparty} 已更新到第 ${inquiry.quotation_version} 版報價。`
        : `${counterparty} 已更新詢價狀態為 ${inquiry.status}。`;
    items.push({
      id: `sent-${inquiry.id}`,
      title,
      body,
      createdAt: inquiry.updated_at,
      href: "/trade",
      status: inquiry.status,
    });
  }

  for (const inquiry of params.received) {
    const buyer = inquiry.buyer.company?.name ?? inquiry.buyer.display_name ?? inquiry.buyer.email;
    const title =
      inquiry.status === "sent"
        ? `收到 ${inquiry.product.name} 的新詢價`
        : inquiry.status === "negotiating"
          ? `${inquiry.product.name} 正在議價`
          : inquiry.status === "closed"
            ? `${inquiry.product.name} 詢價已結案`
            : `收到詢價更新`;
    const body =
      inquiry.quotation_version > 0
        ? `${buyer} 正在查看第 ${inquiry.quotation_version} 版報價，狀態為 ${inquiry.status}。`
        : `${buyer} 的詢價目前狀態為 ${inquiry.status}。`;
    items.push({
      id: `received-${inquiry.id}`,
      title,
      body,
      createdAt: inquiry.updated_at,
      href: "/trade",
      status: inquiry.status,
    });
  }

  for (const product of params.products) {
    if (product.status === "published" || product.status === "paused") {
      items.push({
        id: `product-${product.id}`,
        title: `${product.name} 已${product.status === "published" ? "上架" : "暫停"}`,
        body: product.status === "published" ? "商品已可被市場搜尋與詢價。" : "商品目前不會顯示在市場商品中。",
        createdAt: product.updated_at,
        href: `/trade/products/${product.id}`,
        status: product.status,
      });
    }
  }

  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export default async function TradeNotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sellerAccess = (await getTradeAccessState(session.user.id)).seller_allowed;

  const columns = await getInquiryColumnSupport();
  const quotedPrice = columns.quoted_price ? `i."quoted_price"` : `NULL::integer`;
  const quotationVersion = columns.quotation_version
    ? `i."quotation_version"`
    : `CASE
         WHEN ${columns.quoted_price ? `i."quoted_price" IS NOT NULL` : `false`}
         THEN 1
         ELSE 0
       END`;

  const [sent, received, products] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{
      id: string;
      status: string;
      updated_at: Date;
      quotation_version: number;
      product: { name: string };
      seller: { display_name: string | null; company: { name: string } | null; email: string };
    }>>(
      `
        SELECT
          i."id",
          i."status"::text AS "status",
          i."updated_at",
          ${quotationVersion} AS "quotation_version",
          jsonb_build_object('name', p."name") AS "product",
          jsonb_build_object(
            'email', s."email",
            'display_name', s."display_name",
            'company', CASE WHEN sc."name" IS NULL THEN NULL ELSE jsonb_build_object('name', sc."name") END
          ) AS "seller"
        FROM "Inquiry" i
        INNER JOIN "Product" p ON p."id" = i."product_id"
        INNER JOIN "User" s ON s."id" = i."seller_id"
        LEFT JOIN "CompanyProfile" sc ON sc."user_id" = s."id"
        WHERE i."buyer_id" = $1::uuid
        ORDER BY i."updated_at" DESC
        LIMIT 20
      `,
      session.user.id,
    ),
    sellerAccess
      ? prisma.$queryRawUnsafe<Array<{
      id: string;
      status: string;
      updated_at: Date;
      quotation_version: number;
      product: { name: string };
      buyer: { display_name: string | null; company: { name: string } | null; email: string };
    }>>(
      `
        SELECT
          i."id",
          i."status"::text AS "status",
          i."updated_at",
          ${quotationVersion} AS "quotation_version",
          jsonb_build_object('name', p."name") AS "product",
          jsonb_build_object(
            'email', b."email",
            'display_name', b."display_name",
            'company', CASE WHEN bc."name" IS NULL THEN NULL ELSE jsonb_build_object('name', bc."name") END
          ) AS "buyer"
        FROM "Inquiry" i
        INNER JOIN "Product" p ON p."id" = i."product_id"
        INNER JOIN "User" b ON b."id" = i."buyer_id"
        LEFT JOIN "CompanyProfile" bc ON bc."user_id" = b."id"
        WHERE i."seller_id" = $1::uuid
        ORDER BY i."updated_at" DESC
        LIMIT 20
      `,
      session.user.id,
    )
      : Promise.resolve([]),
    sellerAccess
      ? prisma.product.findMany({
          where: { seller_id: session.user.id, deleted_at: null },
          select: { id: true, name: true, status: true, updated_at: true },
          orderBy: { updated_at: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  const notifications = buildNotifications({ sent, received, products });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">貿易通知中心</h1>
          <p className="mt-1 text-sm text-neutral-500">
            集中查看詢價、報價版本、議價與商品狀態更新。
          </p>
        </div>
        <Link href="/trade" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
          回到貿易工作台
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近通知</CardTitle>
          <CardDescription>依最新更新時間排序，方便快速追蹤要回覆的商務事件。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {notifications.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-neutral-500">目前沒有通知。</div>
          ) : (
            notifications.map((item) => (
              <div key={item.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 text-sm text-neutral-600">{item.body}</div>
                    <div className="mt-2 text-xs text-neutral-500">
                      {item.createdAt.toLocaleString("zh-TW")} · {item.status}
                    </div>
                  </div>
                  {item.href ? (
                    <Link href={item.href} className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">
                      查看
                    </Link>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
