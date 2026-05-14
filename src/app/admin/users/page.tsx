import Link from "next/link";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";

type SearchParams = {
  q?: string;
  status?: string;
  type?: string;
  plan?: string;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const q = searchParams?.q?.trim() ?? "";
  const status = searchParams?.status?.trim() ?? "";
  const type = searchParams?.type?.trim() ?? "";
  const plan = searchParams?.plan?.trim() ?? "";

  const [plans, users] = await Promise.all([
    prisma.plan.findMany({
      where: { active: true },
      orderBy: { sort_order: "asc" },
      select: { code: true, name: true },
    }),
    prisma.user.findMany({
      where: {
        deleted_at: null,
        ...(status ? { status: status as never } : {}),
        ...(type ? { type: type as never } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { display_name: { contains: q, mode: "insensitive" } },
                { company: { name: { contains: q, mode: "insensitive" } } },
                { company: { tax_id: { contains: q } } },
              ],
            }
          : {}),
        ...(plan
          ? {
              subscription: {
                plan: {
                  code: plan,
                },
              },
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 100,
      include: {
        company: true,
        sessions: {
          where: { revoked_at: null },
          orderBy: { created_at: "desc" },
          take: 1,
          select: { created_at: true },
        },
        subscription: { include: { plan: true } },
      },
    }),
  ]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">用戶管理</h1>
        <p className="text-sm text-neutral-500 mt-1">
          管理註冊用戶、方案、停權狀態與後續營運動作。
        </p>
      </div>

      <Card className="p-4">
        <form className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Email / 公司名 / 統編"
            className="rounded-md border bg-white px-3 py-2 text-sm"
          />
          <select name="status" defaultValue={status} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">全部狀態</option>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="deleted">deleted</option>
          </select>
          <select name="type" defaultValue={type} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">全部類型</option>
            <option value="personal">personal</option>
            <option value="company">company</option>
          </select>
          <select name="plan" defaultValue={plan} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">全部方案</option>
            {plans.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="md:col-span-4 flex gap-2">
            <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
              搜尋
            </button>
            <Link href="/admin/users" className="rounded-md border px-4 py-2 text-sm">
              清除
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">類型</th>
              <th className="text-left p-3">公司 / 統編</th>
              <th className="text-left p-3">方案</th>
              <th className="text-left p-3">最後登入</th>
              <th className="text-left p-3">狀態</th>
              <th className="text-left p-3">註冊日</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b last:border-0">
                <td className="p-3">
                  <Link href={`/admin/users/${user.id}`} className="font-medium hover:underline">
                    {user.email}
                  </Link>
                  <div className="text-xs text-neutral-500">{user.display_name ?? "—"}</div>
                </td>
                <td className="p-3">{user.type === "company" ? "公司" : "個人"}</td>
                <td className="p-3 text-neutral-500">
                  <div>{user.company?.name ?? "—"}</div>
                  <div className="text-xs">{user.company?.tax_id ?? ""}</div>
                </td>
                <td className="p-3">{user.subscription?.plan.name ?? "免費"}</td>
                <td className="p-3 text-neutral-500">
                  {user.sessions[0]?.created_at
                    ? new Date(user.sessions[0].created_at).toLocaleString()
                    : "—"}
                </td>
                <td className="p-3">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      user.status === "active"
                        ? "bg-green-100 text-green-700"
                        : user.status === "suspended"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    {user.status}
                  </span>
                </td>
                <td className="p-3 text-neutral-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
