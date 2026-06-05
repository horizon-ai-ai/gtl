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

export function AppShell({
  children,
  userEmail,
  announcements,
  recentConversations,
  logoutAction,
}: AppShellProps) {
  const pathname = usePathname();
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
      <aside className="app-sidebar flex w-64 shrink-0 flex-col overflow-hidden border-r border-stone-200 bg-[#fbfaf8] transition-[width] duration-200 ease-out">
        <div className="border-b border-stone-200 p-4">
          <Link href="/generate" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-950 text-sm font-semibold text-white">
              G
            </span>
            <span className="sidebar-expanded-only min-w-0">
              <span className="block truncate text-sm font-semibold">GTL Workspace</span>
              <span className="block text-xs text-stone-500">Image · Text · Web</span>
            </span>
          </Link>
          <label
            htmlFor="app-sidebar-collapsed"
            className="mt-3 flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white text-xs font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
            aria-label="收合側邊欄"
          >
            <ChevronLeft className="sidebar-collapse-icon h-4 w-4" />
            <ChevronRight className="sidebar-expand-icon hidden h-4 w-4" />
            <span className="sidebar-expanded-only">收合</span>
          </label>
        </div>

        <div className="border-b border-stone-200 p-3">
          <Link
            href="/generate"
            className="flex items-center justify-center gap-2 rounded-xl bg-stone-950 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800"
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
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition hover:bg-stone-100 ${
                  active ? "bg-white text-stone-950 shadow-sm" : "text-stone-600"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="sidebar-expanded-only">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-expanded-only scrollbar-none min-h-0 flex-1 overflow-auto border-t border-stone-200 p-3">
          <div className="mb-2 px-2 text-xs font-semibold text-stone-400">最近對話</div>
          <div className="space-y-1">
            {recentConversations.length > 0 ? (
              recentConversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/generate?conversationId=${conversation.id}`}
                  className="block rounded-xl px-3 py-2 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
                >
                  <span className="block truncate">{conversation.title || "新對話"}</span>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-stone-200 px-3 py-4 text-xs leading-5 text-stone-400">
                還沒有歷史對話
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-stone-200 p-3 text-xs">
          <div className="sidebar-expanded-only truncate px-3 py-1">{userEmail}</div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-stone-600 transition hover:bg-stone-100 hover:text-stone-950"
            >
              <LogOut className="h-4 w-4" />
              <span className="sidebar-expanded-only">登出</span>
            </button>
          </form>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
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
