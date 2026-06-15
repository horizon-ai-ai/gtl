import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app/app-shell";

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
  const recentConversations = await prisma.conversation.findMany({
    where: {
      user_id: session.user.id,
      deleted_at: null,
    },
    orderBy: [
      { pinned: "desc" },
      { last_message_at: { sort: "desc", nulls: "last" } },
      { updated_at: "desc" },
    ],
    take: 30,
    select: {
      id: true,
      title: true,
      pinned: true,
      last_message_at: true,
      created_at: true,
    },
  });

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell
      userEmail={session.user.email ?? ""}
      announcements={announcements.map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
      }))}
      recentConversations={recentConversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        pinned: conversation.pinned,
        lastMessageAt: conversation.last_message_at?.toISOString() ?? null,
        createdAt: conversation.created_at.toISOString(),
      }))}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
