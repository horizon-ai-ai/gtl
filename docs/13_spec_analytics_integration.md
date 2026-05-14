# 13 — Spec: Analytics Integration (Google Analytics)

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-05-01

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-05-01 | 初版 — GA4 OAuth 接入 + 對話式分析 + 主動洞察三層架構 | Grace Wu |

---

## 1. 範圍

### In Scope (v1)
- Google Analytics 4 (GA4) Property 透過 OAuth 2.0 接入
- 加密儲存 refresh_token，自動續期 access_token
- `/settings/integrations` UI：連接、列表、撤銷
- 預設 Dashboard：流量總覽 / 來源 / 熱門頁 / 轉換
- Chat 內對話式分析（Tool Use）：LLM 自動決定要查哪個維度
- Snapshot 快取（Redis 1hr + DB 90 天）
- 排程任務：每週自動摘要 email（Pro+ 方案）
- 異常偵測（流量驟降、轉換率異常）→ in-app 通知

### Out of Scope (v1)
- GA Universal Analytics（已停用）
- 寫入 GA（只讀）
- Facebook Ads / Shopify / LINE OA（v2 connector 框架）
- 多 Property 跨 join 分析
- 自訂 SQL 查詢 BigQuery export

---

## 2. User Stories

| # | Story |
|---|---|
| U-1 | 我登入後到「整合」頁，點「連接 Google Analytics」→ Google 同意頁 → 回到平台看到我的 GA Property |
| U-2 | 我在 chat 問「上週流量怎麼樣？」AI 自動拉資料、用人話講重點 + 給建議 |
| U-3 | 我問「為什麼上週轉換率掉了？」AI 比對流量來源/落地頁/裝置，找出問題點 |
| U-4 | 每週一早上 9:00 收到 email：上週摘要 + 3 個 actionable 建議 |
| U-5 | 流量突然下跌 30% → in-app 通知 + chat 自動 surface 異常洞察 |
| U-6 | 我可以一鍵撤銷授權；撤銷後 7 天內所有 snapshot 刪除 |
| U-7 | 我問「幫我針對表現最好的客群做一個 retargeting 活動頁」→ AI 跨模組調用：GA 找客群 → Puck 建頁 |

---

## 3. 系統架構

```
┌──────────────────────────────────────┐
│  Chat UI / Dashboard                 │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  Tool Use Layer (Flexion)            │
│  - get_traffic_overview              │
│  - get_conversion_funnel             │
│  - compare_periods                   │
│  - get_top_pages                     │
│  - get_audience_breakdown            │
│  - get_acquisition_sources           │
│  - get_event_count                   │
│  - detect_anomaly                    │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  GA4 Service Layer                   │
│  - OAuth token manager               │
│  - GA4 Data API client               │
│  - Snapshot cache (Redis + DB)       │
└────────────────┬─────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│  Google Analytics Data API (v1beta)  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  BullMQ Workers                      │
│  - weekly_summary_job (cron 0 9 * * 1) │
│  - anomaly_detection_job (cron 0 */6 * * *) │
│  - snapshot_refresh_job              │
└──────────────────────────────────────┘
```

---

## 4. OAuth Flow

### 4.1 Scope
```
https://www.googleapis.com/auth/analytics.readonly
```

### 4.2 流程

```
User 點「連接」
  ↓
GET /api/integrations/google-analytics/connect
  ↓ redirect
Google 同意畫面
  ↓ callback
GET /api/integrations/google-analytics/callback?code=xxx
  ↓
Exchange code → access_token + refresh_token
  ↓
列出該 Google 帳戶下所有 GA4 Property
  ↓
User 選擇要連接哪個 Property
  ↓
POST /api/integrations/google-analytics/properties
  ↓
加密儲存 refresh_token，建立 GoogleAnalyticsConnection
```

### 4.3 Token 加密
- 使用 `NEXTAUTH_SECRET` 衍生 32-byte AES key（HKDF）
- AES-256-GCM 加密，IV 隨 row 儲存
- DB 欄位：`refresh_token_ciphertext`, `refresh_token_iv`, `refresh_token_tag`

### 4.4 Token Refresh
- access_token 過期前 5 分鐘自動 refresh
- refresh 失敗（用戶撤銷授權）→ status = `revoked`，通知用戶重新連接

---

## 5. 資料模型

