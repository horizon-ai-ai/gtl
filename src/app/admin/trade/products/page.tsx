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
        <h1 className="text-2xl font-semibold">商品列表</h1>
        <p className="text-sm text-neutral-500 mt-1">Seller 身份審核通過後，建立商品會直接進市場；這裡保留給 admin 做檢視與人工下架。</p>
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
                  {(() => {
                    const specs = (product.specs ?? {}) as Record<string, unknown>;
                    const matrix = Array.isArray(specs.spec_matrix)
                      ? (specs.spec_matrix as Array<Record<string, unknown>>).slice(0, 3)
                      : [];
                    const specText = typeof specs.product_spec_text === "string" ? specs.product_spec_text : "";
                    const storage = typeof specs.storage_days === "string" ? specs.storage_days : "";
                    if (!matrix.length && !specText && !storage) return null;
                    const cell = (entry: Record<string, unknown> | undefined, key: string) =>
                      typeof entry?.[key] === "string" && entry[key] ? String(entry[key]) : "—";
                    return (
                      <details className="mt-1 text-xs text-neutral-600">
                        <summary className="cursor-pointer select-none text-neutral-500">規格資料</summary>
                        <div className="mt-1 space-y-1">
                          {specText ? <div>商品規格：{specText}</div> : null}
                          {storage ? <div>保存效期：{storage}</div> : null}
                          {matrix.length ? (
                            <table className="mt-1 border-collapse">
                              <thead>
                                <tr>
                                  <th className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-left font-medium">項目</th>
                                  {matrix.map((_, index) => (
                                    <th key={index} className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-left font-medium">
                                      規格{["一", "二", "三"][index]}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {[
                                  ["price_usd", "單價 USD"],
                                  ["dimensions_cm", "長寬高 CM"],
                                  ["net_weight_kg", "淨重 KG"],
                                  ["gross_weight_kg", "毛重 KG"],
                                ].map(([key, label]) => (
                                  <tr key={key}>
                                    <td className="border border-neutral-200 px-2 py-1 text-neutral-500">{label}</td>
                                    {matrix.map((entry, index) => (
                                      <td key={`${key}-${index}`} className="border border-neutral-200 px-2 py-1">
                                        {cell(entry, key)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : null}
                        </div>
                      </details>
                    );
                  })()}
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
