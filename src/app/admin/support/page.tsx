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

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-neutral-100 text-neutral-500",
};

const STATUS_ORDER: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, closed: 3 };

const PRIORITY_LABEL: Record<string, string> = {
  low: "低",
  normal: "中",
  high: "高",
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-neutral-100 text-neutral-700",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
};

const CATEGORY_LABEL: Record<string, string> = {
  order_support: "訂單協助",
  trade_inquiry: "貿易詢價",
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
  const sortedTickets = [...tickets].sort((a, b) => {
    const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

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

      <div className="space-y-3">
        {sortedTickets.length === 0 ? (
          <Card className="p-8 text-sm text-neutral-500">目前沒有工單。</Card>
        ) : null}
        {sortedTickets.map((ticket) => {
          const user = userMap.get(ticket.user_id);
          const assignee = ticket.assignee_admin_id ? adminMap.get(ticket.assignee_admin_id) : null;
          const source = inferSupportSource(ticket);
          const body = ticket.body ?? "";
          const preview = body.replace(/\s+/g, " ").trim();
          return (
            <Card key={ticket.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/support/${ticket.id}`} className="font-medium hover:underline">
                      {ticket.subject}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLE[ticket.status] ?? STATUS_STYLE.open
                      }`}
                    >
                      {STATUS_LABEL[ticket.status] ?? ticket.status}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        PRIORITY_STYLE[ticket.priority] ?? PRIORITY_STYLE.normal
                      }`}
                    >
                      優先度 {PRIORITY_LABEL[ticket.priority] ?? ticket.priority}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      {CATEGORY_LABEL[ticket.category] ?? ticket.category}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                    <span>{new Date(ticket.created_at).toLocaleString()}</span>
                    <span>
                      {user?.display_name ?? "未命名用戶"}（{user?.email ?? ticket.user_id}）
                    </span>
                    <span>負責人：{assignee?.display_name ?? assignee?.email ?? "未指派"}</span>
                    {source.href ? (
                      <Link href={source.href} className="underline underline-offset-2">
                        查看來源（{source.type}）
                      </Link>
                    ) : (
                      <span>來源：{source.type}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={assignTicket}>
                    <input type="hidden" name="ticket_id" value={ticket.id} />
                    <button
                      type="submit"
                      className="rounded border px-3 py-1.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
                      disabled={ticket.assignee_admin_id === admin.id}
                    >
                      {ticket.assignee_admin_id === admin.id ? "已指派給我" : "指派給我"}
                    </button>
                  </form>
                  <form action={updateTicketStatus} className="flex items-center gap-2">
                    <input type="hidden" name="ticket_id" value={ticket.id} />
                    <select
                      name="status"
                      defaultValue={ticket.status}
                      className="rounded border bg-white px-2 py-1.5 text-xs"
                    >
                      <option value="open">待處理</option>
                      <option value="in_progress">處理中</option>
                      <option value="resolved">已解決</option>
                      <option value="closed">已關閉</option>
                    </select>
                    <button type="submit" className="rounded border px-3 py-1.5 text-xs hover:bg-neutral-50">
                      更新
                    </button>
                  </form>
                </div>
              </div>
              {body ? (
                <details className="mt-3 rounded-md bg-neutral-50 text-sm text-neutral-700">
                  <summary className="cursor-pointer select-none px-3 py-2 text-neutral-600">
                    <span className="text-xs text-neutral-400">內容</span>{" "}
                    {preview.slice(0, 90)}
                    {preview.length > 90 ? "…（展開全文）" : ""}
                  </summary>
                  <div className="whitespace-pre-wrap border-t border-neutral-200 px-3 py-2">{body}</div>
                </details>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
