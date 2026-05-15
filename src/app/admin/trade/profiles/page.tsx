import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";

async function moderateProfile(formData: FormData) {
  "use server";

  const admin = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!userId || !["approve", "request_changes"].includes(decision)) return;

  const verified = decision === "approve";
  const profile = await prisma.tradeProfile.update({
    where: { user_id: userId },
    data: { verified },
    include: {
      user: {
        select: {
          email: true,
          display_name: true,
          company: { select: { name: true } },
        },
      },
    },
  });

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "trade_profile_review",
      target_type: "trade_profile",
      target_id: userId,
      payload: {
        decision,
        verified,
        role: profile.role,
      },
    },
  });

  revalidatePath("/admin/trade/profiles");
}

export default async function AdminTradeProfilesPage() {
  await requireAdmin();

  const profiles = await prisma.tradeProfile.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          display_name: true,
          company: {
            select: {
              name: true,
              tax_id: true,
            },
          },
        },
      },
    },
    orderBy: [{ verified: "asc" }, { updated_at: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">身份審核</h1>
        <p className="mt-1 text-sm text-neutral-500">
          使用者升級方案後可申請賣家身份；需由 admin 審核通過後，才可使用商品上架與 Seller quotation 流程。
        </p>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="p-3 text-left">帳號</th>
              <th className="p-3 text-left">公司</th>
              <th className="p-3 text-left">角色</th>
              <th className="p-3 text-left">產品類別</th>
              <th className="p-3 text-left">目標市場</th>
              <th className="p-3 text-left">狀態</th>
              <th className="p-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.user_id} className="border-b align-top last:border-0">
                <td className="p-3">
                  <div className="font-medium">{profile.user.display_name ?? profile.user.email}</div>
                  <div className="text-xs text-neutral-500">{profile.user.email}</div>
                </td>
                <td className="p-3">
                  <div>{profile.user.company?.name ?? "—"}</div>
                  <div className="text-xs text-neutral-500">{profile.user.company?.tax_id ?? "無統編"}</div>
                </td>
                <td className="p-3 uppercase">{profile.role === "both" ? "seller" : profile.role}</td>
                <td className="p-3 text-neutral-600">
                  {profile.product_categories.length ? profile.product_categories.join(", ") : "—"}
                </td>
                <td className="p-3 text-neutral-600">
                  {profile.target_markets.length ? profile.target_markets.join(", ") : "—"}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      profile.verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {profile.verified ? "已核准" : "待審核"}
                  </span>
                </td>
                <td className="p-3">
                  <form action={moderateProfile} className="flex gap-2">
                    <input type="hidden" name="user_id" value={profile.user_id} />
                    <button
                      type="submit"
                      name="decision"
                      value="approve"
                      className="rounded border px-3 py-1.5 text-xs hover:bg-neutral-50"
                    >
                      核准
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="request_changes"
                      className="rounded border px-3 py-1.5 text-xs hover:bg-neutral-50"
                    >
                      退回待補
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
