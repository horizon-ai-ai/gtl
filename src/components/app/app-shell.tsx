"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  body: string;
};

type RecentConversation = {
  id: string;
  title: string | null;
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

  const nav = [
    { href: "/generate", label: "對話", icon: MessageSquare },
    { href: "/support", label: "客服知識庫", icon: LifeBuoy },
    { href: "/orders", label: "訂單", icon: Package },
    { href: "/trade", label: "貿易", icon: ShoppingBag },
    { href: "/billing", label: "方案計費", icon: CreditCard },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#faf9f6] text-stone-950">
      <input id="app-sidebar-collapsed" type="checkbox" className="sidebar-collapsed-toggle sr-only" />
      <aside className="app-sidebar relative flex w-64 shrink-0 flex-col overflow-hidden border-r border-white/40 bg-g3-brand-soft transition-[width] duration-200 ease-out">
        {/* G³ AI Logo header (spec §4.1) */}
        <div className="border-b border-white/40 p-5">
          <Link href="/generate" className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center">
              <span className="absolute inset-0 rounded-2xl bg-white/70 backdrop-blur" />
              <span
                className="relative font-light text-2xl bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--g3-gradient-brand)" }}
              >
                G
              </span>
              <span
                className="relative -mt-3 -ml-1 text-[10px] font-medium bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--g3-gradient-brand)" }}
              >
                3
              </span>
            </span>
            <span className="sidebar-expanded-only min-w-0">
              <span className="block text-base font-light tracking-[0.15em] text-stone-700">
                G<sup className="text-[10px]">3</sup> AI
              </span>
            </span>
          </Link>
          <label
            htmlFor="app-sidebar-collapsed"
            className="mt-4 flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/60 text-xs font-medium text-stone-600 backdrop-blur transition hover:bg-white/90 hover:text-stone-950"
            aria-label="收合側邊欄"
          >
            <ChevronLeft className="sidebar-collapse-icon h-4 w-4" />
            <ChevronRight className="sidebar-expand-icon hidden h-4 w-4" />
            <span className="sidebar-expanded-only">收合</span>
          </label>
        </div>

        <div className="border-b border-white/40 p-3">
          <Link
            href="/generate"
            className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 bg-g3-brand"
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
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition hover:bg-white/60 ${
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

        <div className="sidebar-expanded-only scrollbar-none min-h-0 flex-1 overflow-auto border-t border-white/40 p-3">
          <div className="mb-2 px-2 text-xs font-semibold text-stone-500">最近對話</div>
          <div className="space-y-1">
            {recentConversations.length > 0 ? (
              recentConversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/generate?conversationId=${conversation.id}`}
                  className="block rounded-xl px-3 py-2 text-sm text-stone-700 transition hover:bg-white/60 hover:text-stone-950"
                >
                  <span className="block truncate">{conversation.title || "新對話"}</span>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/60 bg-white/30 px-3 py-4 text-xs leading-5 text-stone-500">
                還沒有歷史對話
              </div>
            )}
          </div>
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
