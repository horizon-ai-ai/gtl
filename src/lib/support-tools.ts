import { prisma } from "@/lib/db";
import { ensureUsage } from "@/lib/credits";
import { formatTWD } from "@/lib/utils";

export type SupportToolResult = {
  tool: "lookup_recent_orders" | "lookup_subscription" | "lookup_usage" | "lookup_open_tickets";
  title: string;
  summary: string;
  items: Array<Record<string, unknown>>;
};

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function selectSupportTools(question: string) {
  const normalized = question.toLowerCase();
  const tools = new Set<SupportToolResult["tool"]>();

  if (hasAny(normalized, ["訂單", "order", "下單", "取消", "退款", "出貨"])) {
    tools.add("lookup_recent_orders");
  }
  if (hasAny(normalized, ["方案", "訂閱", "升級", "billing", "plan", "subscription", "付費"])) {
    tools.add("lookup_subscription");
  }
  if (hasAny(normalized, ["額度", "credits", "token", "用量", "usage", "剩餘"])) {
    tools.add("lookup_usage");
  }
  if (hasAny(normalized, ["工單", "客服", "ticket", "support", "人工"])) {
    tools.add("lookup_open_tickets");
  }

  if (tools.size === 0) {
    tools.add("lookup_subscription");
    tools.add("lookup_usage");
  }

  return Array.from(tools);
}

async function lookupRecentOrders(userId: string): Promise<SupportToolResult> {
  const orders = await prisma.order.findMany({
    where: { user_id: userId, deleted_at: null },
    orderBy: { created_at: "desc" },
    take: 5,
    include: { items: true },
  });

  return {
    tool: "lookup_recent_orders",
    title: "最近訂單",
    summary:
      orders.length === 0
        ? "目前查不到你的訂單。"
        : `最近 ${orders.length} 筆訂單已載入，可用來回答出貨、狀態、取消或退款相關問題。`,
    items: orders.map((order) => ({
      href: `/orders/${order.id}`,
      href_label: "查看訂單",
      order_id: order.id,
      order_no: order.order_no,
      status: order.status,
      total: formatTWD(order.total),
      created_at: order.created_at.toISOString(),
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
      })),
    })),
  };
}

async function lookupSubscription(userId: string): Promise<SupportToolResult> {
  const subscription = await prisma.subscription.findUnique({
    where: { user_id: userId },
    include: { plan: true },
  });

  if (!subscription) {
    return {
      tool: "lookup_subscription",
      title: "目前方案",
      summary: "目前查不到有效訂閱，系統會視為未訂閱或免費使用。",
      items: [],
    };
  }

  return {
    tool: "lookup_subscription",
    title: "目前方案",
    summary: `${subscription.plan.name} · ${subscription.status}`,
    items: [
      {
        plan_code: subscription.plan.code,
        plan_name: subscription.plan.name,
        status: subscription.status,
        current_period_start: subscription.current_period_start.toISOString(),
        current_period_end: subscription.current_period_end.toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        monthly_credits: Number(subscription.plan.monthly_credits),
      },
    ],
  };
}

async function lookupUsage(userId: string): Promise<SupportToolResult> {
  const usage = await ensureUsage(userId);
  const available = Number(usage.plan_credits + usage.topup_credits - usage.used_credits);

  return {
    tool: "lookup_usage",
    title: "本期用量",
    summary: `本期已使用 ${Number(usage.used_credits)} credits，剩餘 ${available} credits。`,
    items: [
      {
        period: usage.period,
        plan_credits: Number(usage.plan_credits),
        topup_credits: Number(usage.topup_credits),
        used_credits: Number(usage.used_credits),
        available_credits: available,
        reset_at: usage.reset_at.toISOString(),
      },
    ],
  };
}

async function lookupOpenTickets(userId: string): Promise<SupportToolResult> {
  const tickets = await prisma.supportTicket.findMany({
    where: { user_id: userId, status: { in: ["open", "in_progress"] } },
    orderBy: { created_at: "desc" },
    take: 5,
  });

  return {
    tool: "lookup_open_tickets",
    title: "目前客服工單",
    summary:
      tickets.length === 0
        ? "目前沒有待處理中的客服工單。"
        : `目前有 ${tickets.length} 張待處理或處理中的工單。`,
    items: tickets.map((ticket) => ({
      ticket_id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      created_at: ticket.created_at.toISOString(),
    })),
  };
}

export async function resolveSupportToolResults(userId: string, question: string) {
  const selected = selectSupportTools(question);
  const results = await Promise.all(
    selected.map((tool) => {
      switch (tool) {
        case "lookup_recent_orders":
          return lookupRecentOrders(userId);
        case "lookup_subscription":
          return lookupSubscription(userId);
        case "lookup_usage":
          return lookupUsage(userId);
        case "lookup_open_tickets":
          return lookupOpenTickets(userId);
      }
    }),
  );

  const context = results
    .map(
      (result, index) =>
        `[DATA ${index + 1}] ${result.title}\n摘要: ${result.summary}\n資料: ${JSON.stringify(result.items, null, 2)}`,
    )
    .join("\n\n");

  return { results, context };
}
