import Link from "next/link";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";

type SearchParams = {
  category?: string;
};

type CopilotPayload = {
  query?: string;
  status?: string;
};

function classifyAuditLog(action: string) {
  if (action === "admin_copilot_run") {
    return {
      key: "copilot",
      label: "Copilot",
    };
  }
  if (action.startsWith("support_")) {
    return {
      key: "support",
      label: "Support",
    };
  }
  if (action.startsWith("trade_")) {
    return {
      key: "trade",
      label: "Trade",
    };
  }
  if (action.includes("order")) {
    return {
      key: "orders",
      label: "Orders",
    };
  }
  return {
    key: "other",
    label: "Other",
  };
}

function buildAuditHref(log: { action: string; target_type: string; target_id: string }) {
  if (log.action === "admin_copilot_run") return `/admin/copilot/history`;
  if (log.target_type === "support_ticket") return `/admin/support/${log.target_id}`;
  if (log.target_type === "order") return `/admin/orders/${log.target_id}`;
  if (log.target_type === "user") return `/admin/users/${log.target_id}`;
  if (log.target_type === "product") return `/admin/trade/products`;
  if (log.target_type === "trade_profile") return `/admin/trade/profiles`;
  if (log.target_type === "admin_copilot") return `/admin/copilot/history`;
  return null;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const category = searchParams?.category?.trim() ?? "";
  const logs = await prisma.adminAction.findMany({
    orderBy: { created_at: "desc" },
    take: 100,
  });

  const adminIds = Array.from(new Set(logs.map((log) => log.admin_id)));
  const admins = adminIds.length
    ? await prisma.user.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, email: true, display_name: true },
      })
    : [];
  const adminMap = new Map(admins.map((admin) => [admin.id, admin]));

  const filteredLogs = logs.filter((log) => {
    if (!category) return true;
    return classifyAuditLog(log.action).key === category;
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Audit Log</h1>
        <p className="text-sm text-neutral-500">包含一般 admin 操作與專門的 Copilot run 分類。</p>
      </div>

      <Card className="p-4">
        <form className="flex flex-wrap gap-3">
          <select name="category" defaultValue={category} className="rounded-md border bg-white px-3 py-2 text-sm">
            <option value="">全部分類</option>
            <option value="copilot">Copilot</option>
            <option value="support">Support</option>
            <option value="trade">Trade</option>
            <option value="orders">Orders</option>
            <option value="other">Other</option>
          </select>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">
            篩選
          </button>
          <Link href="/admin/audit" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
            清除
          </Link>
          <Link href="/admin/copilot/history" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
            查看 Copilot History
          </Link>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="text-left p-3">時間</th>
              <th className="text-left p-3">Admin</th>
              <th className="text-left p-3">分類</th>
              <th className="text-left p-3">動作</th>
              <th className="text-left p-3">目標</th>
              <th className="text-left p-3">理由 / Query</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-neutral-500">
                  尚無紀錄
                </td>
              </tr>
            )}
            {filteredLogs.map((log) => {
              const admin = adminMap.get(log.admin_id);
              const cls = classifyAuditLog(log.action);
              const href = buildAuditHref(log);
              const payload = (log.payload ?? {}) as CopilotPayload;
              const reason = log.action === "admin_copilot_run" ? payload.query ?? log.reason ?? "—" : log.reason ?? "—";

              return (
                <tr key={log.id} className="border-b last:border-0 align-top">
                  <td className="p-3 text-neutral-500">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    <div>{admin?.display_name ?? admin?.email ?? log.admin_id.slice(0, 8)}</div>
                    <div className="text-xs text-neutral-500">{admin?.email ?? log.admin_id}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        cls.key === "copilot"
                          ? "bg-violet-100 text-violet-700"
                          : cls.key === "support"
                            ? "bg-blue-100 text-blue-700"
                            : cls.key === "trade"
                              ? "bg-amber-100 text-amber-700"
                              : cls.key === "orders"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {cls.label}
                    </span>
                  </td>
                  <td className="p-3">{log.action}</td>
                  <td className="p-3 text-xs">
                    {href ? (
                      <Link href={href} className="underline">
                        {log.target_type}:{log.target_id.slice(0, 8)}
                      </Link>
                    ) : (
                      `${log.target_type}:${log.target_id.slice(0, 8)}`
                    )}
                  </td>
                  <td className="p-3 text-neutral-500">
                    <div>{reason}</div>
                    {log.action === "admin_copilot_run" ? (
                      <div className="mt-1 text-xs">
                        status: {payload.status ?? "unknown"}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
