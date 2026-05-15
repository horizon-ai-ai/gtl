import { revalidatePath } from "next/cache";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notify";

async function moderateProduct(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const productId = String(formData.get("product_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!productId || !["draft", "published", "paused"].includes(status)) return;

  const product = await prisma.product.update({
    where: { id: productId },
    data: { status: status as "draft" | "published" | "paused" },
    include: {
      seller: { select: { email: true } },
    },
  });

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "trade_product_moderation",
      target_type: "product",
      target_id: product.id,
      payload: { status },
    },
  });

  await sendEmail({
    to: product.seller.email,
    subject: `Trade product moderation update: ${product.name}`,
    text: `Your product "${product.name}" status is now "${status}".`,
  });

  revalidatePath("/admin/trade/products");
}

export default async function AdminTradeProductsPage() {
  await requireAdmin();

  const products = await prisma.product.findMany({
    where: { deleted_at: null },
    include: {
      seller: {
        select: {
          email: true,
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { created_at: "desc" },
    take: 100,
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-semibold">商品審核</h1>
        <p className="text-sm text-neutral-500 mt-1">Seller 建立商品後先進待審，核准成 published 後才會進市場。</p>
        </div>
        <a href="/admin/trade/categories" className="rounded border px-4 py-2 text-sm hover:bg-neutral-50">
          商品類型管理
        </a>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50">
            <tr>
              <th className="text-left p-3">商品</th>
              <th className="text-left p-3">Seller</th>
              <th className="text-left p-3">類型</th>
              <th className="text-left p-3">價格</th>
              <th className="text-left p-3">狀態</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b last:border-0 align-top">
                <td className="p-3">
                  <div className="font-medium">{product.name}</div>
                  <div className="text-xs text-neutral-500">{product.description?.slice(0, 80) ?? ""}</div>
                </td>
                <td className="p-3">
                  {product.seller.company?.name ?? "—"}
                  <div className="text-xs text-neutral-500">{product.seller.email}</div>
                </td>
                <td className="p-3">{product.category ?? "—"}</td>
                <td className="p-3">{product.price_min != null ? `USD ${product.price_min.toLocaleString()} FOB` : "—"}</td>
                <td className="p-3">{product.status}</td>
                <td className="p-3">
                  <form action={moderateProduct} className="flex gap-2">
                    <input type="hidden" name="product_id" value={product.id} />
                    <select name="status" defaultValue={product.status} className="rounded border px-2 py-1 text-xs">
                      <option value="draft">draft</option>
                      <option value="published">published</option>
                      <option value="paused">paused</option>
                    </select>
                    <button type="submit" className="rounded border px-2 py-1 text-xs hover:bg-neutral-50">
                      更新
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
