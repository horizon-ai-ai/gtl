# 10 — Spec: API 規格總覽

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — REST 慣例、認證、錯誤、所有 endpoint 索引 | Grace Wu |

---

## 1. 約定

### 1.1 Base URL
- Production: `https://platform.com/api`
- Staging: `https://staging.platform.com/api`

### 1.2 風格
- RESTful + 部分 RPC（對 chat/streaming）
- JSON 通訊，UTF-8
- ISO 8601 時間
- 金額：最小單位整數（TWD cents）

### 1.3 版本化
- v1 內嵌路徑：`/api/v1/...`（v1 上線後啟用）
- 開發期暫不加 `v1`，上線前統一改寫

---

## 2. 認證

### 2.1 一般用戶
- httpOnly Cookie 帶 access token (JWT, 15 min)
- 過期 → 走 `/api/auth/refresh`
- 來源：NextAuth.js session

### 2.2 機器對機器 (Enterprise API)
- `Authorization: Bearer <api_key>`
- API key 在 Admin Portal 簽發
- v2+ 才開放

### 2.3 CSRF
- NextAuth 內建 CSRF token
- 寫操作必須帶 `x-csrf-token` header

---

## 3. 統一回應格式

### 成功
```json
{
  "data": { ... },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

### 列表
```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 145,
    "request_id": "req_xxx"
  }
}
```

### 錯誤
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Order not found",
    "details": { "order_id": "..." },
    "request_id": "req_xxx"
  }
}
```

---

## 4. 錯誤碼

| HTTP | code | 說明 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 參數錯誤 |
| 401 | `UNAUTHORIZED` | 未登入 / token 過期 |
| 403 | `FORBIDDEN` | 無權限 |
| 403 | `PLAN_FEATURE_LOCKED` | 方案不含此功能 |
| 403 | `QUOTA_EXCEEDED` | 額度用盡 |
| 404 | `RESOURCE_NOT_FOUND` | 找不到 |
| 409 | `CONFLICT` | 衝突（slug 重複等） |
| 422 | `BUSINESS_RULE_VIOLATION` | 業務規則拒絕 |
| 429 | `RATE_LIMITED` | 限流 |
| 500 | `INTERNAL_ERROR` | 系統錯誤 |
| 502 | `UPSTREAM_ERROR` | Flexion / ECPay 錯誤 |
| 503 | `MAINTENANCE` | 維護中 |

---

## 5. 限流 (Rate Limit)

- 全域：每 IP 600 req/min
- 已登入：每用戶 1200 req/min
- 特殊：
  - 註冊：5/hr per IP
  - 登入：10/min per IP
  - Chat 訊息：30/min per user
  - 統編查詢：10/min per IP

Headers：
```
X-RateLimit-Limit: 1200
X-RateLimit-Remaining: 1198
X-RateLimit-Reset: 1714476000
```

超過：429 + `Retry-After`

---

## 6. 分頁與篩選

- `?page=1&page_size=20` (max 100)
- 排序：`?sort=-created_at,name`
- 篩選：`?filter[status]=paid&filter[total_gte]=1000`
- 搜尋：`?q=keyword`

---

## 7. Webhook

| Webhook | 說明 |
|---|---|
| `POST /api/webhooks/ecpay` | ECPay 付款 callback |
| `POST /api/webhooks/ecpay-einvoice` | 發票事件 |
| `POST /api/webhooks/resend` | Email 退信 / 開信 |

驗證：HMAC SHA256（`X-Signature` header）

---

## 8. 全 Endpoint 索引

### Auth (見 01)
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
GET    /api/auth/lookup-tax-id
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/verify-email
GET    /api/auth/sessions
DELETE /api/auth/sessions/:id
GET    /api/auth/oauth/[provider]
```

### Chat (見 02)
```
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
PATCH  /api/conversations/:id
DELETE /api/conversations/:id
POST   /api/chat/messages              (SSE)
GET    /api/usage/current
```

### Billing (見 03)
```
GET    /api/billing/plans
GET    /api/billing/subscription
POST   /api/billing/subscribe
POST   /api/billing/cancel
POST   /api/billing/change-plan
GET    /api/billing/topup-packs
POST   /api/billing/topup
GET    /api/billing/invoices
GET    /api/billing/invoices/:id/pdf
POST   /api/billing/refund-request
```

### Order (見 04)
```
GET    /api/orders
POST   /api/orders
GET    /api/orders/:id
PATCH  /api/orders/:id
DELETE /api/orders/:id
GET    /api/orders/export.csv
```

### Site / PageBuilder (見 05)
```
GET    /api/sites
POST   /api/sites
GET    /api/sites/:id
PATCH  /api/sites/:id
DELETE /api/sites/:id
POST   /api/sites/:id/publish
POST   /api/sites/:id/rollback/:version
GET    /api/sites/:id/versions
GET    /api/sites/check-slug
```

### Trade (見 06)
```
POST   /api/trade/profile
GET    /api/trade/products            (search + filter)
POST   /api/trade/products
GET    /api/trade/products/:id
PATCH  /api/trade/products/:id
DELETE /api/trade/products/:id
POST   /api/trade/products/bulk
POST   /api/trade/inquiries
GET    /api/trade/inquiries
GET    /api/trade/inquiries/:id
GET    /api/trade/inquiries/:id/quotation.pdf
GET    /api/trade/categories
GET    /api/trade/hs-codes/suggest
```

### Support / RAG (見 07)
```
POST   /api/support/ask                (SSE)
POST   /api/support/tickets
GET    /api/support/tickets
```

### Admin (見 08)
```
GET    /api/admin/dashboard/summary
GET    /api/admin/users
GET    /api/admin/users/:id
POST   /api/admin/users/:id/suspend
POST   /api/admin/users/:id/unsuspend
POST   /api/admin/users/:id/grant-credits
POST   /api/admin/users/:id/change-plan
DELETE /api/admin/users/:id
GET    /api/admin/orders
GET    /api/admin/orders/stats
GET    /api/admin/sites/moderation
POST   /api/admin/sites/:id/takedown
GET    /api/admin/products/moderation
GET    /api/admin/audit-logs
GET    /api/admin/system/announcements
POST   /api/admin/system/announcements
GET    /api/admin/system/plans
PATCH  /api/admin/system/plans/:id
POST   /api/admin/support/ask          (SSE)
GET    /api/admin/kb/docs
POST   /api/admin/kb/docs
POST   /api/admin/kb/reindex
```

### Webhooks
```
POST   /api/webhooks/ecpay
POST   /api/webhooks/ecpay-einvoice
POST   /api/webhooks/resend
```

---

## 9. SSE 規範

```
event: token
data: {"delta":"我"}

event: tool_call
data: {"name":"create_order","args":{...}}

event: tool_result
data: {"name":"create_order","result":{...}}

event: done
data: {"usage":{"input":120,"output":300}}

event: error
data: {"code":"UPSTREAM_ERROR","message":"..."}
```

客戶端用 `EventSource` 或 `fetch` + ReadableStream。

---

## 10. CORS
- 預設同源
- v2 開放 API：白名單 origin per API key

---

## 11. 文件化
- OpenAPI 3.1：`/api/openapi.json`（自動生成）
- Swagger UI：`/api-docs`（v2 公開後）
- 內部用：tRPC 風格 type-safe client

---

## 12. 開放問題
- Q1: 是否要支援 GraphQL（給 Admin Dashboard 彈性查詢）— v2 考慮
- Q2: API key 的權限 scoping 設計 — v2 細部
- Q3: SSE vs WebSocket（chat 升級為 ws 支援雙向中斷）— 觀察 v1 實際需求
