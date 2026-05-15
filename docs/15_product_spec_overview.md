# 15 — Product Spec Overview

**Product**: Marketing AI Platform  
**Status**: Working Draft  
**Owner**: Grace Wu  
**Last Updated**: 2026-05-13

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-05-13 | 建立產品總覽 spec，整合現有 PRD 與已開發模組 | Codex |

---

## 1. 產品定位

### 1.1 一句話
**以 AI 對話為入口，完成內容、建站、詢價、報價、訂單與營運分析的一站式行銷工作平台。**

### 1.2 產品核心價值
1. 降低中小企業的行銷與數位工具使用門檻
2. 讓 AI 從「生成」走到「成交」
3. 把 B2B 貿易流程從人工 email 整理成系統化工作流
4. 讓平台管理者可透過 admin portal 與 AI copilot 做營運決策

### 1.3 北極星指標
- 每位付費用戶每月透過平台帶來的成交金額（GMV）

### 1.4 主要子指標
- MAU
- 付費轉換率
- ARPU
- Chat → 訂單轉換率
- 詢價 → quotation → 成交轉換率
- 每月 token 使用量
- 每月建立站點數與發佈數

---

## 2. 目標用戶

### 2.1 個人創業者
- 需求：產文案、做簡單網站、快速開始
- 核心功能：Chat、建站、基礎訂單、Free/Starter

### 2.2 中小企業行銷/營運人員
- 需求：少量人力下完成內容、建站、訂單、分析
- 核心功能：Chat、Sites、Orders、Analytics、Support、Pro

### 2.3 B2B 貿易商 / 工廠
- 需求：商品上架、接 buyer 詢價、產 quotation、建立訂單
- 核心功能：Trade、Quotation、Lifecycle、Admin 人工對接

### 2.4 平台營運管理者
- 需求：管理用戶、訂單、工單、公告、知識庫、貿易流程
- 核心功能：Admin Portal、Admin Copilot、Audit、Trade Ops

---

## 3. 產品範圍

### 3.1 User Portal
- Auth：註冊、登入、公司統編註冊
- Chat：AI 對話、下單引導、轉人工
- Orders：訂單列表、明細、草稿、貿易來源訂單
- Billing：方案切換、訂閱資訊、invoice history
- Sites：建立網站、AI 產生 landing page、預覽、發佈
- Trade：商品庫、詢價、quotation、buyer/seller 檔案、通知、貿易訂單生命週期
- Support：RAG 問答、ticket 查看與回覆
- Integrations：GA4 連接與設定
- Analytics：GA4 dashboard

### 3.2 Admin Portal
- Dashboard：平台總覽
- Users：帳號、方案、credits 管理
- Orders：全平台訂單與異常處理
- Support：ticket 接手、回覆、指派、狀態流
- Trade Ops：quotation、生命週期規則、商品類型、身份審核、商品總覽
- Analytics：admin analytics viewer
- KB：知識庫管理、reindex、retrieval debug
- Copilot：跨模組 AI 分析與 insight
- Audit：操作紀錄
- Announcements：公告管理

---

## 4. 主要產品模組

### 4.1 Auth
功能：
- 個人註冊
- 公司註冊
- 台灣統編查詢與自動帶入公司資訊
- 帳號角色：user / admin / super_admin

目前狀態：
- 已可用

後續補強：
- email 驗證
- 忘記密碼
- session/device 管理

### 4.2 Chat
功能：
- AI 對話
- SSE 流式回應
- credits 計量
- handoff 到訂單或人工支援

目前狀態：
- 已可用

後續補強：
- 更完整 tool_call / tool_result
- analytics tool use
- 中斷與重連體驗

### 4.3 Billing
功能：
- 方案展示
- 訂閱狀態
- 方案切換
- 取消/恢復續訂

目前狀態：
- sandbox 層級可操作

後續補強：
- ECPay 真付款
- 訂閱生命週期
- 發票與退款

### 4.4 Orders
功能：
- 訂單列表
- 訂單明細
- chat / trade 建立草稿訂單
- admin 訂單管理

目前狀態：
- 基本可用

後續補強：
- 更完整 CRUD
- 匯出與事件紀錄

### 4.5 Sites
功能：
- 建立站點
- AI 生成單頁 landing page
- 預覽
- 發佈
- SEO 與 analytics embed
- custom domain 設定

目前狀態：
- MVP 可用

後續補強：
- 多頁站點
- 視覺化 editor
- domain verification
- sitemap / robots

### 4.6 Trade
功能：
- 商品上架
- 商品圖片上傳與 AI 預填
- buyer 詢價
- seller quotation 管理
- buyer quotation inbox
- admin quotation 對接與手動成立訂單
- 規則式訂單生命週期

目前狀態：
- 初版可用，為目前主要差異化模組

後續補強：
- 獨立 quotation entity
- 更多 buyer/seller 通知
- CSV import
- 審核歷史

