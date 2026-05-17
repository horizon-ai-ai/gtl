# Marketing AI Platform

台灣市場導向的 Marketing AI SaaS。  
以 AI 對話為入口，延伸到建站、訂單、B2B 貿易、RAG 客服、GA4 分析與 admin 營運後台。

## 專案內容

- `user portal`
  - chat
  - billing
  - orders
  - sites
  - trade
  - support
  - analytics / integrations
- `admin portal`
  - users
  - orders
  - support
  - trade ops
  - kb
  - admin copilot
  - audit / announcements

## 主要文件

完整 spec 在 [`docs/`](./docs/)：

- [`docs/00_PRD_master.md`](./docs/00_PRD_master.md)
- [`docs/15_product_spec_overview.md`](./docs/15_product_spec_overview.md)
- [`docs/16_engineering_spec_overview.md`](./docs/16_engineering_spec_overview.md)

模組規格：

- Auth: [`docs/01_spec_auth.md`](./docs/01_spec_auth.md)
- Chat: [`docs/02_spec_chat.md`](./docs/02_spec_chat.md)
- Billing: [`docs/03_spec_billing.md`](./docs/03_spec_billing.md)
- Orders: [`docs/04_spec_order.md`](./docs/04_spec_order.md)
- Page Builder: [`docs/05_spec_pagebuilder.md`](./docs/05_spec_pagebuilder.md)
- Trade: [`docs/06_spec_trade.md`](./docs/06_spec_trade.md)
- RAG / Support: [`docs/07_spec_rag_support.md`](./docs/07_spec_rag_support.md)
- Admin: [`docs/08_spec_admin.md`](./docs/08_spec_admin.md)
- DB Schema: [`docs/09_spec_db_schema.md`](./docs/09_spec_db_schema.md)
- API: [`docs/10_spec_api.md`](./docs/10_spec_api.md)
- Analytics Integration: [`docs/13_spec_analytics_integration.md`](./docs/13_spec_analytics_integration.md)

## 技術棧

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- pgvector
- NextAuth / Auth.js
- Resend
- Google Analytics Data/Admin API
- OpenAI-compatible LLM provider（目前可接 Moonshot / Kimi 類 API）

## 本地啟動

### 1. 安裝依賴

```bash
npm install
```

### 2. 準備環境變數

```bash
cp .env.example .env
```

再依需求補上金鑰與 OAuth 設定。

### 3. 啟動 PostgreSQL

範例：

```bash
docker run -d --name marketing-ai-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=marketing_ai_platform \
  -p 5433:5432 \
  pgvector/pgvector:pg15
```

### 4. 初始化資料

```bash
npm run db:seed
```

### 5. 啟動 portals

User portal:

```bash
npm run dev
```

- 預設：`http://localhost:3000`

Admin portal:

```bash
npm run admin:dev
```

- 預設：`http://localhost:3001`

## 重要環境變數

見 [`.env.example`](./.env.example)。

常用項目：

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `FLEXION_API_BASE_URL`
- `FLEXION_API_KEY`
- `FLEXION_MODEL`
- `TRADE_VISION_MODEL`
- `ANTHROPIC_API_BASE_URL`
- `ANTHROPIC_VERSION`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GA_TOKEN_ENCRYPTION_SALT`
- `GCIS_API_BASE_URL`
- `ASSET_BASE_URL`
- `REDIS_URL`

## 目前功能狀態

已可用：

- 個人 / 公司註冊
- 統編查詢與帶入公司資料
- AI Chat + SSE streaming
- Billing 基本方案切換
- Orders 基本管理
- 所有登入用戶可瀏覽 Trade 市場商品並送出詢價
- 已升級 trade 方案的用戶可先測試商品頁建置與 Puck 視覺編輯
- Trade seller 身份需先升級方案並通過 admin 審核；審核後可建立商品並直接上架
- Trade quotation、notifications、trade lifecycle
- Support ticket + RAG 問答
- Sites 建立、預覽、發佈
- GA4 integrations / dashboard 基礎
- Admin Portal / Admin Copilot

尚未完全 production-ready：

- 真付款金流
- email verification / reset password
- RAG 完整向量 pipeline
- Trade 完整 quotation entity / notification center
- Site Builder 已接 Puck 基礎視覺編輯，仍待深化 domain verification / 正式商品串接

## 開發注意事項

- 不要提交 `.env`
- 不要提交 `client_secret_*.json`
- 不要提交 `.next*` 產物
- 本專案有 user/admin 多個本地 portal；請使用既定 scripts 啟動
- 若本地 DB schema 與 `schema.prisma` 不同步，部分 trade / quotation 路徑會走相容 fallback

## GitHub Push 前建議檢查

```bash
git status
npm run typecheck
```

若要公開 push，請先確認：

- `.env` 未被追蹤
- Google / LLM / OAuth secrets 未進 repo
- 本地暫存資料夾未被追蹤