```prisma
model GoogleAnalyticsConnection {
  id                       String   @id @default(cuid())
  user_id                  String
  google_account_email     String
  property_id              String   // GA4 property ID, e.g. "properties/123456"
  property_name            String
  measurement_id           String?  // G-XXXXXXX
  refresh_token_ciphertext String   @db.Text
  refresh_token_iv         String
  refresh_token_tag        String
  access_token             String?  @db.Text
  access_token_expires_at  DateTime?
  scopes                   String[]
  status                   String   @default("active") // active / expired / revoked
  last_sync_at             DateTime?
  created_at               DateTime @default(now())
  updated_at               DateTime @updatedAt
  user                     User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  snapshots                AnalyticsSnapshot[]

  @@unique([user_id, property_id])
  @@index([status, last_sync_at])
}

model AnalyticsSnapshot {
  id            String   @id @default(cuid())
  connection_id String
  query_hash    String   // 同 query 用 hash 去重
  date_range    String   // "last_7_days" / "2026-04-25..2026-05-01"
  dimensions    String[] // ["country", "deviceCategory"]
  metrics       String[] // ["activeUsers", "sessions", "conversions"]
  result        Json     // GA API response
  fetched_at    DateTime @default(now())
  expires_at    DateTime // for 90-day retention
  connection    GoogleAnalyticsConnection @relation(fields: [connection_id], references: [id], onDelete: Cascade)

  @@index([connection_id, query_hash, fetched_at])
  @@index([expires_at]) // for cleanup job
}

model AnalyticsInsight {
  id              String   @id @default(cuid())
  user_id         String
  connection_id   String
  conversation_id String?  // 連到 chat（如果是對話產生）
  type            String   // "anomaly" / "opportunity" / "weekly_summary" / "ad_hoc"
  severity        String   @default("info") // info / warning / critical
  title           String
  body            String   @db.Text
  data_ref        Json     // { date_range, dimensions, metrics, top_findings }
  acknowledged_at DateTime?
  created_at      DateTime @default(now())
  user            User     @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id, created_at])
  @@index([user_id, type, acknowledged_at])
}

model AnalyticsToolCall {
  id              String   @id @default(cuid())
  user_id         String
  conversation_id String?
  message_id      String?
  tool_name       String
  arguments       Json
  result_summary  String?  @db.Text
  credits_charged BigInt   @default(0)
  status          String   // success / error / rate_limited
  error_message   String?
  duration_ms     Int?
  created_at      DateTime @default(now())

  @@index([user_id, created_at])
}
```

---

## 6. Tool Use 定義

每個 tool 對應一個 GA4 Data API runReport 模板。LLM 根據用戶問題自動選用。

### 6.1 `get_traffic_overview`
```json
{
  "name": "get_traffic_overview",
  "description": "取得指定期間的流量總覽：使用者、工作階段、頁面瀏覽、平均互動時間",
  "parameters": {
    "date_range": { "type": "string", "enum": ["last_7_days", "last_28_days", "last_90_days", "custom"] },
    "start_date": { "type": "string", "format": "YYYY-MM-DD" },
    "end_date": { "type": "string", "format": "YYYY-MM-DD" },
    "compare_to_previous": { "type": "boolean", "default": true }
  }
}
```

### 6.2 `get_acquisition_sources`
取得流量來源分佈（Organic / Paid / Direct / Social / Referral）。

### 6.3 `get_top_pages`
熱門頁面 TopN，含瀏覽數、平均停留、跳出率。

### 6.4 `get_conversion_funnel`
轉換漏斗（須客戶在 GA 設定好 conversion events）。

### 6.5 `compare_periods`
跨期比較（本週 vs 上週、本月 vs 上月）。

### 6.6 `get_audience_breakdown`
受眾分群（地理、裝置、年齡、性別、興趣）。

### 6.7 `get_event_count`
自訂事件統計（如 add_to_cart、sign_up）。

### 6.8 `detect_anomaly`
跑簡易異常偵測（z-score > 2 或環比變動 > 30%）。

---

## 7. API 規格

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/integrations/google-analytics/connect` | 啟動 OAuth |
| GET | `/api/integrations/google-analytics/callback` | OAuth callback |
| GET | `/api/integrations/google-analytics/properties` | 列出 Google 帳戶下可連接的 GA4 Property |
| POST | `/api/integrations/google-analytics/properties` | 確認連接某 Property |
| GET | `/api/integrations/google-analytics/connections` | 列出已連接 |
| DELETE | `/api/integrations/google-analytics/connections/:id` | 撤銷 + 排程刪除 snapshot |
| GET | `/api/analytics/dashboard?connection_id=` | 預設 dashboard 資料 |
| POST | `/api/analytics/query` | 後端統一 query 端點（被 tool 呼叫） |
| GET | `/api/analytics/insights` | 列洞察 |
| POST | `/api/analytics/insights/:id/acknowledge` | 標記已讀 |

回應格式遵循 `docs/10_spec_api.md` 的 `{ data, error }` 標準。

---

## 8. 使用情境流程

### 8.1 對話式分析
```
User: "上週網站流量怎麼樣？"
  ↓
Chat API 偵測：用戶有 active GA connection → 注入 GA tools 到 Flexion
  ↓
LLM 決定呼叫 get_traffic_overview(date_range="last_7_days", compare_to_previous=true)
  ↓
Service 查 Redis cache → miss → 查 DB snapshot（query_hash）→ miss → 打 GA API
  ↓
寫入 snapshot + Redis cache
  ↓
