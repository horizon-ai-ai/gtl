import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inferSupportSource } from "@/lib/support";

const STATUS_LABEL: Record<string, string> = {
  open: "待處理",
  in_progress: "處理中",
  resolved: "已解決",
  closed: "已關閉",
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-neutral-100 text-neutral-700",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
};

async function assignTicket(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const ticketId = String(formData.get("ticket_id") ?? "");
  if (!ticketId) return;

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      assignee_admin_id: admin.id,
      status: "in_progress",
    },
  });

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "support_ticket_assign_self",
      target_type: "support_ticket",
      target_id: ticketId,
    },
  });

  revalidatePath("/admin/support");
}

async function updateTicketStatus(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ticketId || !["open", "in_progress", "resolved", "closed"].includes(status)) return;

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status,
      resolved_at: status === "resolved" ? new Date() : null,
    },
  });

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "support_ticket_status_update",
      target_type: "support_ticket",
      target_id: ticketId,
      payload: { status },
    },
  });

  revalidatePath("/admin/support");
}

export default async function AdminSupportPage() {
  const admin = await requireAdmin();
  const [tickets, openCount, admins] = await Promise.all([
    prisma.supportTicket.findMany({
      orderBy: { created_at: "desc" },
      take: 100,
    }),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "super_admin"] } },
      select: { id: true, email: true, display_name: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const userIds = Array.from(new Set(tickets.map((ticket) => ticket.user_id)));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, display_name: true },
      })
    : [];
  const userMap = new Map(users.map((user) => [user.id, user]));
  const adminMap = new Map(admins.map((user) => [user.id, user]));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">人工支援工單</h1>
          <p className="text-sm text-neutral-500 mt-1">
            AI 無法直接完成成交時，轉交 admin portal 接手。
          </p>
        </div>
        <Card className="px-4 py-3 text-sm">
          <div className="text-neutral-500">待處理</div>
          <div className="text-2xl font-semibold">{openCount}</div>
        </Card>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="text-left p-3">建立時間</th>
              <th className="text-left p-3">用戶</th>
              <th className="text-left p-3">主旨</th>
              <th className="text-left p-3">分類</th>
              <th className="text-left p-3">來源</th>
              <th className="text-left p-3">優先度</th>
              <th className="text-left p-3">負責人</th>
              <th className="text-left p-3">狀態</th>
              <th className="text-left p-3">內容</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => {
              const user = userMap.get(ticket.user_id);
              const assignee = ticket.assignee_admin_id ? adminMap.get(ticket.assignee_admin_id) : null;
              const source = inferSupportSource(ticket);
              return (
                <tr key={ticket.id} className="border-b last:border-0 align-top">
                  <td className="p-3 text-neutral-500 whitespace-nowrap">
                    {new Date(ticket.created_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{user?.display_name ?? "未命名用戶"}</div>
                    <div className="text-xs text-neutral-500">{user?.email ?? ticket.user_id}</div>
                  </td>
                  <td className="p-3 font-medium">
                    <Link href={`/admin/support/${ticket.id}`} className="hover:underline">
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="p-3">{ticket.category}</td>
                  <td className="p-3">
                    <div className="text-sm">{source.type}</div>
                    {source.href ? (
                      <Link href={source.href} className="text-xs text-neutral-500 underline">
                        查看來源
                      </Link>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex rounded px-2 py-1 text-xs ${
                        PRIORITY_STYLE[ticket.priority] ?? PRIORITY_STYLE.normal
                      }`}
                    >
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="p-3 min-w-44">
                    <div className="text-sm">{assignee?.display_name ?? assignee?.email ?? "未指派"}</div>
                    <form action={assignTicket} className="mt-2">
                      <input type="hidden" name="ticket_id" value={ticket.id} />
                      <button
                        type="submit"
                        className="rounded border px-2 py-1 text-xs hover:bg-neutral-50"
                        disabled={ticket.assignee_admin_id === admin.id}
                      >
                        {ticket.assignee_admin_id === admin.id ? "已指派給我" : "指派給我"}
                      </button>
                    </form>
                  </td>
                  <td className="p-3 min-w-44">
                    <div className="text-sm mb-2">{STATUS_LABEL[ticket.status] ?? ticket.status}</div>
                    <form action={updateTicketStatus} className="flex gap-2">
                      <input type="hidden" name="ticket_id" value={ticket.id} />
                      <select
                        name="status"
                        defaultValue={ticket.status}
                        className="rounded border bg-white px-2 py-1 text-xs"
                      >
                        <option value="open">待處理</option>
                        <option value="in_progress">處理中</option>
                        <option value="resolved">已解決</option>
                        <option value="closed">已關閉</option>
                      </select>
                      <button type="submit" className="rounded border px-2 py-1 text-xs hover:bg-neutral-50">
                        更新
                      </button>
                    </form>
                  </td>
                  <td className="p-3 whitespace-pre-wrap text-neutral-600 max-w-xl">{ticket.body}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
