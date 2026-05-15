import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function formatPrice(min: number | null, max: number | null, currency: string) {
  if (min == null && max == null) return "待議";
  const value = min ?? max!;
  return `${currency} ${value.toLocaleString()} FOB`;
}

function labelSpec(key: string) {
  const labels: Record<string, string> = {
    brand: "品牌",
    english_name: "英文品名",
    barcode: "條碼",
    product_spec_text: "商品規格",
    tax_category: "應免稅/稅別",
    original_price: "原價",
    promo_price: "促銷價",
    unit_length_cm: "單個物品長（CM）",
    unit_width_cm: "單個物品寬（CM）",
    unit_height_cm: "單個物品高（CM）",
    unit_weight_kg: "單個物品重量（KG）",
    carton_quantity: "箱入數",
    carton_net_weight_kg: "箱重（淨重 KG）",
    carton_gross_weight_kg: "箱重（毛重 KG）",
    storage_days: "保存日期",
    storage_unit: "保存日期單位",
    storage_method: "保存方式",
    temp_control: "是否需控溫",
    feature_description: "商品特色說明",
    full_description: "商品完整說明",
    domestic_vendor_name: "國內負責廠商名稱",
    domestic_vendor_phone: "國內負責廠商電話",
    domestic_vendor_address: "國內負責廠商地址",
    vegetarian_type: "素食種類",
    ingredients: "產品成份及食品添加物",
    marketing_claim: "營養標示（文字）",
    liability_insurance: "產品責任險",
    food_registration_no: "食品業者登錄字號",
    commission_rate: "佣金比例",
    hs_code: "條碼/HS code",
  };
  return labels[key] ?? key;
}

export default async function TradeProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  if (!session?.user) notFound();

  const product = await prisma.product.findFirst({
    where: {
      id: params.id,
      deleted_at: null,
      OR: [{ seller_id: session.user.id }, { status: "published" }],
    },
    include: {
      seller: {
        select: {
          id: true,
          email: true,
          display_name: true,
          company: true,
          trade_profile: true,
        },
      },
    },
  });

  if (!product) notFound();

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{product.name}</h1>
          <p className="text-sm text-neutral-500 mt-2">
            {product.category}
            {product.hs_code ? ` · HS ${product.hs_code}` : ""}
          </p>
        </div>
        <Link href="/trade">
          <Button variant="outline">返回市場</Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>商品資訊</CardTitle>
            <CardDescription>完整商品資料與基本報價資訊</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoGrid
              items={[
                ["價格", formatPrice(product.price_min, product.price_max, product.currency)],
                ["產地", product.origin_country ?? "未填寫"],
                ["狀態", product.status],
                ["檢測認證", product.certifications.length ? product.certifications.join(", ") : "無"],
              ]}
            />
            {product.specs && typeof product.specs === "object" ? (
              <div>
                <div className="text-sm font-medium mb-2">規格</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(product.specs as Record<string, unknown>)
                    .filter(([key]) => key !== "special_variants" && key !== "special_spec_enabled")
                    .map(([key, value]) => (
                      <div key={key} className="rounded-md border bg-neutral-50 px-3 py-2 text-sm">
                        <div className="text-neutral-500">{labelSpec(key)}</div>
                        <div className="mt-1 font-medium whitespace-pre-wrap">{String(value)}</div>
                      </div>
                    ))}
                </div>
                {(product.specs as Record<string, unknown>).special_spec_enabled === true &&
                Array.isArray((product.specs as Record<string, unknown>).special_variants) ? (
                  <div className="mt-4">
                    <div className="mb-2 text-sm font-medium">特規品項</div>
                    <div className="space-y-3">
                      {((product.specs as Record<string, unknown>).special_variants as Array<Record<string, unknown>>).map((variant, index) => (
                        <div key={`variant-${index}`} className="rounded-md border bg-white p-3 text-sm">
                          <div className="font-medium">{String(variant.name ?? `品項 ${index + 1}`)}</div>
                          <div className="mt-1 text-neutral-600">{String(variant.english_name ?? "")}</div>
                          <div className="mt-1 text-neutral-600">{String(variant.spec ?? "")}</div>
                          <div className="mt-1 text-neutral-800">
                            {variant.price_fob_usd ? `USD ${String(variant.price_fob_usd)} FOB` : "價格待議"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seller</CardTitle>
            <CardDescription>賣家檔案與進一步瀏覽入口</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="font-medium">
              {product.seller.company?.name ?? product.seller.display_name ?? product.seller.email}
            </div>
            <div className="text-sm text-neutral-600">
              {product.seller.trade_profile?.description ?? "尚未填寫公司簡介"}
            </div>
            <Link href={`/trade/sellers/${product.seller.id}`}>
              <Button className="w-full">查看 Seller 詳情</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-neutral-500">{label}</div>
          <div className="mt-1 font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}
