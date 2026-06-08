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
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-neutral-900 text-white flex flex-col">
        <div className="p-4 border-b border-neutral-800 font-semibold">Admin Portal</div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-neutral-800"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-neutral-800 text-xs">
          <div className="px-3 py-1 truncate">{session.user.email}</div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-2 px-3 py-2 rounded-md w-full hover:bg-neutral-800"
            >
              <LogOut className="w-4 h-4" />
              登出
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-neutral-50">{children}</main>
    </div>
  );
}
