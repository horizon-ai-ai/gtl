import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import {
  LayoutDashboard,
  Users,
  Package,
  LifeBuoy,
  Megaphone,
  FileText,
  Boxes,
  BookOpen,
  LogOut,
  Sparkles,
  ChartColumn,
  Cpu,
} from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "super_admin") {
    redirect("/login?portal=admin");
  }

  const nav = [
    { href: "/admin", label: "儀表板", icon: LayoutDashboard },
    { href: "/admin/users", label: "用戶", icon: Users },
    { href: "/admin/orders", label: "訂單", icon: Package },
    { href: "/admin/support", label: "人工支援", icon: LifeBuoy },
    { href: "/admin/copilot", label: "Admin Copilot", icon: Sparkles },
    { href: "/admin/models", label: "AI 模型設定", icon: Cpu },
    { href: "/admin/analytics", label: "Analytics", icon: ChartColumn },
    { href: "/admin/trade", label: "Trade Ops", icon: Boxes },
    { href: "/admin/trade/profiles", label: "身份審核", icon: Boxes },
    { href: "/admin/trade/products", label: "商品列表", icon: Boxes },
    { href: "/admin/trade/categories", label: "商品類型", icon: Boxes },
    { href: "/admin/trade/quotations", label: "Quotation", icon: Boxes },
    { href: "/admin/trade/lifecycle", label: "生命週期", icon: Boxes },
    { href: "/admin/kb", label: "知識庫", icon: BookOpen },
    { href: "/admin/announcements", label: "公告", icon: Megaphone },
    { href: "/admin/audit", label: "Audit Log", icon: FileText },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-ink-900">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line1 bg-surface/95 shadow-sm">
        <div className="border-b border-line1 p-5">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ink-900 text-sm font-semibold text-canvas">
              G
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink-900">GTL Admin</span>
              <span className="block text-xs text-ink-500">Orders · Support · Trade</span>
            </span>
          </Link>
        </div>
        <nav className="scrollbar-none flex-1 space-y-1 overflow-auto p-3">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ink-700 transition-[background,color,transform] duration-120 ease-smooth hover:-translate-y-px hover:bg-hover hover:text-ink-900"
            >
              <Icon className="h-4 w-4 text-ink-400" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line1 p-3 text-xs">
          <div className="mb-2 rounded-md bg-sunken px-3 py-2 text-ink-700">
            <div className="truncate font-medium">{session.user.email}</div>
            <div className="mt-0.5 text-ink-400">{session.user.role}</div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-ink-500 transition hover:bg-hover hover:text-ink-900"
            >
              <LogOut className="h-4 w-4" />
              登出
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
