import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { currentPeriod, ensureUsage } from "@/lib/credits";
import { prisma } from "@/lib/db";
import { formatTWD } from "@/lib/utils";

async function suspendUser(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "admin_action";
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { status: "suspended" },
  });
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "user_suspend",
      target_type: "user",
      target_id: userId,
      reason,
    },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

async function unsuspendUser(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { status: "active" },
  });
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "user_unsuspend",
      target_type: "user",
      target_id: userId,
    },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

async function changePlan(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const planId = String(formData.get("plan_id") ?? "");
  if (!userId || !planId) return;

  await prisma.subscription.upsert({
    where: { user_id: userId },
    update: { plan_id: planId, status: "active" },
    create: {
      user_id: userId,
      plan_id: planId,
      status: "active",
      current_period_start: new Date(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "user_change_plan",
      target_type: "user",
      target_id: userId,
      payload: { plan_id: planId },
    },
  });
  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

async function grantCredits(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const amount = Number.parseInt(String(formData.get("amount") ?? "0"), 10);
  if (!userId || !Number.isFinite(amount) || amount <= 0) return;

  await ensureUsage(userId);
  const period = currentPeriod();
  await prisma.userUsage.update({
    where: { user_id_period: { user_id: userId, period } },
    data: { topup_credits: { increment: BigInt(amount) } },
  });
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "user_grant_credits",
      target_type: "user",
      target_id: userId,
      payload: { amount },
    },
  });
  revalidatePath(`/admin/users/${userId}`);
}

async function resetUsedCredits(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "admin_credit_reset";
  if (!userId) return;

  await ensureUsage(userId);
  const period = currentPeriod();
  await prisma.userUsage.update({
    where: { user_id_period: { user_id: userId, period } },
    data: { used_credits: BigInt(0) },
  });
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "user_reset_used_credits",
      target_type: "user",
      target_id: userId,
      reason,
      payload: { period },
    },
  });
  revalidatePath(`/admin/users/${userId}`);
}

