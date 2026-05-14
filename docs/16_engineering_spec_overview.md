# 16 — Engineering Spec Overview

**Project**: Marketing AI Platform  
**Status**: Working Draft  
**Owner**: Grace Wu  
**Last Updated**: 2026-05-13

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-05-13 | 建立工程總覽 spec，整理架構、模組、環境與開發規範 | Codex |

---

## 1. 工程目標

這份文件定義此專案的：
- 系統架構
- 目錄責任
- 模組分工
- 環境與執行方式
- 資料流
- 開發約束
- 已知風險與注意事項

用途：
- 新成員 onboarding
- 功能切分
- 規格對程式對齊
- 減少後續實作重工

---

## 2. 技術棧

### 2.1 Frontend
- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui primitives

### 2.2 Backend / BFF
- Next.js Route Handlers (`src/app/api/**`)
- server components 作為頁面資料聚合層

### 2.3 Database
- PostgreSQL
- Prisma ORM
- pgvector extension

### 2.4 Auth
- NextAuth / Auth.js v5 beta
- credentials login 為主
- Google Analytics OAuth 為獨立 integration flow

### 2.5 External Services
- Moonshot / Kimi / Flexion 類 OpenAI-compatible LLM provider
- Resend
- Google Analytics Data/Admin API
- Docker local Postgres

---

## 3. 高階架構

```text
User/Admin Browser
  -> Next.js App Router pages
  -> Route Handlers (/api)
  -> lib/* domain helpers
  -> Prisma / PostgreSQL
  -> External providers (LLM, Email, GA, etc.)
```

### 3.1 Portal 劃分
- User Portal：
  - `src/app/(app)/**`
- Auth Pages：
  - `src/app/(auth)/**`
- Admin Portal：
  - `src/app/admin/**`
- Public Site Render：
  - `src/app/s/[slug]/page.tsx`
  - `src/app/site-host/[host]/page.tsx`

### 3.2 Routing 策略
- middleware 負責依 host/port 做 portal 導流
- admin portal 與 user portal 可依本地 port 分流
- custom domain 透過 middleware rewrite 到 `site-host`

---

## 4. 目錄規格

### 4.1 `src/app`
- `page.tsx`：landing / host-based redirect
- `(auth)`：登入、註冊
- `(app)`：登入後 user portal
- `admin`：admin portal
- `api`：route handlers
- `s/[slug]`：公開站點
- `site-host/[host]`：custom domain render

### 4.2 `src/lib`
- `auth.ts`：Auth.js config
- `api.ts`：API success/error helpers
- `db.ts`：Prisma singleton
- `flexion.ts`：LLM provider abstraction
- `credits.ts`：credits usage logic
- `subscriptions.ts`：subscription 補建與查詢
- `kb.ts`：RAG retrieval / ingestion helpers
- `support.ts` / `support-tools.ts`：support domain logic
- `trade*.ts`：trade workflows
- `analytics/*`：GA integration / dashboard / cache / crypto
- `admin-copilot/*`：planner / prompts / tools
- `site-builder.ts`：site schema + generation helpers

### 4.3 `src/components`
- `ui/*`：shadcn-style primitives
- `site-renderer.tsx`：sites preview/public 共用 renderer
- `providers.tsx`：全域 client providers

### 4.4 `prisma`
- `schema.prisma`：主 schema
- `seed.ts`：plans、admin、測試資料初始化

### 4.5 `docs`
- 模組 spec
- release pitfall
- analytics rollout
- 本次新增的 product / engineering overview

---

## 5. Domain 模組責任

### 5.1 Auth Domain
檔案：
- `src/lib/auth.ts`
- `src/app/api/auth/**`
- `src/app/(auth)/**`

責任：
- 註冊、登入、session
- tax id lookup
- user / admin / super_admin 權限

### 5.2 Chat Domain
檔案：
- `src/app/(app)/chat/page.tsx`
- `src/app/api/chat/messages/route.ts`
- `src/lib/chat-handoff.ts`

責任：
- SSE chat
- 對話持久化
- handoff 建訂單 / 轉工單

