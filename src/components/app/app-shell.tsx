"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import {
  MessageSquare,
  Package,
  CreditCard,
  ShoppingBag,
  LifeBuoy,
  LogOut,
  Plus,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  body: string;
};

type RecentConversation = {
  id: string;
  title: string | null;
  pinned?: boolean;
  lastMessageAt?: string | null;
  createdAt?: string | null;
};

type AppShellProps = {
  children: React.ReactNode;
  userEmail: string;
  announcements: Announcement[];
  recentConversations: RecentConversation[];
  logoutAction: () => Promise<void>;
};

/**
 * Map a route path to one of the three G³ brand pillars (spec §4.5).
 * Used to set [data-accent] on <main> so module-level accent surfaces
 * (focus rings, hover halos, etc.) can branch on the active pillar.
 */
function deriveAccent(pathname: string): "generate" | "growth" | "global" {
  if (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/generate") ||
    pathname.startsWith("/sites")
  )
    return "generate";
  if (
    pathname.startsWith("/trade") ||
    pathname.startsWith("/support")
  )
    return "global";
  // analytics, orders, billing, settings — and the catch-all
  return "growth";
}

// Derive a display name + initial from the user email/id.
// Spec §4.1: avatar shows the first character of the user ID, uppercased.
function deriveUserDisplay(userEmail: string) {
  const local = userEmail.split("@")[0] ?? userEmail;
  // Common patterns: "windy.wang", "windy_wang", "windywang"
  // Show as "Windy Wang" when there is a separator, else local capitalised.
  const parts = local.split(/[._-]+/).filter(Boolean);
  const displayName = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || local;
  const initial = (local.charAt(0) || "?").toUpperCase();
  return { displayName, initial };
}

function SidebarLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "relative flex h-8 w-8 items-center justify-center" : "relative flex h-10 w-10 items-center justify-center"}>
      <span className="absolute inset-0 rounded-2xl bg-white/70 backdrop-blur" />
      <span
        className={compact ? "relative font-light text-xl bg-clip-text text-transparent" : "relative font-light text-2xl bg-clip-text text-transparent"}
        style={{ backgroundImage: "var(--g3-gradient-brand)" }}
      >
        G
      </span>
      <span
        className="relative -ml-1 -mt-3 text-[10px] font-medium bg-clip-text text-transparent"
        style={{ backgroundImage: "var(--g3-gradient-brand)" }}
      >
        3
      </span>
    </span>
  );
}

