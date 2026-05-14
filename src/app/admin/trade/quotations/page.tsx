import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listAdminInquiryRows } from "@/lib/trade-quotations";
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

  const inquiries = await listAdminInquiryRows();
  const pendingInquiries = inquiries.filter((inquiry) => !inquiry.has_quotation && inquiry.status === "sent");
  const quotedInquiries = inquiries.filter(
    (inquiry) =>
      inquiry.has_quotation || inquiry.status === "replied" || inquiry.status === "negotiating" || inquiry.status === "closed",
  );
  const convertibleInquiries = quotedInquiries.filter((inquiry) => inquiry.status !== "closed");

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Quotation 管理</h1>
        <p className="mt-1 text-sm text-neutral-500">
          把待報價詢價、已送出 quotation 與可成立訂單的案件放在同一個後台工作台。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="待報價詢價" value={pendingInquiries.length} helper="buyer 已送 inquiry，seller 尚未正式送出 quotation" />
        <SummaryCard label="已送出 quotation" value={quotedInquiries.length} helper="seller 已生成並送出的報價案件" />
        <SummaryCard label="可成立訂單" value={convertibleInquiries.length} helper="仍可由 admin 觸發成立訂單的案件" />
      </div>

      <SectionTable
        title="待報價詢價"
        description="seller 還沒正式送出 quotation，但 admin 已能先看到 buyer 的詢價。"
        emptyText="目前沒有待報價詢價。"
        rows={pendingInquiries}
        showQuotation={false}
      />

      <SectionTable
        title="已送出 Quotation"
        description="buyer 已收到 quotation，人工可持續對接並視情況觸發成立訂單。"
        emptyText="目前還沒有已送出的 quotation。"
        rows={quotedInquiries}
        showQuotation
      />
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <Card className="rounded-2xl border-neutral-200 p-5">
      <div className="text-sm font-medium text-neutral-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-neutral-950">{value}</div>
      <div className="mt-2 text-xs leading-5 text-neutral-500">{helper}</div>
    </Card>
  );
}

function SectionTable({
  title,
  description,
  emptyText,
  rows,
  showQuotation,
}: {
  title: string;
  description: string;
  emptyText: string;
  rows: Awaited<ReturnType<typeof listAdminInquiryRows>>;
  showQuotation: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-neutral-50/80 px-5 py-4">
        <div className="text-lg font-semibold text-neutral-950">{title}</div>
        <div className="mt-1 text-sm text-neutral-500">{description}</div>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-sm text-neutral-500">{emptyText}</div>
      ) : (
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
            {rows.map((inquiry) => (
              <tr key={inquiry.id} className="border-b align-top">
                <td className="p-3">
                  <div className="font-medium text-neutral-950">{inquiry.product_name}</div>
                  <div className="mt-1 text-xs text-neutral-500">需求數量 {inquiry.quantity}</div>
                </td>
                <td className="p-3">
                  {inquiry.buyer_name}
                  <div className="text-xs text-neutral-500">{inquiry.buyer_email}</div>
                </td>
                <td className="p-3">
                  {inquiry.seller_name}
                  <div className="text-xs text-neutral-500">{inquiry.seller_email}</div>
                </td>
                <td className="p-3">
                  {showQuotation ? (
                    <>
                      <div>v{inquiry.quotation_version}</div>
                      <div className="text-neutral-500">
                        USD {(inquiry.quoted_price ?? inquiry.target_price ?? 0).toLocaleString()} FOB
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-neutral-700">尚未正式報價</div>
                      <div className="text-neutral-500">
                        buyer 目標價 USD {(inquiry.target_price ?? 0).toLocaleString()}
                      </div>
                    </>
                  )}
                </td>
                <td className="p-3">
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700">
                    {inquiry.status}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/trade/inquiries/${inquiry.id}/quotation.pdf`}
                      className="rounded border px-3 py-2 text-xs hover:bg-neutral-50"
                    >
                      PDF
                    </a>
                    <a
                      href="/trade/quotations"
                      className="rounded border px-3 py-2 text-xs hover:bg-neutral-50"
                    >
                      Seller 工作台
                    </a>
                    {showQuotation ? (
                      <form action={createOrderFromQuotation}>
                        <input type="hidden" name="inquiry_id" value={inquiry.id} />
                        <button type="submit" className="rounded border px-3 py-2 text-xs hover:bg-neutral-50">
                          觸發成立訂單
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
