import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CreditCard, UserRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      subscription: { include: { plan: true } },
      company: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-canvas px-6 py-10 text-ink-900">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">Personal settings</div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-[-0.015em] text-ink-900">個人設定</h1>
          <p className="mt-2 text-sm text-ink-500">管理目前登入帳號、方案與個人偏好。</p>
        </div>

        <section className="rounded-2xl border border-line1 bg-surface p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sunken text-ink-600">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-ink-900">帳號資訊</h2>
              <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                <Info label="Email" value={user.email} />
                <Info label="顯示名稱" value={user.display_name || "未設定"} />
                <Info label="帳號類型" value={user.type === "company" ? "公司" : "個人"} />
                <Info label="權限角色" value={user.role} />
                <Info label="狀態" value={user.status} />
                <Info label="建立時間" value={user.created_at.toLocaleDateString("zh-TW")} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/billing"
            className="group rounded-2xl border border-line1 bg-surface p-5 shadow-sm transition hover:border-line2 hover:bg-hover"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunken text-ink-600 transition group-hover:bg-accent-50 group-hover:text-accent-600">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-ink-900">方案與點數</div>
                <div className="mt-1 text-sm text-ink-500">
                  {user.subscription?.plan?.name ?? "未訂閱方案"}
                </div>
              </div>
            </div>
          </Link>

          <Link
            href="/settings/integrations"
            className="group rounded-2xl border border-line1 bg-surface p-5 shadow-sm transition hover:border-line2 hover:bg-hover"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunken text-ink-600 transition group-hover:bg-accent-50 group-hover:text-accent-600">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-ink-900">整合設定</div>
                <div className="mt-1 text-sm text-ink-500">Google Analytics 與第三方資料來源。</div>
              </div>
            </div>
          </Link>
        </section>

        {user.company ? (
          <section className="rounded-2xl border border-line1 bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-ink-900">公司資料</h2>
            <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
              <Info label="公司名稱" value={user.company.name} />
              <Info label="統一編號" value={user.company.tax_id || "未設定"} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sunken px-4 py-3">
      <div className="text-xs font-medium text-ink-400">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-ink-800">{value}</div>
    </div>
  );
}
