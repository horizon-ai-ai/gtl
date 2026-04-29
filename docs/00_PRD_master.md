# 00 — Product Requirements Document (Master)

**Product**: Marketing AI Platform (codename TBD)
**Owner**: Grace Wu (AI 數位轉型策略總監, Horizon AI)
**Status**: Draft
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版骨架（9 大模組） | Grace Wu |
| v0.2 | 2026-04-30 | 全章節展開；新增非功能需求、MVP 切分、風險清單 | Grace Wu |

---

## 1. 產品願景

### 1.1 一句話定位
**「對話即行銷」** — 讓中小企業透過與 AI 對話，完成從內容生成、網頁建置、到 B2B 商機媒合與訂單成立的全流程行銷工作。

### 1.2 為什麼做？
1. 台灣中小企業缺乏行銷人才與預算，現有工具學習門檻高
2. 現有 AI 服務僅止於「生成內容」，未閉環到「成交」
3. 跨境 B2B 詢價流程仍以人工 email 為主，效率低
4. Horizon AI 已有 Flexion Token Aggregator（Layer 1），需上層應用驅動需求

### 1.3 成功指標 (North Star Metric)
**「平均每個付費用戶每月透過平台達成的行銷成交金額 (GMV)」**

子指標：
- MAU、付費轉換率、ARPU、Token 月消耗量、Chat→下單轉換率、貿易模組詢價→成交率

---

## 2. 目標市場與用戶

### 2.1 市場
- **主市場**：台灣（繁中、TWD、統編、本地金流、電子發票）
- **次市場 (v2+)**：東南亞跨境 B2B 貿易（搭配貿易模組）

### 2.2 Persona
| Persona | 描述 | Pain Point | 我們提供 |
|---|---|---|---|
| **小安**（個人創業者） | 30 歲、自媒體、月營收 5 萬 | 沒人寫文案、不會建站 | Free/Starter 方案、Chat 生內容、一鍵建站 |
| **王經理**（中小企業行銷主管） | 公司 20 人、月行銷預算 10 萬 | 行銷人力不足、想做電商 | Pro 方案、建站+訂單管理、Token 充足 |
| **陳老闆**（B2B 貿易商） | 工廠老闆、英文不好、想接國外單 | 找不到買家、報價流程繁瑣 | Pro 方案、貿易模組、自動 Quotation PDF |
| **Horizon Admin** | 平台運營 | 需監控用戶/營收/異常 | Admin Portal + RAG 客服 |

### 2.3 商業模式
- **訂閱**：Free / Starter / Pro / Enterprise
- **Token 加值**：超額按 Pack 購買
- **加值模組**：貿易模組為 Pro+ 限定（可獨立加購）
- **未來**：API 開放（給合作夥伴接 Flexion）

---

## 3. 系統架構

### 3.1 高階架構圖
```
┌─────────────────────────────────────────────────────┐
│   User Portal (Next.js)  │   Admin Portal (Next.js) │
└────────────┬─────────────────────────┬──────────────┘
             │                         │
             ▼                         ▼
      ┌──────────────────────────────────────┐
      │     API Gateway / BFF (Next API)     │
      └──┬─────┬─────┬─────┬─────┬─────┬─────┘
         │     │     │     │     │     │
       Auth  Chat  Bill  Order Trade  RAG
         │     │     │     │     │     │
         └─────┴──┬──┴─────┴─────┴─────┘
                  ▼
        ┌──────────────────────────┐
        │ PostgreSQL + pgvector    │
        │ Redis (cache/queue)      │
        │ S3 (檔案/PDF)            │
        └──────────────────────────┘
                  │
                  ▼
        ┌──────────────────────────┐
        │ Flexion Token API (LLM)  │
        │ ECPay (金流+發票)        │
        │ Resend (Email)           │
        │ 統編 API (財政部)         │
        └──────────────────────────┘
```

### 3.2 技術棧（已確認）
| 層級 | 技術 |
|---|---|
| 前端 | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind + shadcn/ui |
| 後端 | Next.js API Routes（MVP）→ NestJS（v2） |
| DB | PostgreSQL 15 + Prisma ORM |
| 向量庫 | pgvector |
| Auth | NextAuth.js (Auth.js v5) |
| 金流 | 綠界 ECPay |
| 部署 | Vercel + Supabase（DB） |
| Email | Resend |
| PDF | react-pdf |
| 檔案儲存 | Supabase Storage / S3 |
| 排程/Queue | BullMQ + Redis |
| LLM | Flexion Token API（自家） |

---

## 4. 功能模組總覽

詳細規格參見各 spec 文件：

