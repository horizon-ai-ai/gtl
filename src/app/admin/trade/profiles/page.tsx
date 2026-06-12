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

      <div className="space-y-4">
        {profiles.length === 0 ? (
          <Card className="p-8 text-sm text-neutral-500">目前沒有賣家身份申請。</Card>
        ) : null}
        {profiles.map((profile) => {
          const info = (profile.company_info ?? {}) as Record<string, unknown>;
          const text = (key: string) => (typeof info[key] === "string" ? (info[key] as string) : "");
          const companyName = text("company_name") || profile.user.company?.name || "—";
          const taxId = text("tax_id") || profile.user.company?.tax_id || "無統編";
          const fields: Array<[string, string]> = [
            ["公司英文名稱", text("company_name_en") || "—"],
            ["公司產業", text("industry") || "—"],
            ["公司地址", text("company_address") || "—"],
            ["聯絡人姓名", text("contact_name") || "—"],
            ["聯絡電話", text("contact_phone") || "—"],
            ["聯絡人信箱", text("contact_email") || "—"],
            [
              "如何知道此服務",
              Array.isArray(info.referral_sources) && (info.referral_sources as string[]).length
                ? (info.referral_sources as string[]).join("、")
                : "—",
            ],
            ["官方網站", text("website") || "—"],
            ["產品類別", profile.product_categories.length ? profile.product_categories.join("、") : "—"],
            ["收款帳戶名稱", text("bank_account_name") || "—"],
            ["收款帳戶號碼", text("bank_account_number") || "—"],
            ["SWIFT CODE", text("bank_swift_code") || "—"],
          ];
          const hasApplication = Object.keys(info).length > 0;
          return (
            <Card key={profile.user_id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{companyName}</span>
                    <span className="text-sm text-neutral-500">統編 {taxId}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        profile.verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {profile.verified ? "已核准" : "待審核"}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        info.contract_agreed === true ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {info.contract_agreed === true ? "已同意平台合約" : "未確認合約"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    申請帳號：{profile.user.display_name ?? profile.user.email}（{profile.user.email}）·
                    更新於 {new Date(profile.updated_at).toLocaleString()}
                  </div>
                </div>
                <form action={moderateProfile} className="flex gap-2">
                  <input type="hidden" name="user_id" value={profile.user_id} />
                  <button
                    type="submit"
                    name="decision"
                    value="approve"
                    className="rounded bg-neutral-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
                  >
                    核准
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="request_changes"
                    className="rounded border px-4 py-1.5 text-xs hover:bg-neutral-50"
                  >
                    退回待補
                  </button>
                </form>
              </div>
              {hasApplication ? (
                <>
                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-3">
                    {fields.map(([label, value]) => (
                      <div key={label} className="flex gap-2">
                        <dt className="w-28 shrink-0 text-neutral-400">{label}</dt>
                        <dd className="min-w-0 break-words text-neutral-800">{value}</dd>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-neutral-400">存摺照片</dt>
                      <dd>
                        {text("bank_passbook_image") ? (
                          <a
                            href={text("bank_passbook_image")}
                            target="_blank"
                            className="text-neutral-800 underline underline-offset-2"
                          >
                            檢視照片
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                  </dl>
                  {profile.description || text("remarks") ? (
                    <div className="mt-3 space-y-1 rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
                      {profile.description ? <div>公司/服務簡介：{profile.description}</div> : null}
                      {text("remarks") ? <div>備註：{text("remarks")}</div> : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-neutral-200 p-3 text-sm text-neutral-500">
                  此申請建立於舊版表單，尚未填寫完整公司申請資料。
                  {profile.description ? `簡介：${profile.description}` : ""}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
