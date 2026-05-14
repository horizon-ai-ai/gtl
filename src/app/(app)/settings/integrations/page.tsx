import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getNumericFeature, getUserFeatures } from "@/lib/feature-flags";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IntegrationsClient } from "./integrations-client";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: { provider?: string; stage?: string };
}) {
  const session = await auth();
  const user = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
          subscription: { include: { plan: true } },
          company: true,
        },
      })
    : null;
  const connections = session?.user
    ? await prisma.googleAnalyticsConnection.findMany({
        where: { user_id: session.user.id },
        orderBy: { created_at: "desc" },
      })
    : [];
  const features = session?.user ? await getUserFeatures(session.user.id) : {};
  const analyticsAllowed =
    session?.user?.role === "admin" ||
    session?.user?.role === "super_admin" ||
    Boolean(features["analytics.ga4"]);
  const analyticsMaxConnections =
    session?.user?.role === "admin" || session?.user?.role === "super_admin"
      ? 9999
        : session?.user
          ? (await getNumericFeature(session.user.id, "analytics.max_connections")) ?? 0
          : 0;
  const sites = session?.user
    ? await prisma.site.findMany({
        where: { user_id: session.user.id, deleted_at: null },
        include: {
          versions: {
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      })
    : [];
  const siteIntegrationStats = sites.reduce(
    (acc, site) => {
      const schema = (site.versions[0]?.schema ?? {}) as {
        integrations?: { ga_measurement_id?: string; meta_pixel_id?: string };
      };
      if (schema.integrations?.ga_measurement_id) acc.gaEmbedded += 1;
      if (schema.integrations?.meta_pixel_id) acc.pixelEmbedded += 1;
      if (site.custom_domain) acc.customDomainConfigured += 1;
      if (site.status === "published") acc.published += 1;
      return acc;
    },
    { gaEmbedded: 0, pixelEmbedded: 0, customDomainConfigured: 0, published: 0 },
  );
  const connectorGroups = [
    {
      title: "Analytics",
      items: [
        {
          name: "Google Analytics 4",
          status: analyticsAllowed ? "available" : "locked",
          description: "流量、來源、熱門頁、轉換事件，已完成 OAuth 與 dashboard 基礎版。",
        },
        {
          name: "Google Search Console",
          status: "planned",
          description: "SEO 查詢、曝光、點擊與排名資料，適合內容優化與站點健檢。",
        },
        {
          name: "Meta Pixel",
          status: "planned",
          description: "協助站點埋碼與受眾再行銷事件串接。",
        },
      ],
    },
    {
      title: "Ads",
      items: [
        {
          name: "Google Ads",
          status: "planned",
          description: "廣告花費、轉換、關鍵字與 campaign 表現。",
        },
        {
          name: "Meta Ads",
          status: "planned",
          description: "Facebook / Instagram 廣告投放成效與受眾洞察。",
        },
      ],
    },
    {
      title: "Commerce / CRM",
      items: [
        {
          name: "Shopify",
          status: "planned",
          description: "商品、訂單與電商轉換資料，可回饋到 AI 建議。",
        },
        {
          name: "HubSpot",
          status: "planned",
          description: "Leads、pipeline 與客戶互動歷程。",
        },
      ],
    },
    {
      title: "Messaging",
      items: [
        {
          name: "LINE Official Account",
          status: "planned",
          description: "台灣市場常用訊息通路，適合 campaign 與客服整合。",
        },
        {
          name: "Email Platform",
          status: "planned",
          description: "Mailchimp / Brevo / Klaviyo 等 EDM 平台整合。",
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">整合設定</h1>
        <p className="mt-1 text-sm text-neutral-500">管理 Google Analytics 等第三方資料來源。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connector 狀態總覽</CardTitle>
          <CardDescription>顯示目前帳號實際已連接、已嵌入、待完成的整合狀態。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border bg-neutral-50 p-4 text-sm">
            <div className="text-neutral-500">GA 連線數</div>
            <div className="mt-2 text-2xl font-semibold">{connections.length}</div>
            <div className="mt-1 text-neutral-500">上限 {analyticsMaxConnections || 0}</div>
          </div>
          <div className="rounded-md border bg-neutral-50 p-4 text-sm">
            <div className="text-neutral-500">網站已嵌 GA</div>
            <div className="mt-2 text-2xl font-semibold">{siteIntegrationStats.gaEmbedded}</div>
            <div className="mt-1 text-neutral-500">共 {sites.length} 個站點</div>
          </div>
          <div className="rounded-md border bg-neutral-50 p-4 text-sm">
            <div className="text-neutral-500">網站已嵌 Pixel</div>
            <div className="mt-2 text-2xl font-semibold">{siteIntegrationStats.pixelEmbedded}</div>
            <div className="mt-1 text-neutral-500">可從網站編輯頁設定</div>
          </div>
          <div className="rounded-md border bg-neutral-50 p-4 text-sm">
            <div className="text-neutral-500">自訂網域已設定</div>
            <div className="mt-2 text-2xl font-semibold">{siteIntegrationStats.customDomainConfigured}</div>
            <div className="mt-1 text-neutral-500">已發布 {siteIntegrationStats.published} 個站點</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>目前帳號狀態</CardTitle>
          <CardDescription>這裡直接顯示目前登入帳號為什麼能或不能連接 GA。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border bg-neutral-50 p-4 text-sm">
            <div className="font-medium">{user?.email ?? "未登入"}</div>
            <div className="mt-2 text-neutral-600">角色：{user?.role ?? "-"}</div>
            <div className="mt-1 text-neutral-600">帳號類型：{user?.type ?? "-"}</div>
            <div className="mt-1 text-neutral-600">
              目前方案：{user?.subscription?.plan?.name ?? "未訂閱"}
              {user?.subscription?.plan?.code ? ` (${user.subscription.plan.code})` : ""}
            </div>
            <div className="mt-1 text-neutral-600">GA 可連接數：{analyticsMaxConnections || 0}</div>
          </div>
          <div
            className={`rounded-md border p-4 text-sm ${
              analyticsAllowed
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="font-medium">
              {analyticsAllowed ? "這個帳號可以連接 Google Analytics" : "這個帳號目前被 GA feature gate 擋住"}
            </div>
            <div className="mt-2">
              `analytics.ga4`：{String(Boolean(features["analytics.ga4"]))}
            </div>
            {!analyticsAllowed ? (
              <div className="mt-2">
                常見原因：新註冊帳號尚未建立 subscription，或目前登入的不是 `trade@platform.local` / `admin@platform.local`。
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {searchParams?.provider === "google-analytics" && searchParams?.stage === "select_property" ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm text-amber-800">
            OAuth 已完成，請直接在下方選擇要連接的 GA4 Property。
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Google Analytics 4</CardTitle>
          <CardDescription>
            讓使用者連接自己的 GA4 Property，之後可在 dashboard 與 AI 對話中做流量分析。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {analyticsAllowed ? (
            <a href="/api/integrations/google-analytics/connect">
              <Button>連接 Google Analytics</Button>
            </a>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              目前這個帳號無法發起 GA OAuth。先確認你是否使用有方案的測試帳號，或替該使用者建立 subscription。
            </div>
          )}
          <IntegrationsClient
            initialConnections={connections.map((connection) => ({
              id: connection.id,
              google_account_email: connection.google_account_email,
              property_id: connection.property_id,
              property_name: connection.property_name,
              measurement_id: connection.measurement_id,
              status: connection.status,
              last_sync_at: connection.last_sync_at?.toISOString() ?? null,
            }))}
            showPropertySelector={
              searchParams?.provider === "google-analytics" && searchParams?.stage === "select_property"
            }
            analyticsAllowed={analyticsAllowed}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {connectorGroups.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>整合設定未來會成為所有行銷資料來源的連接入口。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.items.map((item) => (
                <div key={item.name} className="rounded-md border p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{item.name}</div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        item.status === "available"
                          ? "bg-green-100 text-green-800"
                          : item.status === "locked"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {item.status === "available"
                        ? "可連接"
                        : item.status === "locked"
                          ? "目前鎖定"
                          : "規劃中"}
                    </span>
                  </div>
                  <div className="mt-2 text-neutral-600">{item.description}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.name === "Google Analytics 4" ? (
                      <>
                        <a href="/analytics">
                          <Button size="sm" variant="outline">查看流量分析</Button>
                        </a>
                        <a href="/sites">
                          <Button size="sm" variant="outline">前往網站嵌碼</Button>
                        </a>
                      </>
                    ) : item.name === "Meta Pixel" ? (
                      <a href="/sites">
                        <Button size="sm" variant="outline">前往網站設定 Pixel</Button>
                      </a>
                    ) : item.name === "Google Search Console" ? (
                      <a href="/sites">
                        <Button size="sm" variant="outline">先完成網站與 SEO 設定</Button>
                      </a>
                    ) : (
                      <a href="/support">
                        <Button size="sm" variant="outline">聯絡平台支援</Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