| # | 模組 | Spec 文件 | MVP? |
|---|---|---|---|
| 1 | Auth + 統編 | `01_spec_auth.md` | ✅ |
| 2 | AI Chat + Token | `02_spec_chat.md` | ✅ |
| 3 | Billing + 方案 | `03_spec_billing.md` | ✅ |
| 4 | 訂單管理 | `04_spec_order.md` | ✅ |
| 5 | Puck 建站 | `05_spec_pagebuilder.md` | Phase 2 |
| 6 | 貿易模組 | `06_spec_trade.md` | Phase 3 |
| 7 | RAG 智能客服 | `07_spec_rag_support.md` | Phase 2 |
| 8 | Admin Portal | `08_spec_admin.md` | ✅（基礎） |
| 9 | DB Schema | `09_spec_db_schema.md` | ✅ |
| 10 | API 規格 | `10_spec_api.md` | ✅ |

---

## 5. 非功能需求

### 5.1 效能
- Chat 首字延遲 < 2s（SSE streaming）
- 頁面 LCP < 1.5s
- API P95 < 500ms（不含 LLM）

### 5.2 可用性
- SLA 99.5%
- DB 每日自動備份、保留 30 天

### 5.3 資安
- TLS 1.3 全站 HTTPS
- 個資 (PII) at-rest 加密
- 密碼 bcrypt（cost 12）
- OWASP Top 10 防護
- Rate limiting（per-user, per-IP）
- 上線前第三方滲透測試

### 5.4 法遵（台灣）
- 個資法（蒐集告知書、刪除權）
- 電子發票法（與 ECPay 整合自動開立）
- 消保法（7 天鑑賞期 → 數位服務除外條款）
- 著作權（用戶生成內容歸屬條款）

### 5.5 多語
- v1：繁體中文
- v2：+ 英文（為貿易模組與東南亞）

### 5.6 裝置支援
- 響應式 Web（桌面 + 行動瀏覽器）
- v2：原生 App（React Native）

### 5.7 可觀測性
- Logging：Pino → Better Stack
- Metrics：Vercel Analytics + 自建 dashboard
- Error tracking：Sentry
- LLM call tracing：Flexion 內建 + 自建紀錄

---

## 6. MVP 切分

### Phase 1（MVP，0–3 個月）
**目標**：核心訂閱 + Chat + 下單跑得起來，能收到第一筆錢
- Auth（個人 + 公司統編）
- AI Chat（已完成下單流程）
- Billing：Free + Starter 兩級
- 訂單管理（用戶端 + Admin 基礎）
- Admin Portal（用戶/訂單檢視）

### Phase 2（3–5 個月）
**目標**：拉高黏著度與 ARPU
- Puck 建站
- 完整 4 級方案 + Token 充值
- 基礎 RAG 客服（用戶端）

### Phase 3（5–8 個月）
**目標**：差異化與高客單價
- 貿易模組（Buyer/Seller、商品庫、詢價、Quotation PDF）
- 進階 RAG（Admin 端、跨用戶分析）
- 數據儀表板

### Phase 4（8 個月+）
- API 開放
- 多語化
- 行動 App

---

## 7. 關鍵風險與假設

| # | 風險 | 影響 | 緩解 |
|---|---|---|---|
| R1 | 統編 API 不穩 | 公司註冊體驗差 | 雙來源 fallback（財政部 + 第三方）+ 手動補登 |
| R2 | Flexion Token 成本失控 | 毛利為負 | 方案內建額度上限、超額擋下、即時監控告警 |
| R3 | ECPay 串接複雜 | MVP 延期 | 先支援單筆+月訂閱，發票延後 |
| R4 | 用戶對 AI 生成內容著作權疑慮 | 採用阻力 | 條款明確規範歸屬、可關閉訓練回饋 |
| R5 | 貿易模組需求驗證不足 | 開發後沒人用 | Phase 3 才做，先用 Phase 1-2 用戶訪談驗證 |
| R6 | RAG 跨用戶資料外洩 | 法律風險 | Tenant isolation；vector index per user |

---

## 8. 開發紀律

### 8.1 文件規範
- 所有 spec 放 `/docs/`
- 每份 spec 必含「版本紀錄」表格
- 重大變更走 PR review

### 8.2 程式碼規範
- TypeScript strict mode
- ESLint + Prettier
- Commit 規範：Conventional Commits
- 分支：`main` / `develop` / `feature/*` / `fix/*`

### 8.3 測試
- 單元測試：Vitest
- E2E：Playwright
- 覆蓋率目標：核心模組 70%+

---

## 9. 待決策清單 (Open Questions)

| # | 問題 | 負責人 | 期限 |
|---|---|---|---|
| Q1 | 產品正式中英文名稱 | Grace | TBD |
| Q2 | 統編 API 用財政部直接 or g0v 中介 | Tech | Phase 1 開工前 |
| Q3 | Token 計費：以 Flexion cost 加價 X% 還是預先打包 | Grace + Finance | Billing spec 定稿前 |
| Q4 | 子網域 vs 自訂網域（Puck 站台） | Tech | Phase 2 開工前 |
| Q5 | 貿易模組是否獨立加購 vs 綁 Pro | Grace | Phase 3 前 |

---

**下一份文件**：`01_spec_auth.md`（Auth + 統編模組詳細規格）
