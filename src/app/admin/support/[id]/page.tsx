import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { inferSupportSource, mapSupportTimeline } from "@/lib/support";

async function addComment(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const ticketId = String(formData.get("ticket_id") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  const visibility = String(formData.get("visibility") ?? "internal");
  if (!ticketId || !comment) return;

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: visibility === "public" ? "support_ticket_public_reply" : "support_ticket_comment",
      target_type: "support_ticket",
      target_id: ticketId,
      payload: { comment, visibility },
    },
  });
  revalidatePath(`/admin/support/${ticketId}`);
}

async function updateStatus(formData: FormData) {
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
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/admin/support");
}

export default async function AdminSupportDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const [ticket, admins, audits] = await Promise.all([
    prisma.supportTicket.findUnique({
      where: { id: params.id },
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "super_admin"] } },
      select: { id: true, email: true, display_name: true },
    }),
    prisma.adminAction.findMany({
      where: { target_type: "support_ticket", target_id: params.id },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
  ]);
  if (!ticket) notFound();

  const user = await prisma.user.findUnique({
    where: { id: ticket.user_id },
    include: { company: true },
  });
  const assignee = ticket.assignee_admin_id
    ? admins.find((item) => item.id === ticket.assignee_admin_id) ?? null
    : null;
  const adminLookup = new Map(admins.map((admin) => [admin.id, admin.display_name ?? admin.email]));
  const timeline = mapSupportTimeline(audits, adminLookup);
  const source = inferSupportSource(ticket);
  const [sourceOrder, sourceInquiry, sourceConversation] = await Promise.all([
    source.type === "order"
      ? prisma.order.findUnique({
          where: { id: source.ref_id },
          include: { items: true },
        })
      : Promise.resolve(null),
    source.type === "trade_inquiry"
      ? prisma.inquiry.findUnique({
          where: { id: source.ref_id },
          include: {
            product: true,
            buyer: {
              select: {
                email: true,
                display_name: true,
                company: { select: { name: true } },
              },
            },
            seller: {
              select: {
                email: true,
                display_name: true,
                company: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
    source.type === "chat"
      ? prisma.conversation.findUnique({
          where: { id: ticket.conversation_id ?? undefined },
          include: {
            messages: {
              orderBy: { created_at: "desc" },
              take: 5,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {user?.email ?? ticket.user_id} · {ticket.category}
          </p>
        </div>
        <span className="rounded bg-neutral-100 px-3 py-1 text-sm">{ticket.status}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2 space-y-4">
          <div>
            <div className="text-sm font-medium">工單內容</div>
            <div className="mt-3 whitespace-pre-wrap text-sm text-neutral-700">{ticket.body}</div>
          </div>

          <div>
            <div className="text-sm font-medium">用戶資訊</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>名稱：{user?.display_name ?? "未命名用戶"}</div>
              <div>Email：{user?.email ?? "—"}</div>
              <div>類型：{user?.type ?? "—"}</div>
              <div>公司：{user?.company?.name ?? "—"}</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-3">處理留言 / Timeline</div>
            <div className="space-y-2">
              {timeline.map((item) => (
                <div key={item.id} className="rounded border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{item.kind}</div>
                    <span className="rounded bg-neutral-100 px-2 py-1 text-xs">{item.visibility}</span>
                  </div>
                  <div className="mt-1 text-neutral-500">
                    {item.actor_label} · {new Date(item.created_at).toLocaleString()}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-neutral-700">{item.body}</div>
                </div>
              ))}
            </div>
          </div>

          {sourceOrder ? (
            <div>
              <div className="text-sm font-medium mb-3">來源摘要：訂單</div>
              <div className="rounded border p-4 text-sm space-y-2">
                <div>訂單編號：{sourceOrder.order_no}</div>
                <div>狀態：{sourceOrder.status}</div>
                <div>總額：{sourceOrder.total}</div>
                <div className="text-neutral-600">
                  品項：{sourceOrder.items.map((item) => `${item.name} x ${item.quantity}`).join("，") || "—"}
                </div>
              </div>
            </div>
          ) : null}

          {sourceInquiry ? (
            <div>
              <div className="text-sm font-medium mb-3">來源摘要：貿易詢價</div>
              <div className="rounded border p-4 text-sm space-y-2">
                <div>商品：{sourceInquiry.product.name}</div>
                <div>數量：{sourceInquiry.quantity}</div>
                <div>目標價：{sourceInquiry.target_price ?? "—"}</div>
                <div>
                  買家：
                  {" "}
                  {sourceInquiry.buyer.company?.name ?? sourceInquiry.buyer.display_name ?? sourceInquiry.buyer.email}
                </div>
                <div>
                  賣家：
                  {" "}
                  {sourceInquiry.seller.company?.name ?? sourceInquiry.seller.display_name ?? sourceInquiry.seller.email}
                </div>
              </div>
            </div>
          ) : null}

          {sourceConversation ? (
            <div>
              <div className="text-sm font-medium mb-3">來源摘要：對話</div>
              <div className="rounded border p-4 text-sm space-y-3">
                {sourceConversation.messages.length === 0 ? (
                  <div className="text-neutral-500">沒有可顯示的對話訊息</div>
                ) : (
                  sourceConversation.messages.map((message) => (
                    <div key={message.id} className="rounded bg-neutral-50 p-3">
                      <div className="text-xs uppercase text-neutral-500">{message.role}</div>
                      <div className="mt-1 whitespace-pre-wrap text-neutral-700">
                        {typeof message.content === "object" && message.content && "text" in (message.content as Record<string, unknown>)
                          ? String((message.content as { text?: unknown }).text ?? "")
                          : JSON.stringify(message.content)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">工單資訊</div>
            <div className="mt-3 space-y-2 text-sm">
              <div>優先度：{ticket.priority}</div>
              <div>
                來源：{source.type}
                {source.href ? (
                  <>
                    {" · "}
                    <a href={source.href} className="underline">
                      查看來源
                    </a>
                  </>
                ) : null}
              </div>
              <div>負責人：{assignee?.display_name ?? assignee?.email ?? "未指派"}</div>
              <div>建立時間：{new Date(ticket.created_at).toLocaleString()}</div>
              <div>解決時間：{ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString() : "—"}</div>
            </div>
          </div>

          <form action={updateStatus} className="space-y-2 rounded border p-3">
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <div className="text-sm font-medium">更新狀態</div>
            <select name="status" defaultValue={ticket.status} className="w-full rounded border px-3 py-2 text-sm">
              <option value="open">待處理</option>
              <option value="in_progress">處理中</option>
              <option value="resolved">已解決</option>
              <option value="closed">已關閉</option>
            </select>
            <button type="submit" className="w-full rounded bg-neutral-900 px-3 py-2 text-sm text-white">
              更新狀態
            </button>
          </form>

          <form action={addComment} className="space-y-2 rounded border p-3">
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <div className="text-sm font-medium">新增留言</div>
            <textarea
              name="comment"
              required
              className="min-h-28 w-full rounded border px-3 py-2 text-sm"
              placeholder="留下處理進度、待客戶回覆事項或內部交接說明"
            />
            <select name="visibility" defaultValue="internal" className="w-full rounded border px-3 py-2 text-sm">
              <option value="internal">內部備註</option>
              <option value="public">公開回覆給用戶</option>
            </select>
            <button type="submit" className="w-full rounded bg-neutral-900 px-3 py-2 text-sm text-white">
              儲存留言
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