function formatCredits(value: bigint) {
  return Number(value).toLocaleString("zh-TW");
}

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const [user, plans, audits] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.id },
      include: {
        company: true,
        subscription: { include: { plan: true } },
        invoices: { orderBy: { created_at: "desc" }, take: 10 },
        orders: { orderBy: { created_at: "desc" }, take: 10, include: { items: true } },
        sites: { orderBy: { created_at: "desc" }, take: 10 },
        conversations: {
          orderBy: { updated_at: "desc" },
          take: 10,
          include: { messages: { orderBy: { created_at: "desc" }, take: 1 } },
        },
      },
    }),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sort_order: "asc" } }),
    prisma.adminAction.findMany({
      where: { target_type: "user", target_id: params.id },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
  ]);

  if (!user) notFound();

  const usage = await ensureUsage(user.id);
  const totalCredits = usage.plan_credits + usage.topup_credits;
  const availableCredits = totalCredits - usage.used_credits;
  const usageRate = totalCredits > BigInt(0)
    ? Math.min(100, Math.max(0, Math.round((Number(usage.used_credits) / Number(totalCredits)) * 100)))
    : 0;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{user.display_name ?? user.email}</h1>
          <p className="text-sm text-neutral-500 mt-1">{user.email}</p>
        </div>
        <span
          className={`rounded px-3 py-1 text-sm ${
            user.status === "active" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {user.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2 space-y-4">
          <div>
            <div className="text-sm font-medium">基本資訊</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>類型：{user.type}</div>
              <div>角色：{user.role}</div>
              <div>方案：{user.subscription?.plan.name ?? "免費"}</div>
              <div>註冊日：{new Date(user.created_at).toLocaleString()}</div>
              <div>Email 驗證：{user.email_verified_at ? "已驗證" : "未驗證"}</div>
              <div>可用 Credits：{formatCredits(availableCredits)}</div>
            </div>
          </div>

          {user.company ? (
            <div>
              <div className="text-sm font-medium">公司資料</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>公司名：{user.company.name}</div>
                <div>統編：{user.company.tax_id}</div>
                <div>地址：{user.company.address}</div>
                <div>驗證：{user.company.verified ? "是" : "否"}</div>
              </div>
            </div>
          ) : null}

          <div>
            <div className="text-sm font-medium">管理動作</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <form action={user.status === "suspended" ? unsuspendUser : suspendUser} className="space-y-2 rounded border p-3">
                <input type="hidden" name="user_id" value={user.id} />
                {user.status !== "suspended" ? (
                  <input
                    name="reason"
                    placeholder="停權原因"
                    className="w-full rounded border px-3 py-2 text-sm"
                  />
                ) : null}
                <button type="submit" className="w-full rounded bg-neutral-900 px-3 py-2 text-sm text-white">
                  {user.status === "suspended" ? "解除停權" : "停權帳號"}
                </button>
              </form>

              <form action={changePlan} className="space-y-2 rounded border p-3">
                <input type="hidden" name="user_id" value={user.id} />
                <select
                  name="plan_id"
                  defaultValue={user.subscription?.plan_id ?? ""}
                  className="w-full rounded border px-3 py-2 text-sm"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="w-full rounded bg-neutral-900 px-3 py-2 text-sm text-white">
                  變更方案
                </button>
              </form>

              <div className="rounded border p-3 text-sm text-neutral-500">
                Credits 管理已移到右側獨立區塊，可查看用量、贈送 credits 或重置本期已用量。
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <div className="text-sm font-medium">Credits 管理</div>
            <p className="mt-1 text-xs text-neutral-500">
              後台處理本期額度，不需要直接進 DB。
            </p>
          </div>

          <div className="rounded-lg border bg-neutral-50 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs text-neutral-500">本期可用</div>
                <div className={`mt-1 text-2xl font-semibold ${availableCredits <= BigInt(0) ? "text-red-600" : "text-neutral-900"}`}>
                  {formatCredits(availableCredits)}
                </div>
              </div>
              <div className="text-right text-xs text-neutral-500">
                <div>Period {usage.period}</div>
                <div>重置 {new Date(usage.reset_at).toLocaleDateString()}</div>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white">
              <div className="h-2 rounded-full bg-neutral-900" style={{ width: `${usageRate}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-neutral-600">
              <div>
                <div className="text-neutral-400">方案</div>
                <div>{formatCredits(usage.plan_credits)}</div>
              </div>
              <div>
                <div className="text-neutral-400">加值/贈送</div>
                <div>{formatCredits(usage.topup_credits)}</div>
              </div>
              <div>
                <div className="text-neutral-400">已用</div>
                <div>{formatCredits(usage.used_credits)}</div>
              </div>
            </div>
          </div>

          <form action={grantCredits} className="space-y-2 rounded border p-3">
            <div className="text-sm font-medium">贈送 Credits</div>
            <input type="hidden" name="user_id" value={user.id} />
            <input
              name="amount"
              type="number"
              min="1"
              defaultValue="10000"
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <button type="submit" className="w-full rounded bg-neutral-900 px-3 py-2 text-sm text-white">
              增加到本期加值額度
            </button>
          </form>

          <form action={resetUsedCredits} className="space-y-2 rounded border border-red-200 bg-red-50/40 p-3">
            <div className="text-sm font-medium text-red-700">解除本期用盡狀態</div>
            <input type="hidden" name="user_id" value={user.id} />
            <input
              name="reason"
              placeholder="原因，例如：客服補償 / 測試重置"
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <button type="submit" className="w-full rounded bg-red-600 px-3 py-2 text-sm text-white">
              重置本期已用量為 0
            </button>
          </form>

          <div className="border-t pt-4">
            <div className="text-sm font-medium">訂閱與帳單</div>
            <div className="mt-3 space-y-3">
              <div className="text-sm">訂閱狀態：{user.subscription?.status ?? "—"}</div>
              <div className="text-sm">本期：{user.subscription ? `${new Date(user.subscription.current_period_start).toLocaleDateString()} - ${new Date(user.subscription.current_period_end).toLocaleDateString()}` : "—"}</div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {user.invoices.map((invoice) => (
              <div key={invoice.id} className="rounded border p-2 text-sm">
                <div>{invoice.type}</div>
                <div className="text-neutral-500">{formatTWD(invoice.amount)}</div>
              </div>
            ))}
          </div>
        </Card>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">最近對話</div>
          <div className="space-y-2">
            {user.conversations.map((conversation) => (
              <div key={conversation.id} className="rounded border p-3 text-sm">
                <div className="font-medium">{conversation.title}</div>
                <div className="text-neutral-500 mt-1">
                  {conversation.messages[0]
                    ? ((conversation.messages[0].content as { text?: string }).text ?? "").slice(0, 80)
                    : "—"}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-3">最近訂單</div>
          <div className="space-y-2">
            {user.orders.map((order) => (
              <div key={order.id} className="rounded border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{order.order_no}</div>
                  <div>{order.status}</div>
                </div>
                <div className="text-neutral-500 mt-1">
                  {formatTWD(order.total)} · {order.items.length} 項商品
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Admin 操作紀錄</div>
        <div className="space-y-2">
          {audits.map((item) => (
            <div key={item.id} className="rounded border p-3 text-sm">
              <div className="font-medium">{item.action}</div>
              <div className="text-neutral-500 mt-1">
                {new Date(item.created_at).toLocaleString()}
                {item.reason ? ` · ${item.reason}` : ""}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
