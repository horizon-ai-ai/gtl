import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listAdminQuotationRows } from "@/lib/trade-quotations";
import { generateOrderNo } from "@/lib/utils";
import { Card } from "@/components/ui/card";

async function createOrderFromQuotation(formData: FormData) {
  "use server";
  await requireAdmin();
  const inquiryId = String(formData.get("inquiry_id") ?? "");
  if (!inquiryId) return;

  const inquiry = await prisma.inquiry.findUnique({
    where: { id: inquiryId },
    include: {
      product: true,
      buyer: { include: { company: true } },
    },
  });
  if (!inquiry) return;

  const estimatedUnitPrice =
    inquiry.quoted_price ?? inquiry.target_price ?? inquiry.product.price_min ?? inquiry.product.price_max ?? 0;
  const orderQuantity = inquiry.quoted_quantity ?? inquiry.quantity;

  const order = await prisma.order.create({
    data: {
      user_id: inquiry.seller_id,
      order_no: generateOrderNo(),
      status: "draft",
      customer: {
        name: inquiry.buyer.company?.name ?? inquiry.buyer.display_name ?? inquiry.buyer.email,
        email: inquiry.buyer.email,
        phone: inquiry.buyer.company?.contact_phone ?? undefined,
        tax_id: inquiry.buyer.company?.tax_id ?? undefined,
      } as Prisma.InputJsonValue,
      notes: [
        `Created from quotation / inquiry ${inquiry.id}`,
        inquiry.quotation_notes ? `Quotation notes: ${inquiry.quotation_notes}` : null,
        inquiry.notes ? `Inquiry notes: ${inquiry.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        source: "trade_inquiry",
        inquiry_id: inquiry.id,
        buyer_id: inquiry.buyer_id,
        product_id: inquiry.product_id,
        quotation_version: inquiry.quotation_version,
      } as Prisma.InputJsonValue,
      subtotal: orderQuantity * estimatedUnitPrice,
      total: orderQuantity * estimatedUnitPrice,
      items: {
        create: [
          {
            name: inquiry.product.name,
            description: inquiry.product.description,
            quantity: orderQuantity,
            unit_price: estimatedUnitPrice,
            total: orderQuantity * estimatedUnitPrice,
          },
        ],
      },
      events: {
        create: {
          type: "draft_created_from_quotation",
          actor: "admin",
          data: { inquiry_id: inquiry.id } as Prisma.InputJsonValue,
        },
      },
    },
  });

  await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: { status: "closed" },
  });

  redirect(`/admin/orders/${order.id}`);
}

export default async function AdminTradeQuotationsPage() {
  await requireAdmin();

  const inquiries = await listAdminQuotationRows();

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Quotation 管理</h1>
        <p className="mt-1 text-sm text-neutral-500">
          查看哪些 buyer 已收到 quotation，人工可再對接；若成交，可直接觸發成立訂單。
        </p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="p-3 text-left">商品</th>
              <th className="p-3 text-left">Buyer</th>
              <th className="p-3 text-left">Seller</th>
              <th className="p-3 text-left">Quotation</th>
              <th className="p-3 text-left">狀態</th>
              <th className="p-3 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.map((inquiry) => (
              <tr key={inquiry.id} className="border-b align-top">
                <td className="p-3">{inquiry.product_name}</td>
                <td className="p-3">
                  {inquiry.buyer_name}
                  <div className="text-xs text-neutral-500">{inquiry.buyer_email}</div>
                </td>
                <td className="p-3">
                  {inquiry.seller_name}
                </td>
                <td className="p-3">
                  <div>v{inquiry.quotation_version}</div>
                  <div className="text-neutral-500">
                    USD {(inquiry.quoted_price ?? inquiry.target_price ?? 0).toLocaleString()} FOB
                  </div>
                </td>
                <td className="p-3">{inquiry.status}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/trade/inquiries/${inquiry.id}/quotation.pdf`}
                      className="rounded border px-3 py-2 text-xs hover:bg-neutral-50"
                    >
                      PDF
                    </a>
                    <form action={createOrderFromQuotation}>
                      <input type="hidden" name="inquiry_id" value={inquiry.id} />
                      <button type="submit" className="rounded border px-3 py-2 text-xs hover:bg-neutral-50">
                        觸發成立訂單
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
