import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertTradeModuleAccess } from "@/lib/trade";
import { listBuyerQuotationRows } from "@/lib/trade-quotations";
import { Card } from "@/components/ui/card";

export default async function TradeQuotationInboxPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  await assertTradeModuleAccess(session.user.id);

  const inquiries = await listBuyerQuotationRows(session.user.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Quotation 收件匣</h1>
          <p className="mt-1 text-sm text-neutral-500">
            buyer 在這裡統一查看 seller 發來的 quotation，不用只在詢價清單裡找狀態。
          </p>
        </div>
        <Link href="/trade" className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50">
          回到貿易工作台
        </Link>
      </div>

      {inquiries.length === 0 ? (
        <Card className="p-8 text-sm text-neutral-500">目前沒有收到 quotation。</Card>
      ) : (
        <div className="space-y-4">
          {inquiries.map((inquiry) => (
            <Card key={inquiry.id} className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-medium">{inquiry.product_name}</div>
                  <div className="mt-1 text-sm text-neutral-500">
                    Seller：{inquiry.seller_name}
                    {" · "}v{inquiry.quotation_version}
                    {" · "}狀態 {inquiry.status}
                  </div>
                </div>
                <a
                  href={`/api/trade/inquiries/${inquiry.id}/quotation.pdf`}
                  className="rounded-md border px-4 py-2 text-sm hover:bg-neutral-50"
                >
                  下載 PDF
                </a>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
                <div className="rounded-md border bg-neutral-50 p-3">
                  <div className="text-neutral-500">報價數量</div>
                  <div className="mt-1 font-medium">{inquiry.quoted_quantity ?? inquiry.quantity}</div>
                </div>
                <div className="rounded-md border bg-neutral-50 p-3">
                  <div className="text-neutral-500">FOB 報價</div>
                  <div className="mt-1 font-medium">
                    USD {(inquiry.quoted_price ?? inquiry.target_price ?? 0).toLocaleString()} FOB
                  </div>
                </div>
                <div className="rounded-md border bg-neutral-50 p-3">
                  <div className="text-neutral-500">最近更新</div>
                  <div className="mt-1 font-medium">{new Date(inquiry.updated_at).toLocaleString("zh-TW")}</div>
                </div>
              </div>
              <div className="mt-4 rounded-md border p-4 text-sm whitespace-pre-wrap">
                {inquiry.quotation_notes ?? "尚未填寫 quotation 內容"}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