LLM 收到資料 → 用人話總結 + 給建議
  ↓
SSE stream 回 chat UI；inline 顯示折線圖
  ↓
記錄 AnalyticsToolCall（含 credits）
```

### 8.2 每週摘要 email
```
Cron 0 9 * * 1（每週一 09:00）
  ↓
撈所有 active connection（plan in [pro, enterprise]）
  ↓
對每個 connection：
  - 跑 7 個固定 tool calls
  - 餵給 LLM 產出 summary + 3 個 action items
  - 寫入 AnalyticsInsight (type=weekly_summary)
  - 透過 Resend 寄 email
  ↓
失敗：retry 3 次（exp backoff）→ 進 dead letter queue
```

### 8.3 異常偵測
```
Cron 0 */6 * * *（每 6 小時）
  ↓
對每個 connection 跑 detect_anomaly（過去 24 小時 vs 過去 7 天平均）
  ↓
若異常 → 建 AnalyticsInsight (type=anomaly, severity=warning|critical)
  ↓
in-app 通知 + 嚴重者 email
```

---

## 9. 計費策略

| 動作 | Credits | 說明 |
|---|---|---|
| GA 連線建立 | 0 | 免費吸引上鉤 |
| Dashboard 載入 | 0 | 走 cache，不收 |
| Chat 內 tool call | base_chat × 2 | tool use 多輪對話成本高 |
| 每週摘要 email | 100 / 週 | 從 plan credits 扣，Pro+ 方案才開放 |
| 異常偵測 | 0 | 平台補貼，當作差異化 |

Feature flag（在 `Plan.features`）：
```json
{
  "analytics.ga4": true,
  "analytics.weekly_summary": true,        // pro+
  "analytics.anomaly_detection": true,     // pro+
  "analytics.max_connections": 1            // free=1, starter=3, pro=10, enterprise=unlimited
}
```

---

## 10. 安全與合規

- **資料最小化**：只儲存 query 結果，不儲存個別 user 級 PII
- **加密**：refresh_token AES-256-GCM at rest；TLS in transit
- **撤銷**：用戶撤銷 → 立即停用 + 7 天 grace period 後硬刪 snapshot
- **資料保留**：snapshot 預設 90 天，用戶可在 settings 改為 30 / 180 天
- **稽核**：所有 OAuth 事件、撤銷、token refresh 失敗寫入 AuditLog
- **隱私政策**：明確聲明「只讀、不轉售、可隨時撤銷」
- **Rate limit**：每 connection 每分鐘 max 60 次 GA API call（GA quota 是 10/sec/property）

---

## 11. 監控與可觀測性

| 指標 | 警示 |
|---|---|
| GA API error rate | > 5% / 5min → page on-call |
| Token refresh failure | > 10 / 1hr → 通知 ops |
| Snapshot cache hit rate | < 60% → 檢查 query 多樣性 |
| 平均 tool call 時延 | p95 > 3s → 檢查 GA quota |
| Weekly summary 寄送成功率 | < 95% → ops 介入 |

---

## 12. 環境變數

| 變數 | 說明 |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID（可與既有 NextAuth 共用） |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://app.example.com/api/integrations/google-analytics/callback` |
| `GA_TOKEN_ENCRYPTION_SALT` | HKDF salt（32 bytes） |
| `REDIS_URL` | snapshot cache（已有） |

---

## 13. 實作里程碑

| Sprint | 範圍 | 預估 |
|---|---|---|
| **Sprint 1** | OAuth flow + connection CRUD + 加密 + 預設 dashboard | 1.5 週 |
| **Sprint 2** | Tool use 8 個 tool + chat 整合 + inline 圖表 | 2.5 週 |
| **Sprint 3** | BullMQ jobs（weekly summary + anomaly）+ in-app 通知 + email 模板 | 2 週 |
| **Sprint 4** | RAG 整合（insights 進向量庫）+ 跨模組調用（GA → Puck）| 2 週 |

---

## 14. 開放議題

1. Tool use 是否走 Flexion / 還是直接呼叫底層 LLM？需確認 Flexion API 已支援 function calling
2. 圖表 inline render：用 recharts SVG 還是回傳結構化 JSON 由前端 render？
3. 多 Property 的「主要 Property」概念是否需要（影響 dashboard 預設）
4. Free plan 是否完全不開放 GA 連接，還是限制 1 個但功能受限
5. 跨 connector 框架抽象時機（v2 加 FB Ads / Shopify 時要不要先抽）

---

## 15. 對應其他 spec

- 認證：`01_spec_auth.md`（Google OAuth scope 擴充）
- Chat：`02_spec_chat.md`（Tool use 整合點）
- 計費：`03_spec_billing.md`（feature flag + credits 扣抵）
- DB Schema：`09_spec_db_schema.md`（新增 3 張表）
- API：`10_spec_api.md`（新增端點）
- RAG：`07_spec_rag_support.md`（insights 索引）
