import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createTradeCategory,
  deleteTradeCategory,
  ensureTradeCategoryTable,
  listTradeCategories,
  updateTradeCategory,
} from "@/lib/trade-categories";
import { Card } from "@/components/ui/card";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "")
    .replace(/-+/g, "-");
}

async function createCategory(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  await ensureTradeCategoryTable();
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? "0");
  if (!name) return;

  await createTradeCategory(name, slugify(name), Number.isFinite(sortOrder) ? sortOrder : 0);

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "trade_category_created",
      target_type: "trade_category",
      target_id: name,
    },
  });

  revalidatePath("/admin/trade/categories");
  revalidatePath("/trade");
}

async function updateCategory(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  await ensureTradeCategoryTable();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order") ?? "0");
  const active = formData.get("active") === "on";
  if (!id || !name) return;

  await updateTradeCategory(id, name, slugify(name), Number.isFinite(sortOrder) ? sortOrder : 0, active);

  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "trade_category_updated",
      target_type: "trade_category",
      target_id: id,
      payload: { name, active },
    },
  });

  revalidatePath("/admin/trade/categories");
  revalidatePath("/trade");
}

async function deleteCategory(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  await ensureTradeCategoryTable();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteTradeCategory(id);
  await prisma.adminAction.create({
    data: {
      admin_id: admin.id,
      action: "trade_category_deleted",
      target_type: "trade_category",
      target_id: id,
    },
  });
  revalidatePath("/admin/trade/categories");
  revalidatePath("/trade");
}

export default async function AdminTradeCategoriesPage() {
  await requireAdmin();
  await ensureTradeCategoryTable();

  const categories = await listTradeCategories();

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">商品類型管理</h1>
        <p className="mt-1 text-sm text-neutral-500">管理前台上架商品的下拉式類型選單。</p>
      </div>

      <Card className="p-6">
        <form action={createCategory} className="grid gap-3 md:grid-cols-[1fr,160px,120px]">
          <input
            name="name"
            placeholder="新增類型名稱"
            className="rounded border px-3 py-2 text-sm"
            required
          />
          <input
            name="sort_order"
            type="number"
            defaultValue={categories.length}
            className="rounded border px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
            新增
          </button>
        </form>
      </Card>

      <Card>
        <div className="divide-y">
          {categories.map((category) => (
            <div key={category.id} className="grid gap-3 p-4 md:grid-cols-[1fr,140px,120px,120px,100px] md:items-start">
              <form action={updateCategory} className="contents">
                <input type="hidden" name="id" value={category.id} />
                <input
                  name="name"
                  defaultValue={category.name}
                  className="rounded border px-3 py-2 text-sm"
                  required
                />
                <input
                  name="sort_order"
                  type="number"
                  defaultValue={category.sort_order}
                  className="rounded border px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={category.active} />
                  啟用
                </label>
                <button type="submit" className="rounded border px-3 py-2 text-sm hover:bg-neutral-50">
                  儲存
                </button>
                <div className="text-xs text-neutral-500">slug: {category.slug}</div>
              </form>
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={category.id} />
                <button type="submit" className="rounded border px-3 py-2 text-xs hover:bg-neutral-50">
                  刪除
                </button>
              </form>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
