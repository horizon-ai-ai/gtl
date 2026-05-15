import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { assertSellerTradeAccess } from "@/lib/trade";
import { listSellerQuotationRows } from "@/lib/trade-quotations";
import { Card } from "@/components/ui/card";
import { QuotationWorkspace } from "./quotation-workspace";

export default async function TradeQuotationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  await assertSellerTradeAccess(session.user.id);

  const inquiries = await listSellerQuotationRows(session.user.id);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Quotation 管理</h1>
        <p className="mt-1 text-sm text-neutral-500">
          seller 在這裡查看 buyer 詢價、生成制式 quotation，寄出後 buyer 會收到系統與 email 通知。
        </p>
      </div>
      <Card className="p-0">
        <QuotationWorkspace
          initialInquiries={inquiries.map((inquiry) => ({
            id: inquiry.id,
            product_name: inquiry.product_name,
            buyer_name: inquiry.buyer_name,
            quantity: inquiry.quantity,
            quoted_quantity: inquiry.quoted_quantity,
            target_price: inquiry.target_price,
            quoted_price: inquiry.quoted_price,
            status: inquiry.status,
            quotation_notes: inquiry.quotation_notes ?? "",
            quotation_version: inquiry.quotation_version,
          }))}
        />
      </Card>
    </div>
  );
}