### 4.7 Support / RAG
功能：
- 知識庫問答
- grounded answers + citations
- ticket 開立、回覆、追蹤
- admin 接手與內部備註

目前狀態：
- MVP 可用

後續補強：
- 真正持久化向量檢索 pipeline
- 更多 support tools
- 更完整 message/timeline 結構

### 4.8 Analytics
功能：
- GA4 OAuth
- property selector
- dashboard
- integrations 管理

目前狀態：
- Sprint 1 可用

後續補強：
- 更多 analytics tools
- weekly summary
- anomaly detection
- chat analytics integration

### 4.9 Admin Copilot
功能：
- 問平台營運資料
- 多 tool 資訊整合
- insight / summary / 跳來源頁

目前狀態：
- MVP 可用

後續補強：
- 多輪記憶
- 可操作 action flow
- 更完整 analytics / trade / support 深度分析

---

## 5. 核心使用者流程

### 5.1 Chat 成交流程
1. user 註冊 / 登入
2. 進入 chat 對話
3. AI 提供內容/報價/成交建議
4. user 建立訂單草稿或轉人工
5. admin / support 接手處理

### 5.2 Trade 成交流程
1. seller 建立 trade profile
2. admin 審核 trade 身份
3. seller 身份通過後建立商品，商品直接進市場
4. buyer 於市場商品發送詢價
5. seller 收到通知，進 quotation workspace
6. seller 生成制式 quotation 並送出
7. buyer 在 quotation inbox 查看
8. admin 可在 trade quotation / ops 看到對接進度
9. admin 或 seller 觸發成立訂單
10. user portal 顯示 trade order lifecycle

### 5.3 建站流程
1. user 建立 site
2. AI 產生初版 landing page schema
3. user 編輯文案與 sections
4. user 預覽
5. user 發佈為 `/s/{slug}` 或 custom domain

### 5.4 客服流程
1. user 先在 support 頁問 RAG
2. 若需要人工則建立 support ticket
3. admin portal 指派與處理 ticket
4. user 查看 ticket 與公開回覆

### 5.5 Analytics 流程
1. user 在 integrations 連接 Google Analytics
2. user 選擇 GA4 property
3. user 在 analytics 頁看 dashboard
4. 後續由 admin copilot 或 chat analytics 做分析

---

## 6. 角色與權限

### 6.1 User
- 使用 user portal 所有基礎功能
- 依方案限制 features

### 6.2 Admin
- 可進 admin portal
- 可管理用戶、訂單、工單、公告、trade ops、kb、copilot

### 6.3 Super Admin
- 擁有 admin 所有能力
- 可繞過部分 feature gate
- 預留系統設定與維運控制權限

---

## 7. 訂閱與功能分層

### 7.1 Free / Starter / Pro / Enterprise
- 基礎依 `Plan.features` 控制
- `trade_module`
- `analytics.ga4`
- `analytics.max_connections`
- `weekly_summary`
- `anomaly_detection`

### 7.2 目前策略
- Trade 與較完整 Analytics 屬於進階方案能力
- Admin / super_admin 可做營運測試與繞過

---

## 8. 現況與邊界

### 8.1 已達成
- 系統不是只有骨架，已具備多模組可操作流程
- User Portal 與 Admin Portal 已成形
- Trade、Support、Analytics、Copilot 已有 MVP

### 8.2 尚未完成
- 真付款
- 完整 Auth 安全與驗證
- 更完整 production-grade RAG
- 更完整 Trade 商務與 notification center
- 更成熟 Site Builder

---

## 9. 產品 Roadmap 建議

### P0
- Billing 真付款
- Trade 成交流程穩定化
- RAG production 化

### P1
- Site Builder 正式可發布
- Analytics 自動化
- Admin Copilot 深化

### P2
- 多語
- 外部 API / partner integrations
- 更完整工作流自動化

---

## 10. 相關文件

- [00_PRD_master.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/00_PRD_master.md)
- [01_spec_auth.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/01_spec_auth.md)
- [02_spec_chat.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/02_spec_chat.md)
- [03_spec_billing.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/03_spec_billing.md)
- [04_spec_order.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/04_spec_order.md)
- [05_spec_pagebuilder.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/05_spec_pagebuilder.md)
- [06_spec_trade.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/06_spec_trade.md)
- [07_spec_rag_support.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/07_spec_rag_support.md)
- [08_spec_admin.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/08_spec_admin.md)
- [09_spec_db_schema.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/09_spec_db_schema.md)
- [10_spec_api.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/10_spec_api.md)
- [12_release_pitfalls_and_spec_gap.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/12_release_pitfalls_and_spec_gap.md)
- [13_spec_analytics_integration.md](/Users/gracewu/Desktop/marketing-ai-platform/docs/13_spec_analytics_integration.md)