export function AppShell({
  children,
  userEmail,
  announcements,
  recentConversations,
  logoutAction,
}: AppShellProps) {
  const pathname = usePathname();
  const accent = deriveAccent(pathname);
  const { displayName, initial } = deriveUserDisplay(userEmail);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState(recentConversations);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(recentConversations.length >= 30);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyLoadingRef = useRef(false);

  useEffect(() => {
    setHistoryItems(recentConversations);
    setHistoryPage(1);
    setHistoryHasMore(recentConversations.length >= 30);
  }, [recentConversations]);

  const starredConversations = useMemo(
    () => historyItems.filter((conversation) => conversation.pinned),
    [historyItems],
  );
  const recentUnpinnedConversations = useMemo(
    () => historyItems.filter((conversation) => !conversation.pinned),
    [historyItems],
  );

  const loadMoreHistory = useCallback(async () => {
    if (historyLoadingRef.current || !historyHasMore) return;
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    const nextPage = historyPage + 1;
    try {
      const res = await fetch(`/api/conversations?page=${nextPage}&limit=30`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { data?: RecentConversation[] };
      const nextItems = Array.isArray(json.data) ? json.data : [];
      setHistoryItems((items) => {
        const existing = new Set(items.map((item) => item.id));
        return [...items, ...nextItems.filter((item) => !existing.has(item.id))];
      });
      setHistoryPage(nextPage);
      setHistoryHasMore(nextItems.length >= 30);
    } finally {
      historyLoadingRef.current = false;
      setHistoryLoading(false);
    }
  }, [historyHasMore, historyPage]);

  const handleHistoryScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight > 160) return;
    void loadMoreHistory();
  }, [loadMoreHistory]);

  const nav = [
    { href: "/chats", label: "對話", icon: MessageSquare },
    { href: "/support", label: "客服知識庫", icon: LifeBuoy },
    { href: "/orders", label: "訂單", icon: Package },
    { href: "/trade", label: "貿易", icon: ShoppingBag },
    { href: "/billing", label: "方案計費", icon: CreditCard },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#faf9f6] text-stone-950">
      <aside
        className={[
          "app-sidebar relative flex shrink-0 flex-col overflow-hidden border-r border-white/40 bg-g3-brand-soft transition-[width] duration-200 ease-out",
          sidebarOpen ? "w-64 sidebar-open" : "w-[72px] sidebar-closed",
        ].join(" ")}
      >
        {/* G³ AI Logo header (spec §4.1) */}
        <div className={sidebarOpen ? "border-b border-white/40 p-5" : "border-b border-white/40 px-3 py-4"}>
          {sidebarOpen ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <Link href="/generate" className="flex min-w-0 items-center gap-3">
                  <SidebarLogo />
                  <span className="sidebar-expanded-only min-w-0">
                    <span className="block text-base font-light tracking-[0.15em] text-stone-700">
                      G<sup className="text-[10px]">3</sup> AI
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition hover:bg-white/70 hover:text-stone-900"
                  aria-label="收合側邊欄"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Link
                href="/generate"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/70 text-stone-700 shadow-sm transition hover:bg-white"
                aria-label="回到對話首頁"
              >
                <SidebarLogo compact />
              </Link>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-stone-600 shadow-sm transition hover:bg-white hover:text-stone-950"
                aria-label="展開導覽側欄"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="border-b border-white/40 p-3">
          <Link
            href="/generate"
            className={[
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 bg-g3-brand",
              sidebarOpen ? "px-3" : "px-0",
            ].join(" ")}
          >
            <Plus className="h-4 w-4" />
            <span className="sidebar-expanded-only">新對話</span>
          </Link>
        </div>

        <nav className="space-y-1 p-2">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center rounded-xl py-2 text-sm transition hover:bg-white/60 ${
                  sidebarOpen ? "gap-2 px-3" : "justify-center px-0"
                } ${
                  active
                    ? "bg-white/80 text-stone-950 shadow-sm backdrop-blur"
                    : "text-stone-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="sidebar-expanded-only">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div
          className="scrollbar-none min-h-0 flex-1 overflow-auto border-t border-white/40 p-2"
          onScroll={handleHistoryScroll}
        >
          {sidebarOpen ? (
            <div className="space-y-5 px-1 py-4">
              {starredConversations.length > 0 ? (
                <div>
                  <div className="mb-2 px-2 text-xs font-medium text-stone-500">Starred</div>
                  <div className="space-y-1">
                    {starredConversations.map((conversation) => (
                      <Link
                        key={conversation.id}
                        href={`/generate?conversationId=${conversation.id}`}
                        className="block rounded-xl px-2 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-white/60 hover:text-stone-950"
                      >
                        <span className="block truncate">{conversation.title || "新對話"}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 px-2 text-xs font-medium text-stone-500">Recents</div>
                <div className="space-y-1">
                  {recentUnpinnedConversations.length > 0 ? (
                    recentUnpinnedConversations.map((conversation) => (
                      <Link
                        key={conversation.id}
                        href={`/generate?conversationId=${conversation.id}`}
                        className="block rounded-xl px-2 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-white/60 hover:text-stone-950"
                      >
                        <span className="block truncate">{conversation.title || "新對話"}</span>
                      </Link>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/60 bg-white/30 px-3 py-4 text-xs leading-5 text-stone-500">
                      還沒有歷史對話
                    </div>
                  )}
                  {historyHasMore || historyLoading ? (
                    <button
                      type="button"
                      onClick={() => void loadMoreHistory()}
                      disabled={historyLoading}
                      className="mt-2 w-full rounded-xl px-2 py-2 text-xs font-medium text-stone-500 transition hover:bg-white/50 hover:text-stone-800 disabled:opacity-60"
                    >
                      {historyLoading ? "載入中..." : "載入更多"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              {historyItems.slice(0, 10).map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/generate?conversationId=${conversation.id}`}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500 transition hover:bg-white/60 hover:text-stone-950"
                  title={conversation.title || "新對話"}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/40 p-2">
          <Link
            href="/settings"
            className={`flex items-center rounded-xl py-2 text-sm transition hover:bg-white/60 ${
              sidebarOpen ? "gap-2 px-3" : "justify-center px-0"
            } ${
              pathname.startsWith("/settings")
                ? "bg-white/80 text-stone-950 shadow-sm backdrop-blur"
                : "text-stone-700"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span className="sidebar-expanded-only">設定</span>
          </Link>
        </div>

        {/* User row (spec §4.1) — avatar (first letter, growth-tinted) + display name */}
        <div className="border-t border-white/40 p-3">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
              style={{ backgroundImage: "var(--g3-gradient-brand)" }}
              aria-hidden
            >
              {initial}
            </div>
            <div className="sidebar-expanded-only flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-white/70 px-3 py-1.5 text-sm text-stone-800 backdrop-blur">
              <span className="block truncate" title={userEmail}>
                {displayName}
              </span>
            </div>
            <form action={logoutAction} className="sidebar-expanded-only">
              <button
                type="submit"
                className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition hover:bg-white/60 hover:text-stone-950"
                title="登出"
                aria-label="登出"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col" data-accent={accent}>
        {announcements.length > 0 ? (
          <div className="shrink-0 space-y-2 border-b bg-amber-50 px-6 py-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-md border border-amber-200 bg-white/80 px-4 py-3">
                <div className="text-sm font-medium text-amber-900">{announcement.title}</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-amber-950/80">{announcement.body}</div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
