import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTWD } from "@/lib/utils";

const ORDER_STATUS_STYLE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-500",
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-blue-100 text-blue-700",
  in_execution: "bg-blue-100 text-blue-700",
  shipped: "bg-indigo-100 text-indigo-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-neutral-100 text-neutral-500",
};

export default async function AdminDashboard() {
  const [
    userCount,
    activeUserCount,
    orderCount,
    gmvAgg,
    openTicketCount,
    pendingProfileCount,
    negotiatingInquiryCount,
    publishedProductCount,
    recentOrders,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count({ where: { deleted_at: null } }),
    prisma.user.count({ where: { status: "active" } }),
    prisma.order.count({ where: { deleted_at: null } }),
    prisma.order.aggregate({
      where: { status: { in: ["paid", "shipped", "completed"] } },
      _sum: { total: true },
    }),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.tradeProfile.count({ where: { verified: false } }),
    prisma.inquiry.count({ where: { status: "negotiating" } }),
    prisma.product.count({ where: { status: "published", deleted_at: null } }),
    prisma.order.findMany({
      where: { deleted_at: null },
      include: { user: { select: { email: true, display_name: true, company: { select: { name: true } } } } },
      orderBy: { created_at: "desc" },
      take: 6,
    }),
    prisma.user.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        email: true,
        display_name: true,
        type: true,
        created_at: true,
        company: { select: { name: true } },
      },
      orderBy: { created_at: "desc" },
      take: 6,
    }),
  ]);

  const stats = [
    { label: "總用戶數", value: userCount.toLocaleString() },
    { label: "活躍用戶", value: activeUserCount.toLocaleString() },
    { label: "訂單總數", value: orderCount.toLocaleString() },
    { label: "GMV", value: formatTWD(gmvAgg._sum.total ?? 0) },
  ];

  const todos = [
    { label: "待處理工單", value: openTicketCount, href: "/admin/support", hint: "人工支援", warn: true },
    { label: "待審核賣家身份", value: pendingProfileCount, href: "/admin/trade/profiles", hint: "身份審核", warn: true },
    { label: "議價中詢價", value: negotiatingInquiryCount, href: "/admin/trade/quotations", hint: "Quotation", warn: true },
    { label: "上架中商品", value: publishedProductCount, href: "/admin/trade/products", hint: "商品列表", warn: false },
  ];

  return (
    <div className="space-y-6 p-8">
      <h1 className="text-2xl font-semibold">儀表板</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-neutral-500">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <div className="mb-3 text-sm font-semibold text-neutral-700">待辦事項</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {todos.map((todo) => (
            <Link key={todo.label} href={todo.href} className="group">
              <Card className="transition-colors group-hover:border-neutral-400">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="text-sm text-neutral-500">{todo.label}</div>
                    <div className={`mt-1 text-2xl font-semibold ${todo.warn && todo.value > 0 ? "text-amber-600" : ""}`}>
                      {todo.value.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400 group-hover:text-neutral-600">{todo.hint} →</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">最新訂單</div>
            <Link href="/admin/orders" className="text-xs text-neutral-500 underline underline-offset-2">
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {recentOrders.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-neutral-500">尚無訂單。</div>
            ) : null}
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{order.order_no}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ORDER_STATUS_STYLE[order.status] ?? "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-neutral-500">
                    {order.user.company?.name ?? order.user.display_name ?? order.user.email} ·{" "}
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="shrink-0 text-neutral-700">{formatTWD(order.total)}</div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">最新註冊用戶</div>
            <Link href="/admin/users" className="text-xs text-neutral-500 underline underline-offset-2">
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {recentUsers.map((user) => (
              <Link
                key={user.id}
                href={`/admin/users/${user.id}`}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-neutral-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{user.display_name ?? user.email}</div>
                  <div className="mt-0.5 truncate text-xs text-neutral-500">
                    {user.email}
                    {user.company?.name ? ` · ${user.company.name}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-neutral-500">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5">
                    {user.type === "company" ? "公司" : "個人"}
                  </span>
                  <span>{new Date(user.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