### 5.3 Billing Domain
檔案：
- `src/app/(app)/billing/page.tsx`
- `src/app/api/billing/**`
- `src/lib/subscriptions.ts`

責任：
- 方案資訊
- 訂閱狀態
- 方案切換
- invoice data

### 5.4 Order Domain
檔案：
- `src/app/(app)/orders/**`
- `src/app/admin/orders/**`
- `src/app/api/orders/**`

責任：
- user 訂單
- admin 訂單
- 匯出
- 由 chat / trade 建立訂單

### 5.5 Trade Domain
檔案：
- `src/app/(app)/trade/**`
- `src/app/admin/trade/**`
- `src/app/api/trade/**`
- `src/lib/trade*.ts`

責任：
- profile
- product catalog
- image ingestion
- inquiry
- quotation
- buyer/seller views
- trade lifecycle
- trade admin operations

### 5.6 Support / RAG Domain
檔案：
- `src/app/(app)/support/page.tsx`
- `src/app/admin/support/**`
- `src/app/api/support/**`
- `src/lib/kb.ts`
- `src/lib/support.ts`
- `src/lib/support-tools.ts`

責任：
- kb retrieval
- citations
- ticket workflow
- platform data grounded support answer

### 5.7 Analytics Domain
檔案：
- `src/app/(app)/analytics/**`
- `src/app/(app)/settings/integrations/**`
- `src/app/admin/analytics/page.tsx`
- `src/app/api/integrations/google-analytics/**`
- `src/app/api/analytics/**`
- `src/lib/analytics/**`

責任：
- GA OAuth
- property connection
- dashboard queries
- analytics tools

### 5.8 Admin Copilot Domain
檔案：
- `src/app/admin/copilot/**`
- `src/app/api/admin/copilot/route.ts`
- `src/lib/admin-copilot/**`

責任：
- admin side AI analysis
- tool planning
- tool execution
- audit trail

### 5.9 Site Builder Domain
檔案：
- `src/app/(app)/sites/**`
- `src/app/api/sites/**`
- `src/components/site-renderer.tsx`
- `src/lib/site-builder.ts`

責任：
- 建站
- schema generation
- draft/publish
- preview
- custom domain metadata

---

## 6. 執行環境

### 6.1 本地主要 ports
- `3000`：user portal（預設）
- `3001` / `3002`：依 middleware / 本地策略可切成 admin 或額外 dev portal

### 6.2 主要 scripts
- `npm run dev`
- `npm run admin:dev`
- `npm run build`
- `npm run typecheck`
- `npm run db:seed`

