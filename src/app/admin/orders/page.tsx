import Link from "next/link";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatTWD } from "@/lib/utils";

type SearchParams = {
  q?: string;
  status?: string;
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const q = searchParams?.q?.trim() ?? "";
  const status = searchParams?.status?.trim() ?? "";

  const [orders, stats] = await Promise.all([
    prisma.order.findMany({
      where: {
        deleted_at: null,
        ...(status ? { status: status as never } : {}),
        ...(q
          ? {
              OR: [
                { order_no: { contains: q, mode: "insensitive" } },
                { user: { email: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 100,
      include: { user: { select: { email: true, display_name: true } } },
    }),
    prisma.order.aggregate({
      where: { deleted_at: null },
      _sum: { total: true },
      _count: { id: true },
    }),
  ]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">訂單總覽</h1>
          <p className="text-sm text-neutral-500 mt-1">全平台訂單檢視、GMV 與異常處理入口。</p>
        </div>
        <Card className="px-4 py-3 text-sm">
          <div className="text-neutral-500">全平台 GMV</div>
          <div className="text-2xl font-semibold">{formatTWD(stats._sum.total ?? 0)}</div>
        </Card>
      </div>

      <Card className="p-4">
        <form className="flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="訂單編號 / 平台用戶 Email"
            className="min-w-80 rounded-md border bg-white px-3 py-2 text-sm"
          />
          <select name="status" defaultValue={status} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">全部狀態</option>
            <option value="draft">draft</option>
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="shipped">shipped</option>
            <option value="completed">completed</option>
            <option value="canceled">canceled</option>
            <option value="refunded">refunded</option>
            <option value="quote_pending">quote_pending</option>
            <option value="quoted">quoted</option>
            <option value="confirmed">confirmed</option>
            <option value="in_execution">in_execution</option>
            <option value="closed">closed</option>
            <option value="cancelled">cancelled</option>
          </select>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
            搜尋
          </button>
          <Link href="/admin/orders" className="rounded-md border px-4 py-2 text-sm">
            清除
          </Link>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="text-left p-3">訂單編號</th>
              <th className="text-left p-3">平台用戶</th>
              <th className="text-left p-3">客戶</th>
              <th className="text-left p-3">金額</th>
              <th className="text-left p-3">類型</th>
              <th className="text-left p-3">狀態</th>
              <th className="text-left p-3">建立日</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">
                  <Link href={`/admin/orders/${order.id}`} className="hover:underline">
                    {order.order_no}
                  </Link>
                </td>
                <td className="p-3">
                  <div>{order.user.email}</div>
                  <div className="text-xs text-neutral-500">{order.user.display_name ?? ""}</div>
                </td>
                <td className="p-3">{(order.customer as { name?: string }).name ?? "—"}</td>
                <td className="p-3">{formatTWD(order.total)}</td>
                <td className="p-3">{order.project_type ?? "commerce"}</td>
                <td className="p-3">{order.status}</td>
                <td className="p-3 text-neutral-500">
                  {new Date(order.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
