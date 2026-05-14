# 12 — Release Pitfalls & Spec Gap

**Status**: Working Notes  
**Owner**: Grace Wu  
**Last Updated**: 2026-05-01

---

## 1. 上版會踩到的坑

### 1.1 `next dev` 與 `next build` 共用 `.next`
- 症狀：
  - 登入頁或其他頁面「沒有樣板」
  - CSS 檔 404 / 舊資產路徑失效
  - 更版後 UI 只剩 HTML 結構
- 根因：
  - `dev` 和 `build` 共用同一個 `.next`
  - build / typegen 會覆蓋 dev server 正在服務的靜態資產
- 目前處理：
  - `dev` 改用 `.next-dev`
  - `admin:dev` 改用 `.next-admin-dev`
  - `build` 仍用 `.next`
- 發版注意：
  - 本地開發請只用 `npm run dev` 與 `npm run admin:dev`
  - 不要在同一個 dev session 中手動改回共用 `.next`

### 1.2 `typecheck` 依賴 `.next/types`
- 症狀：
  - `npm run typecheck` 在乾淨狀態直接報 `.next/types/... not found`
- 根因：
  - `tsconfig.json` include 了 `.next/types/**/*.ts`
  - 如果尚未跑過 `build`，或與 build 並行執行，就會找不到型別輸出
- 目前處理：
  - build 完成後再跑 `npm run typecheck` 可通過
- 建議：
  - CI / 本地驗證順序固定為：
    1. `npm run build`
    2. `npm run typecheck`

### 1.3 本地 DB 連線不穩定
- 症狀：
  - build 過程 Prisma 會噴 `Can't reach database server at localhost:5433`
  - admin/user/order/support 頁面在沒有 DB 時容易顯示 server error
- 根因：
  - `.env` 的 `DATABASE_URL` 指向 `localhost:5433`
  - 本地若未啟 Postgres，server component 與 route build-time probing 都會報錯
- 建議：
  - 啟動前先確認 `5433` Postgres 在跑
  - 本地驗證前固定跑 seed

### 1.4 Port 混淆
- 症狀：
  - 開到錯的專案
  - 登入後沒有反應
  - 畫面樣式不對
- 目前規則：
  - User Portal：`http://localhost:3000`
  - Admin Portal dev：`http://localhost:3002/admin`
- 已處理：
  - `ensure-dev-port.mjs` 支援依 port 防呆

### 1.5 Moonshot / Kimi 串流回應較慢
- 症狀：
  - chat 看起來像卡住
  - 實際上 SSE 有持續回 token，但整段完成時間偏長
- 根因：
  - `kimi-k2.6` 會先輸出大量 reasoning，再輸出 content
- 目前狀態：
  - user portal chat 已是 `stream: true`
  - route 也明確將 `stream: true` 傳給 provider
- 後續可做：
  - UI 加入更明顯的 streaming 狀態
  - 換較快模型作為 default fast path

### 1.6 Build log 有既有噪音
- 症狀：
  - `Dynamic server usage` 訊息
  - Prisma 初始化錯誤訊息
- 說明：
  - 這些大多是 Next 對 app routes / server components 做靜態探測時的既有輸出
  - 不是所有訊息都代表 build fail
- 目前實際阻塞：
  - 只有真正的 TypeScript / Prisma schema / route code 錯誤才會中止 build

---

## 2. 目前已部署/已開發內容（按 spec 對照）

### 2.1 Auth (`01_spec_auth.md`)
- 已有：
  - Email + password 註冊 / 登入
  - personal / company 註冊分流
  - 統編 lookup 基礎版
  - `user / admin / super_admin`
  - `GET /api/auth/me`
- 未完成：
  - Email 驗證
  - 忘記密碼 / 重設密碼
  - sessions 裝置管理
  - LINE login
  - 登入失敗鎖定 / 告警信
  - disposable email 擋法

### 2.2 Chat (`02_spec_chat.md`)
- 已有：
  - Sidebar + 對話主視窗
  - 對話持久化
  - SSE streaming
  - token credits 顯示
  - conversation title fallback
  - 引導下單 / 轉人工
  - action recommendation / suggested items
- 未完成：
  - `tool_call` / `tool_result` 事件流
  - `AbortController` 中斷即停止計費
  - 重新命名、釘選、分享
  - 分組 Sidebar（Today / 7d / 30d / Older）
  - 自動分類 tag
  - 500 則訊息後 summarize 切對話
  - rate limit
  - 對話中斷 reconnect

