import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  MessageSquare,
  Package,
  CreditCard,
  ShoppingBag,
  LifeBuoy,
  LogOut,
} from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: {
      active: true,
      starts_at: { lte: now },
      OR: [{ ends_at: null }, { ends_at: { gte: now } }],
      audience:
        session.user.type === "company"
          ? { in: ["all", "company"] }
          : { in: ["all", "personal"] },
    },
    orderBy: [{ starts_at: "desc" }],
    take: 3,
  });

  const nav = [
    { href: "/chat", label: "對話", icon: MessageSquare },
    { href: "/support", label: "客服知識庫", icon: LifeBuoy },
    { href: "/orders", label: "訂單", icon: Package },
    { href: "/trade", label: "貿易", icon: ShoppingBag },
    { href: "/billing", label: "方案計費", icon: CreditCard },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-neutral-50 flex flex-col">
        <div className="p-4 border-b">
          <Link href="/chat" className="font-semibold">Marketing AI</Link>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-neutral-100"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t text-xs">
          <div className="px-3 py-1 truncate">{session.user.email}</div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-2 px-3 py-2 rounded-md w-full hover:bg-neutral-100"
            >
              <LogOut className="w-4 h-4" />
              登出
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        {announcements.length > 0 ? (
          <div className="space-y-2 border-b bg-amber-50 px-6 py-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="rounded-md border border-amber-200 bg-white/80 px-4 py-3">
                <div className="text-sm font-medium text-amber-900">{announcement.title}</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-amber-950/80">{announcement.body}</div>
              </div>
            ))}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
