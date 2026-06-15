import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type ChatsPageProps = {
  searchParams?: {
    q?: string;
  };
};

function formatConversationTime(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "short",
    day: "numeric",
  }).format(value);
}

export default async function ChatsPage({ searchParams }: ChatsPageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const q = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const conversations = await prisma.conversation.findMany({
    where: {
      user_id: session.user.id,
      deleted_at: null,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              {
                messages: {
                  some: {
                    content: {
                      path: ["text"],
                      string_contains: q,
                      mode: "insensitive",
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      { pinned: "desc" },
      { last_message_at: { sort: "desc", nulls: "last" } },
      { updated_at: "desc" },
    ],
    take: 80,
    select: {
      id: true,
      title: true,
      pinned: true,
      last_message_at: true,
      updated_at: true,
      _count: { select: { messages: true } },
    },
  });

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas px-6 py-10 text-ink-900">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-display text-4xl font-medium tracking-[-0.015em] text-ink-900">Chats</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl border border-line1 bg-surface px-4 py-2 text-sm font-semibold text-ink-800 shadow-xs"
            >
              Select chats
            </button>
            <Link
              href="/generate"
              className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-ink-700"
            >
              <Plus className="h-4 w-4" />
              New chat
            </Link>
          </div>
        </div>

        <form action="/chats" className="mt-8">
          <label className="flex h-14 items-center gap-3 rounded-xl border border-line2 bg-surface px-4 shadow-xs transition focus-within:shadow-focus">
            <Search className="h-5 w-5 shrink-0 text-ink-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search chats..."
              className="h-full min-w-0 flex-1 bg-transparent text-base text-ink-800 outline-none placeholder:text-ink-400"
            />
          </label>
        </form>

        <div className="mt-8 divide-y divide-line1">
          {conversations.length > 0 ? (
            conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/generate?conversationId=${conversation.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 px-3 py-4 transition hover:bg-hover"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {conversation.pinned ? <span className="h-2 w-2 rounded-full bg-brand-500" /> : null}
                    <span className="truncate text-base font-medium text-ink-900">
                      {conversation.title || "新對話"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ink-400">
                    {conversation._count.messages} 則訊息
                  </div>
                </div>
                <div className="whitespace-nowrap text-sm text-ink-400">
                  {formatConversationTime(conversation.last_message_at || conversation.updated_at)}
                </div>
              </Link>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-line2 bg-surface px-6 py-12 text-center text-sm text-ink-500">
              找不到對話。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
