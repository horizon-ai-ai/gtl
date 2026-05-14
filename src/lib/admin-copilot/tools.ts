import { prisma } from "@/lib/db";
import { formatTWD } from "@/lib/utils";
import { buildDashboardData } from "@/lib/analytics/ga4";
import type { AdminCopilotToolName } from "./planner";

export type AdminCopilotToolCard = {
  tool: AdminCopilotToolName;
  title: string;
  summary: string;
  items: Array<Record<string, unknown>>;
};

type DashboardTable = {
  rows: Array<Record<string, string | number>>;
  totals?: Record<string, number>;
};

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function extractEmail(query: string) {
  const match = query.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function normalizeDashboardTable(value: unknown): DashboardTable {
  const candidate = value as { rows?: unknown; totals?: unknown } | null;
  if (candidate && Array.isArray(candidate.rows)) {
    return {
      rows: candidate.rows as Array<Record<string, string | number>>,
      totals: candidate.totals && typeof candidate.totals === "object" ? (candidate.totals as Record<string, number>) : undefined,
    };
  }

  return { rows: [] };
}

export async function runAdminCopilotTool(name: AdminCopilotToolName, query: string): Promise<AdminCopilotToolCard> {
  switch (name) {
    case "get_daily_briefing":
      return getDailyBriefing();
    case "get_order_summary":
      return getOrderSummary();
    case "get_support_summary":
      return getSupportSummary();
    case "get_trade_summary":
      return getTradeSummary();
    case "get_analytics_summary":
      return getAnalyticsSummary();
    case "get_analytics_dashboard_detail":
      return getAnalyticsDashboardDetail();
    case "get_upgrade_candidates":
      return getUpgradeCandidates();
    case "get_user_summary":
      return getUserSummary(query);
    default:
      return {
        tool: name,
        title: name,
        summary: "No data",
        items: [],
      };
  }
}

async function getDailyBriefing(): Promise<AdminCopilotToolCard> {
  const sevenDaysAgo = daysAgo(7);
  const [users, openTickets, orders, inquiries] = await Promise.all([
    prisma.user.count({ where: { created_at: { gte: sevenDaysAgo }, deleted_at: null } }),
    prisma.supportTicket.count({ where: { status: { in: ["open", "in_progress"] } } }),
    prisma.order.aggregate({
      where: { created_at: { gte: sevenDaysAgo }, deleted_at: null },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.inquiry.count({ where: { created_at: { gte: sevenDaysAgo } } }),
  ]);

  return {
    tool: "get_daily_briefing",
    title: "近期營運摘要",
    summary: `近 7 天新增 ${users} 位用戶、${orders._count._all} 筆訂單、${inquiries} 筆詢價，未結工單 ${openTickets} 張。`,
    items: [
      { metric: "new_users_7d", value: users },
      { metric: "orders_7d", value: orders._count._all },
      { metric: "gmv_7d", value: formatTWD(Number(orders._sum.total ?? 0)) },
      { metric: "open_tickets", value: openTickets },
      { metric: "trade_inquiries_7d", value: inquiries },
    ],
  };
}

async function getOrderSummary(): Promise<AdminCopilotToolCard> {
  const orders = await prisma.order.findMany({
    where: { deleted_at: null },
    orderBy: { created_at: "desc" },
    take: 10,
    include: { items: true, user: { select: { email: true, display_name: true } } },
  });
  const byStatus = await prisma.order.groupBy({
    by: ["status"],
    _count: { _all: true },
    _sum: { total: true },
  });

  return {
    tool: "get_order_summary",
    title: "訂單與 GMV",
    summary: byStatus.map((row) => `${row.status}:${row._count._all}`).join("，"),
    items: [
      ...byStatus.map((row) => ({
        type: "status_summary",
        status: row.status,
        count: row._count._all,
        total: formatTWD(Number(row._sum.total ?? 0)),
      })),
      ...orders.map((order) => ({
        type: "recent_order",
        href: `/admin/orders/${order.id}`,
        href_label: "查看訂單",
        order_no: order.order_no,
        status: order.status,
        total: formatTWD(order.total),
        customer: order.user.display_name ?? order.user.email,
      })),
    ],
  };
}

async function getSupportSummary(): Promise<AdminCopilotToolCard> {
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { created_at: "desc" },
    take: 10,
  });
  const byStatus = await prisma.supportTicket.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  return {
    tool: "get_support_summary",
    title: "客服工單狀態",
    summary: byStatus.map((row) => `${row.status}:${row._count._all}`).join("，"),
    items: [
      ...byStatus.map((row) => ({
        type: "status_summary",
        status: row.status,
        count: row._count._all,
      })),
      ...tickets.map((ticket) => ({
        type: "recent_ticket",
        href: `/admin/support/${ticket.id}`,
        href_label: "查看工單",
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
      })),
    ],
  };
}

async function getTradeSummary(): Promise<AdminCopilotToolCard> {
  const [products, inquiries, recentInquiries] = await Promise.all([
    prisma.product.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.inquiry.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.inquiry.findMany({
      orderBy: { created_at: "desc" },
      take: 10,
      include: {
        product: { select: { id: true, name: true } },
        buyer: { select: { email: true, display_name: true } },
      },
    }),
  ]);

  return {
    tool: "get_trade_summary",
    title: "貿易模組摘要",
    summary: `商品狀態：${products.map((row) => `${row.status}:${row._count._all}`).join("，")}；詢價狀態：${inquiries.map((row) => `${row.status}:${row._count._all}`).join("，")}`,
    items: [
      ...products.map((row) => ({ type: "product_status", status: row.status, count: row._count._all })),
      ...inquiries.map((row) => ({ type: "inquiry_status", status: row.status, count: row._count._all })),
      ...recentInquiries.map((inquiry) => ({
        type: "recent_inquiry",
        href: "/admin/trade/products",
        href_label: "查看商品審核",
        product: inquiry.product.name,
        product_id: inquiry.product.id,
        buyer: inquiry.buyer.display_name ?? inquiry.buyer.email,
        quantity: inquiry.quantity,
        status: inquiry.status,
      })),
    ],
  };
}

async function getAnalyticsSummary(): Promise<AdminCopilotToolCard> {
  const sevenDaysAgo = daysAgo(7);
  const [activeConnections, staleConnections, recentConnections, recentInsights, recentToolCalls] = await Promise.all([
    prisma.googleAnalyticsConnection.count({
      where: { status: "active" },
    }),
    prisma.googleAnalyticsConnection.count({
      where: {
        status: "active",
        OR: [{ last_sync_at: null }, { last_sync_at: { lt: daysAgo(2) } }],
      },
    }),
    prisma.googleAnalyticsConnection.findMany({
      where: { status: "active" },
      orderBy: [{ last_sync_at: "desc" }, { updated_at: "desc" }],
      take: 8,
      include: {
        user: { select: { email: true, display_name: true } },
      },
    }),
    prisma.analyticsInsight.findMany({
      orderBy: { created_at: "desc" },
      take: 8,
      include: {
        user: { select: { email: true, display_name: true } },
        connection: { select: { property_name: true, property_id: true } },
      },
    }),
    prisma.analyticsToolCall.groupBy({
      by: ["tool_name", "status"],
      where: { created_at: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
  ]);

  return {
    tool: "get_analytics_summary",
    title: "Analytics / GA 摘要",
    summary: `目前有 ${activeConnections} 個 GA 連線，其中 ${staleConnections} 個同步過舊或尚未同步；近 7 天有 ${recentToolCalls.reduce((acc, row) => acc + row._count._all, 0)} 次 analytics tool call。`,
    items: [
      { type: "overview", active_connections: activeConnections, stale_connections: staleConnections },
      ...recentConnections.map((connection) => ({
        type: "connection",
        href: `/admin/analytics?connection_id=${connection.id}`,
        href_label: "查看 Analytics",
        property_name: connection.property_name,
        property_id: connection.property_id,
        owner: connection.user.display_name ?? connection.user.email,
        last_sync_at: connection.last_sync_at?.toISOString() ?? null,
        status: connection.status,
      })),
      ...recentInsights.map((insight) => ({
        type: "insight",
        href: `/admin/analytics?connection_id=${insight.connection_id}`,
        href_label: "查看 Analytics",
        severity: insight.severity,
        title: insight.title,
        owner: insight.user.display_name ?? insight.user.email,
        property_name: insight.connection.property_name,
        created_at: insight.created_at.toISOString(),
      })),
      ...recentToolCalls.map((row) => ({
        type: "tool_usage",
        tool_name: row.tool_name,
        status: row.status,
        count: row._count._all,
      })),
    ],
  };
}

async function getAnalyticsDashboardDetail(): Promise<AdminCopilotToolCard> {
  const connections = await prisma.googleAnalyticsConnection.findMany({
    where: { status: "active" },
    orderBy: [{ last_sync_at: "desc" }, { updated_at: "desc" }],
    take: 2,
    include: {
      user: { select: { email: true, display_name: true } },
    },
  });

  if (connections.length === 0) {
    return {
      tool: "get_analytics_dashboard_detail",
      title: "GA Dashboard 明細",
      summary: "目前沒有可用的 GA 連線。",
      items: [],
    };
  }

  const details = await Promise.all(
    connections.map(async (connection) => {
      try {
        const dashboard = await buildDashboardData(connection);
        return {
          connection,
          dashboard,
          error: null,
        };
      } catch (error) {
        return {
          connection,
          dashboard: null,
          error: error instanceof Error ? error.message : "Dashboard 載入失敗",
        };
      }
    }),
  );

  return {
    tool: "get_analytics_dashboard_detail",
    title: "GA Dashboard 明細",
    summary: `彙整 ${details.length} 個 GA Property 的 overview、來源、熱門頁與轉換。`,
    items: details.reduce<Array<Record<string, unknown>>>((acc, { connection, dashboard, error }) => {
      if (!dashboard) {
        acc.push({
          type: "dashboard_error",
          href: `/admin/analytics?connection_id=${connection.id}`,
          href_label: "查看 Analytics",
          property_name: connection.property_name,
          owner: connection.user.display_name ?? connection.user.email,
          error,
        });
        return acc;
      }

      acc.push({
        type: "dashboard_overview",
        href: `/admin/analytics?connection_id=${connection.id}`,
        href_label: "查看 Analytics",
        property_name: connection.property_name,
        owner: connection.user.display_name ?? connection.user.email,
        active_users: dashboard.overview.totals.activeUsers,
        sessions: dashboard.overview.totals.sessions,
        page_views: dashboard.overview.totals.screenPageViews,
      });

      for (const row of normalizeDashboardTable(dashboard.sources).rows.slice(0, 3)) {
        acc.push({
          type: "dashboard_source",
          href: `/admin/analytics?connection_id=${connection.id}`,
          href_label: "查看 Analytics",
          property_name: connection.property_name,
          channel: row.sessionDefaultChannelGroup,
          sessions: row.sessions,
          active_users: row.activeUsers,
        });
      }

      for (const row of normalizeDashboardTable(dashboard.top_pages).rows.slice(0, 3)) {
        acc.push({
          type: "dashboard_page",
          href: `/admin/analytics?connection_id=${connection.id}`,
          href_label: "查看 Analytics",
          property_name: connection.property_name,
          page_path: row.pagePath,
          page_views: row.screenPageViews,
          avg_duration: row.averageSessionDuration,
        });
      }

      for (const row of normalizeDashboardTable(dashboard.conversions).rows.slice(0, 3)) {
        acc.push({
          type: "dashboard_conversion",
          href: `/admin/analytics?connection_id=${connection.id}`,
          href_label: "查看 Analytics",
          property_name: connection.property_name,
          event_name: row.eventName,
          conversions: row.conversions,
        });
      }

      return acc;
    }, []),
  };
}

async function getUpgradeCandidates(): Promise<AdminCopilotToolCard> {
  const candidates = await prisma.user.findMany({
    where: {
      deleted_at: null,
      subscription: {
        is: {
          plan: {
            code: { in: ["free", "starter"] },
          },
        },
      },
      usages: {
        some: {},
      },
    },
    take: 10,
    include: {
      subscription: { include: { plan: true } },
      usages: { orderBy: { updated_at: "desc" }, take: 1 },
    },
    orderBy: { updated_at: "desc" },
  });

  return {
    tool: "get_upgrade_candidates",
    title: "升級候選用戶",
    summary: `找到 ${candidates.length} 位近期有使用、仍停留在低方案的候選用戶。`,
    items: candidates.map((user) => {
      const usage = user.usages[0];
      const total = Number((usage?.plan_credits ?? BigInt(0)) + (usage?.topup_credits ?? BigInt(0)));
      const used = Number(usage?.used_credits ?? BigInt(0));
      return {
        href: `/admin/users/${user.id}`,
        href_label: "查看用戶",
        email: user.email,
        plan: user.subscription?.plan.name ?? "未訂閱",
        used_credits: used,
        available_ratio: total > 0 ? `${Math.round((used / total) * 100)}%` : "n/a",
      };
    }),
  };
}

async function getUserSummary(query: string): Promise<AdminCopilotToolCard> {
  const email = extractEmail(query);
  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        include: {
          company: true,
          subscription: { include: { plan: true } },
          orders: { where: { deleted_at: null }, orderBy: { created_at: "desc" }, take: 5 },
          conversations: { orderBy: { updated_at: "desc" }, take: 5 },
        },
      })
    : null;

  if (!user) {
    return {
      tool: "get_user_summary",
      title: "用戶摘要",
      summary: email ? `找不到 ${email}` : "未提供可識別的 email，無法查詢特定用戶。",
      items: [],
    };
  }

  return {
    tool: "get_user_summary",
    title: `用戶摘要：${user.email}`,
    summary: `${user.subscription?.plan.name ?? "未訂閱"} · 訂單 ${user.orders.length} 筆 · 對話 ${user.conversations.length} 筆`,
    items: [
      {
        href: `/admin/users/${user.id}`,
        href_label: "查看用戶",
        email: user.email,
        role: user.role,
        type: user.type,
        plan: user.subscription?.plan.name ?? "未訂閱",
        company: user.company?.name ?? null,
      },
      ...user.orders.map((order) => ({
        type: "order",
        href: `/admin/orders/${order.id}`,
        href_label: "查看訂單",
        order_no: order.order_no,
        status: order.status,
        total: formatTWD(order.total),
      })),
    ],
  };
}