### 6.3 必要 env
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `FLEXION_API_KEY` / provider env
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GA_TOKEN_ENCRYPTION_SALT`
- `RESEND_API_KEY`

### 6.4 本地 DB
- 使用 PostgreSQL
- 部分本地資料表可能落後於 `schema.prisma`
- 因此專案內已有不少舊 schema 相容邏輯（尤其 trade / inquiry / quotation）

---

## 7. 資料模型概觀

### 7.1 核心主體
- `User`
- `CompanyProfile`
- `Subscription`
- `Plan`
- `Conversation`
- `Message`
- `Order`
- `Site`
- `TradeProfile`
- `Product`
- `Inquiry`
- `SupportTicket`
- `AdminAction`

### 7.2 Analytics
- `GoogleAnalyticsConnection`
- `AnalyticsSnapshot`
- `AnalyticsInsight`
- `AnalyticsToolCall`

### 7.3 實務注意
- 目前 schema 與本地實際 DB 可能不完全同步
- 某些功能採 runtime table/column detection
- 新 feature 落地前要先確認：
  - Prisma schema
  - local DB shape
  - route 實作是否需要 backward-compatible fallback

---

## 8. API 規格總覽

### 8.1 Auth
- `/api/auth/register`
- `/api/auth/me`
- `/api/auth/lookup-tax-id`
- `/api/auth/[...nextauth]`

### 8.2 Chat
- `/api/chat/messages`
- `/api/conversations`
- `/api/conversations/[id]`

### 8.3 Billing
- `/api/billing/plans`
- `/api/billing/subscription`
- `/api/billing/invoices`

### 8.4 Orders
- `/api/orders`
- `/api/orders/[id]`
- `/api/orders/export.csv`
- `/api/orders/[id]/support-ticket`

### 8.5 Support
- `/api/support/ask`
- `/api/support/tickets`
- `/api/support/tickets/[id]`
- `/api/support/tickets/[id]/messages`

### 8.6 Trade
- `/api/trade/profile`
- `/api/trade/products`
- `/api/trade/products/[id]`
- `/api/trade/products/[id]/images`
- `/api/trade/products/draft-from-image`
- `/api/trade/inquiries`
- `/api/trade/inquiries/[id]`
- `/api/trade/inquiries/[id]/quotation-draft`
- `/api/trade/inquiries/[id]/quotation.pdf`
- `/api/trade/inquiries/[id]/create-order`
- `/api/trade/inquiries/[id]/support-ticket`
- `/api/trade/buyers/[id]`
- `/api/trade/sellers/[id]`
- `/api/trade/categories`
- `/api/trade/access`

### 8.7 Analytics / Integrations
- `/api/integrations/google-analytics/connect`
- `/api/integrations/google-analytics/callback`
- `/api/integrations/google-analytics/properties`
- `/api/integrations/google-analytics/connections`
- `/api/analytics/dashboard`
- `/api/analytics/query`
- `/api/analytics/insights`

### 8.8 Admin
- `/api/admin/copilot`
- `/api/admin/kb/docs`
- `/api/admin/kb/reindex`
- `/api/admin/kb/debug`

---

## 9. 開發規範

### 9.1 原則
- 先讓功能可用，再逐步升級成 production-grade
- 優先保護 user-facing flow，不讓單一外部服務失敗拖垮主流程
- 舊 schema 相容優先於理想模型純度

### 9.2 文件規範
- 每份 spec 含版本紀錄
- 總覽 spec 負責整合，不取代模組 spec

### 9.3 程式規範
- TypeScript 為主
- server/client component 分工清楚
- API errors 統一走 `src/lib/api.ts`
- 避免把 provider-specific 細節散落在頁面層

### 9.4 變更策略
- 新功能先確認是否會撞本地 DB 舊 schema
- 若會撞：
  - 要嘛先 migration
  - 要嘛 route 先做 fallback / dynamic column support

---

## 10. 已知坑與工程風險

### 10.1 `.next` / dev build 資產互踩
參考：
- [12_release_pitfalls_and_spec_gap.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/12_release_pitfalls_and_spec_gap.md)

### 10.2 `tsconfig.json` 在多個 dev server 併行時可能被 Next 自動改寫
- 尤其不同 `NEXT_DIST_DIR` 啟動時，Next 會自動補 `include`
- 若兩個 server 同時修改，可能短暫造成 JSON parse 錯誤

### 10.3 Prisma schema 與本地 DB 漂移
- 本地 `Inquiry` 與部分 trade/quotation 欄位曾多次不一致
- 因此 trade domain 已大量採相容查詢

### 10.4 外部服務不可依賴為單點成功條件
- email、LLM、GA 不應讓主流程直接 500
- 例如：
  - inquiry 建立
  - quotation draft
  - ticket 建立

---

## 11. 當前建議開發順序

### P0
- Trade 商務流穩定化
- Billing 真付款
- RAG production 化

### P1
- Site Builder 正式發布能力
- Analytics 自動化
- Support ticket 深化

### P2
- 多語
- 更多 connectors
- 工作流自動化

---

## 12. 相關文件

- [00_PRD_master.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/00_PRD_master.md)
- [09_spec_db_schema.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/09_spec_db_schema.md)
- [10_spec_api.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/10_spec_api.md)
- [12_release_pitfalls_and_spec_gap.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/12_release_pitfalls_and_spec_gap.md)
- [14_analytics_implementation_checklist.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/14_analytics_implementation_checklist.md)
