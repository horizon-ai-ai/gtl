# 14 — Analytics Implementation Checklist

**Source Spec**: [13_spec_analytics_integration.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/13_spec_analytics_integration.md)
**Status**: Working Draft
**Last Updated**: 2026-05-01

---

## 1. Sprint 1 Goal

先把 `GA4 OAuth + connection CRUD + token encryption + basic dashboard API` 落地。

完成標準：
- 使用者可從整合頁發起 Google Analytics OAuth
- callback 後可列出可連接的 GA4 Property
- 使用者可確認連接某個 Property
- DB 已加密儲存 refresh token
- 可列出 / 撤銷已連接的 GA connection
- dashboard API 有固定回傳結構，可接 UI

---

## 2. DB Checklist

### New Models
- `GoogleAnalyticsConnection`
- `AnalyticsSnapshot`
- `AnalyticsInsight`
- `AnalyticsToolCall`

### Plan Feature Flags
- `analytics.ga4`
- `analytics.weekly_summary`
- `analytics.anomaly_detection`
- `analytics.max_connections`

### Notes
- `refresh_token` 不可明碼儲存
- `query_hash` 要能對相同 query 去重
- `expires_at` 需支援 cleanup job

---

## 3. Env Checklist

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GA_TOKEN_ENCRYPTION_SALT`
- `REDIS_URL`

OAuth scope:

```text
https://www.googleapis.com/auth/analytics.readonly
```

---

## 4. Backend Task List

### 4.1 Crypto Helpers
- `src/lib/analytics/crypto.ts`
- HKDF from `NEXTAUTH_SECRET + GA_TOKEN_ENCRYPTION_SALT`
- AES-256-GCM encrypt / decrypt

### 4.2 OAuth Helpers
- `src/lib/analytics/oauth.ts`
- build auth URL
- exchange code
- refresh access token
- list GA4 properties
- get Google account email

### 4.3 Service Layer
- `src/lib/analytics/cache.ts`
- `src/lib/analytics/dashboard.ts`
- `src/lib/analytics/types.ts`

### 4.4 API Routes
- `GET /api/integrations/google-analytics/connect`
- `GET /api/integrations/google-analytics/callback`
- `GET /api/integrations/google-analytics/properties`
- `POST /api/integrations/google-analytics/properties`
- `GET /api/integrations/google-analytics/connections`
- `DELETE /api/integrations/google-analytics/connections/:id`
- `GET /api/analytics/dashboard`
- `POST /api/analytics/query`
- `GET /api/analytics/insights`
- `POST /api/analytics/insights/:id/acknowledge`

---

## 5. Frontend Task List

### 5.1 Settings / Integrations
- `/settings/integrations`
- 連接按鈕
- property 選擇
- 已連接列表
- 撤銷授權

### 5.2 Dashboard
- `/analytics`
- traffic overview
- acquisition sources
- top pages
- conversion funnel
- empty state / disconnected state

---

## 6. Query / Tool Prep

Sprint 1 不需要完整 tool use，但要先把 query contract 固定下來。

Planned tools:
- `get_traffic_overview`
- `get_conversion_funnel`
- `compare_periods`
- `get_top_pages`
- `get_audience_breakdown`
- `get_acquisition_sources`
- `get_event_count`
- `detect_anomaly`

---

## 7. Billing / Access Rules

- `analytics.ga4` 控制是否可連接
- `analytics.max_connections` 控制最大連接數
- `analytics.weekly_summary` 僅 `pro+`
- `analytics.anomaly_detection` 僅 `pro+`
- dashboard 預設不扣 credits
- chat 內 analytics tool call 才扣 credits

---

## 8. Audit / Security

- OAuth connect success/failure 寫 audit
- revoke 寫 audit
- token refresh failure 寫 audit
- refresh token only encrypted at rest
- revoke 後 7 天刪 snapshots

---

## 9. Suggested Delivery Order

1. Prisma schema
2. Seed feature flags
3. Crypto helpers
4. OAuth helpers
5. Connection CRUD API
6. Dashboard API skeleton
7. Settings UI
8. Dashboard UI
9. Query/tool integration
10. Workers / anomaly / weekly summary

---

## 10. Open Questions

1. 是否沿用既有 Google NextAuth provider，還是 GA OAuth 完全獨立處理
2. callback 後 property 選擇是否用 cookie 暫存 token，或直接寫 pending connection table
3. analytics dashboard 頁是否獨立為 `/analytics`，還是掛在現有首頁 dashboard
4. Redis 若未配置，Sprint 1 是否允許先退回 DB-only snapshot cache