### 2.3 Billing (`03_spec_billing.md`)
- 已有：
  - 方案列表
  - 訂閱資訊頁
  - monthly credits 與 usage 扣點
- 未完成：
  - 真實 ECPay 付款流程
  - past_due 流程
  - invoice 歷史頁
  - refund 申請 / 審核
  - 發票補開 / 重發

### 2.4 Orders (`04_spec_order.md`)
- 已有：
  - User 自己的訂單列表
  - chat handoff 建立 `draft`
  - admin 全平台總覽
  - admin 詳情、異常標註、強制取消
- 未完成：
  - `GET /api/orders/:id`
  - `PATCH /api/orders/:id`
  - `DELETE /api/orders/:id`
  - 訂單 CSV export
  - 前台訂單詳情頁 / 狀態編輯
  - AI 真正 `create_order` tool call
  - chat 內 `OrderForm` confirm card

### 2.5 Page Builder (`05_spec_pagebuilder.md`)
- 已有：
  - 幾乎沒有實作，僅入口 placeholder
- 未完成：
  - Puck editor
  - site CRUD
  - publish / version
  - custom domain
  - AI 生成 page schema

### 2.6 Trade (`06_spec_trade.md`)
- 已有：
  - trade profile
  - products CRUD（基本）
  - inquiries create/list
  - product detail
  - seller detail
  - search/filter
  - feature gate
- 未完成：
  - quotation PDF
  - email 通知
  - 商品圖片上傳
  - CSV 匯入
  - buyer detail page
  - admin trade moderation
  - AI `lookup_product` / `send_inquiry` / HS code suggestion

### 2.7 RAG / Support (`07_spec_rag_support.md`)
- 已有：
  - `POST/GET /api/support/tickets`
  - chat 轉人工 ticket
  - admin support 列表 / 指派 / 狀態更新 / 留言 timeline
- 未完成：
  - `POST /api/support/ask`
  - citations
  - `query_kb`
  - `lookup_my_order` / `lookup_my_subscription` / `lookup_my_usage` tools
  - admin RAG query panel
  - kb docs 管理
  - reindex pipeline
  - true support conversation transcript

### 2.8 Admin (`08_spec_admin.md`)
- 已有：
  - dashboard 基礎卡片
  - users list + detail
  - suspend / unsuspend
  - change plan
  - grant credits
  - orders list + detail
  - support list + detail
  - announcements
  - audit page
- 未完成：
  - dashboard DAU/WAU/MAU、MRR/ARR、漏斗
  - users 詳情的 token 曲線 / sites list / 更完整 chat 檢視
  - products moderation / sites moderation
  - delete account
  - `GET /api/admin/*` API 層仍未完整獨立化
  - super_admin 系統設定：plan pricing / feature flags / maintenance mode
  - 危險操作二次確認

### 2.9 DB Schema (`09_spec_db_schema.md`)
- 已有：
  - 主體 schema 大致齊
- 未完成：
  - 很多模型雖已建，但對應功能與 API 尚未落地
  - support comment/timeline 專用表尚未補；目前留言借用 `AdminAction.payload`

### 2.10 API Surface (`10_spec_api.md`)
- 已有：
  - auth / chat / billing basics / orders / trade / support tickets 一部分
- 未完成：
  - 大量 admin APIs 尚未獨立 route 化
  - support ask / admin support ask / kb docs / reindex
  - orders detail/update/delete/export
  - user sessions / reset password / verify email

---

## 3. 建議下一批優先順序

### P0
- Auth 完整性：email verify / reset password
- Order 詳情與 update API
- Admin API 化（users/orders/support）

### P1
- Billing 真付款流程（ECPay）
- Support transcript + true handoff workflow
- Trade 圖片上傳 / quotation PDF / moderation

### P2
- Page Builder / Puck
- RAG knowledge base / citations / tools
- Admin dashboard 高階統計

---

## 4. 一句話總結

目前 repo 已經不是骨架而已，**Auth + Chat + Order handoff + Trade 初版 + Admin 管理入口** 都已經成形；但距離 spec 的「完整產品版」仍缺 **支付、RAG、Page Builder、完整 API 面、通知與審核工作流**。
