# G³ AI 介面改造 — Handoff for Marlow

> **From**: Grace Wu (AI 數位轉型策略總監)
> **To**: Marlow
> **Date**: 2026-06-07
> **Status**: 全部 11 個 Phase 已落地、push 上 GitHub，整合分支 `feat/g3-ui-redesign` 為 Draft PR #5
> **Dev spec**: `~/Desktop/gtl_ui_redesign_spec.md` v0.2.0（在 Grace 桌面，含完整版本紀錄）

---

## 1. 一句話概括

把 user portal + admin 部分頁面，依業主 G³ 介面示意（2026/04/30 + 2026/06/07 補件）做了**設計系統 token 化 + 三色軸線（Generate/Growth/Global）注入 + Hero 呼吸動畫 + 對話入口 chip 雲 + Orders 列表重做 + 貿易訂單 9-stage timeline + lifecycle 狀態機 API**。

---

## 2. 分支結構（GitHub: `horizon-ai-ai/gtl`）

```
main
└── feat/g3-ui-redesign                     ← 整合分支（PR #5 → main，Draft）
      ├── feat/g3-ui-redesign-phase1-tokens
      ├── feat/g3-ui-redesign-phase2-sidebar
      ├── feat/g3-ui-redesign-phase3-hero
      ├── feat/g3-ui-redesign-phase4-chips
      ├── feat/g3-ui-redesign-phase5-accent
      ├── feat/g3-ui-redesign-phase6-polish
      ├── feat/g3-ui-redesign-phase7-landing
      ├── feat/g3-ui-redesign-phase8-orders
      ├── feat/g3-ui-redesign-phase9-trade-timeline
      ├── feat/g3-ui-redesign-phase10-trade-polish
      └── feat/g3-ui-redesign-phase11-trigger-fix
```

**所有 commit 都在 feature branch 上，main 沒被動過。** 每個 Phase 一條子分支，最後 ff-merge 進整合分支。Commit 訊息採 Conventional Commits（`feat(ui): …` / `fix(trade): …` 等）。

**Rollup PR**: https://github.com/horizon-ai-ai/gtl/pull/5 — 整合分支 → main，目前 **Draft**，等 Grace + Marlow review 後再轉 Ready for review。

---

## 3. 各 Phase 改動摘要

| Phase | Commit | 主題 | 主要檔案 |
|---|---|---|---|
| 1 | `5b492a2` | 設計 token：三色 8 階色階 + 漸層 + 呼吸 keyframe | `tailwind.config.ts`、`src/app/globals.css` |
| 2 | `66fb8c2` | Sidebar 改 G³ 漸層底 + logo + 漸層 avatar | `src/components/app/app-shell.tsx` |
| 3 | `a368250` | Hero v1（rounded card） + 個人化歡迎語 | `src/components/app/hero-breathing.tsx`、`brand-watermark.tsx` |
| 4 | `5bad1b6` | 輸入框漸層送出鈕 + 33 個業務 chip | `src/components/ui/ai-chat-input.tsx`、`prompt-chips.tsx`、`src/lib/chips/default-prompts.ts` |
| 5 | `b40998f` | `data-accent` 自動注入 + `--g3-accent-*` CSS vars | `src/components/app/app-shell.tsx`、`src/app/globals.css` |
| 6 | `56d3130` | Hero v2 滿版滲透漸層（bottom mask fade） + swoosh 浮水印 | 同上 hero 元件 |
| 7 | `41cf3bc` | 未登入 landing page 整頁重寫為 G³ AI 品牌 | `src/app/page.tsx`、`src/app/layout.tsx`（title） |
| 8 | `89c35f4` | `/orders` 列表重做（filter API + 階段說明 banner + 9 欄位 grid） | `src/app/(app)/orders/page.tsx`、`src/app/api/orders/route.ts` |
| 9 | `c4b6080` | 貿易訂單 9-stage timeline + lifecycle 狀態機 API | `src/lib/trade-order-stages.ts`、`src/components/app/trade-order-timeline.tsx`、`src/app/api/orders/[id]/lifecycle/route.ts`、`src/app/(app)/orders/[id]/page.tsx` |
| 10 | `9bdd62b` | Trade workspace hero 移除冗文案 + 套 Global 紫色軸線 | `src/app/(app)/trade/page.tsx`、`src/app/globals.css`（trade-quick-link） |
| 11 | `05d0954` | 修「觸發成立訂單後沒狀態更新」：起始 status="quoted" + revalidatePath | `src/app/admin/trade/quotations/page.tsx` |

---

## 4. 設計系統規格（Phase 1 + 5）

### 4.1 三色品牌色

| Token Prefix | HEX (300=base) | 對應軸 | 意涵 |
|---|---|---|---|
| `--g3-generate-*` / `bg-generate-300` | `#9be6d7` | 設計 Generate | 系統化、創造、生成 |
| `--g3-growth-*` / `bg-growth-300` | `#7dc8fa` | 行銷 Growth | 數據、邏輯推動、行銷決策 |
| `--g3-global-*` / `bg-global-300` | `#be9bf0` | 貿易 Global | 智能整合、連結 |

每色 8 階（50, 100, 200, 300, 400, 500, 600, 700）。

### 4.2 漸層 + 呼吸動畫

```css
--g3-gradient-brand:      linear-gradient(120deg, #9be6d7, #7dc8fa, #be9bf0);
--g3-gradient-brand-soft: linear-gradient(120deg, rgba(...,.35) ...);

@keyframes brand-breathing { /* 30s 一輪 */ }
.bg-g3-breathing { ... animation: brand-breathing 30s ease-in-out infinite; }
```

Tailwind 端：`bg-g3-brand` / `bg-g3-brand-soft` / `bg-g3-breathing` / `animate-brand-breathing`

### 4.3 模組 accent 注入

`AppShell` 依 `usePathname()` 在 `<main>` 加 `data-accent="generate|growth|global"`：

| 模組 | accent |
|---|---|
| `/chat`, `/generate`, `/sites` | generate（綠） |
| `/analytics`, `/orders`, `/billing`, `/settings` | growth（藍） |
| `/trade`, `/support` | global（紫） |

子元件用 `text-[color:var(--g3-accent-500)]` 等 arbitrary value 套色，會自動跟著當前模組變化。

---

## 5. 新增的 API endpoint

### `POST /api/orders/[id]/lifecycle`

**用途**：推進貿易訂單的 9-stage lifecycle。

**Body**:
```json
{ "stage_key": "order_confirmed" | "processing" | "shipped" | "in_transit" | "arrived_warehouse" | "stocked_inbound" }
```

**Role gating**:
- `admin / super_admin`：可跳到任一未來 stage（多步）
- order owner (seller)：限「下一步」單步推進

**Side effects**:
- 更新 `order.metadata.lifecycle_stage` + `lifecycle_stage_at`
- 寫 `OrderEvent`（type=`lifecycle_advanced`，data={from,to,by_user_id}）
- Status promotion：`order_confirmed → in_execution`、`shipped → shipped`、`stocked_inbound → completed`

**Response**: 完整 order + `stages: TradeStage[]`

**檔案**：`src/app/api/orders/[id]/lifecycle/route.ts`

### `GET /api/orders` 擴充

新增 query params：
- `status`
- `service_type`：`marketing | design | trade | website | other`
- `date_start`, `date_end`（created_at 範圍）
- `quote_date_start`, `quote_date_end`（submitted_at 範圍）
- `q`（關鍵字搜尋：order_no / title / items.name）

每筆 response row 附 `service_type` 欄位（由 `deriveServiceType()` 推導）。

---

## 6. 新增的 helper / library

| 檔案 | 用途 |
|---|---|
| `src/lib/trade-order-stages.ts` | `deriveTradeStages(order)`：把 status + `metadata.lifecycle_stage` 映射成 9 個顯示 stage（done / active / pending）。`nextAdvanceableStage()` 取得當前可推進 stage |
| `src/lib/chips/default-prompts.ts` | 33 個業務 chip 預設清單（依業主 PDF 列舉） |

---

## 7. 新增的 React 元件

| 元件 | 用途 |
|---|---|
| `src/components/app/hero-breathing.tsx` | Hero 區塊：30s 呼吸漸層 + bottom mask fade + 個人化歡迎語 |
| `src/components/app/brand-watermark.tsx` | Inline SVG G³ swoosh 浮水印（暫代版，等業主提供正式 SVG） |
| `src/components/app/trade-order-timeline.tsx` | 貿易訂單 9-stage stepper + PI/PL/CI/詢問客服按鈕 + 推進 CTA |
| `src/components/ui/prompt-chips.tsx` | 標籤雲元件，hover 邊框依 chip category 變色 |

---

## 8. 環境設定 / Migration

### 8.1 `.env` 需要的新變數
Prisma schema 引用了 `DATABASE_URL_UNPOOLED`，但 `.env.example` 沒列。Marlow 本機跑時請補：

```env
DATABASE_URL_UNPOOLED="postgresql://postgres:postgres@localhost:5433/marketing_ai_platform?schema=public"
```

**TODO**: 把這個變數加到 `.env.example`，並在 README 提及。

### 8.2 DB schema 同步
本地我有跑 `npx prisma db push --skip-generate --accept-data-loss`（因為 schema 有 `DesignTask` 但本地 db 還沒有）。Marlow 應該 fresh clone + `npm install` + `prisma db push` 一次。

**注意**：`db push --accept-data-loss` 砍掉了我本地的 `TradeLifecycleRule` table（6 筆過時資料）。乾淨環境跑不會有這個 warning。

### 8.3 Lifecycle 狀態存放位置
本次選擇用 `order.metadata.lifecycle_stage`（JSON 欄位內的 key）而**不是新增資料庫欄位**。優點是不用 migration，缺點是無法做 SQL index。

如果未來要常以 lifecycle_stage 做 reporting / dashboard，建議：
- 新增 `Order.lifecycle_stage String?` column
- 寫一支 migration script 把現有 `metadata.lifecycle_stage` 反向 backfill
- 更新 `deriveTradeStages` + lifecycle route 同時讀寫兩處（漸進過渡）

---

## 9. 重要 TODO（沒做完，留給 Marlow）

依優先序：

### P0 — 必修
- [ ] **業主提供正式 logo SVG + 浮水印 SVG**：目前 `brand-watermark.tsx` 是 inline SVG 暫代版；sidebar logo 是文字 G³ 漸層，非業主示意的六角立體形。檔案到位後放 `public/brand/g3-logo.svg` 與 `public/brand/g3-watermark.svg`，再去元件裡換掉
- [ ] **`.env.example` 補 `DATABASE_URL_UNPOOLED`**（見 §8.1）

### P1 — 重要
- [ ] **Orders 列表 file_filter 後端未實作**：UI 有「報價已上傳 / 發票已上傳 / 檔案已上傳」下拉，但 `GET /api/orders` 還沒 honor 這個 query param。需要新增「order 有沒有 quotation/invoice/file」的關聯查詢
- [ ] **訂單卡片操作鈕未接 API**：「會議預約」「會議紀錄」「檔案壓縮下載」目前是純按鈕無 onClick。需要：
  - 會議預約：可能要接 Google Calendar / Lark Calendar
  - 會議紀錄：可能要列 OrderEvent 中的 meeting 類型
  - 檔案壓縮下載：要實作 server-side zip 與 streaming download
- [ ] **PL 包裝清單 / CI 單下載未實作**：`TradeOrderTimeline` 中目前是 `disabled` 按鈕。需要訂單檔案管理流程（admin 端上傳、user 端下載）
- [ ] **Trade order 訊息頻道**：`/orders/[id]#chat` 連結點下去只跳到 anchor，沒有真正的訂單聊天室 UI

### P2 — 改善
- [ ] **Phase 9 完成後可移除舊版 6-card lifecycle grid**：`src/app/(app)/orders/[id]/page.tsx` 第 806–822 行（搜 `tradeTimeline.length > 0`）是舊版顯示，新版 stepper 已能取代，sign-off 後可刪
- [ ] **Lifecycle 階段可逆 / 撤銷**：目前只能 forward-only。如果 admin 誤推，需要 revert 機制（會牽動 OrderEvent 與 status 雙向變動）
- [ ] **prefers-reduced-motion 對 chip hover 也禁用**：目前只擋了呼吸動畫
- [ ] **對比度量測**：spec §6.4 列為驗收標準，但本次沒實際拿 WCAG checker 量過。請對 `bg-g3-breathing` 底 + `text-stone-800` 量 contrast ratio

### P3 — 風格 / nice-to-have
- [ ] **六角立體 logo + send button**：業主 26/06/07 示意中 logo 與送出按鈕是 hexagonal 3D 立方體，目前是 2D 漸層圓角，待業主提供素材或設計師出圖
- [ ] **PromptChips 改為 horizontal scrollable rows**（依業主示意呈三排）：目前是 flex-wrap 自然換行

---

## 10. 已驗證的事項

- [x] `npm run lint` 整個 repo 通過（零新增 error/warning）
- [x] Tailwind 編譯通過（CSS 產出含 G³ tokens 與 breathing keyframe）
- [x] Hero 呼吸動畫 30s 循環，`prefers-reduced-motion` fallback OK
- [x] 點 chip → input 填值 + focus textarea
- [x] Admin 觸發成立訂單後，user portal `/orders` 列表立即出現新訂單卡片
- [x] User portal `/orders/[id]` 顯示 9-stage stepper，stage 1–3 done、stage 4 active
- [x] 「確認推進」按鈕能成功 POST `/api/orders/[id]/lifecycle`、stage 4 → 5 transition

## 11. 沒驗證的事項

- [ ] Admin 多步推進（跳兩階以上）— 邏輯有寫，未手測
- [ ] 非 admin / 非 owner 嘗試呼叫 lifecycle API（應該 403）— 邏輯有寫，未手測
- [ ] OrderEvent timeline 顯示 `lifecycle_advanced` 事件的中文 label — 沒在 `EVENT_LABEL` 加 key，看起來會 fallback 顯示原 type 字串。Marlow 接手時請補：

```ts
// src/app/(app)/orders/[id]/page.tsx 找 EVENT_LABEL
lifecycle_advanced: "貿易階段推進",
```

---

## 12. 本地開發指令

```bash
# Clone
git clone https://github.com/horizon-ai-ai/gtl.git
cd gtl
git checkout feat/g3-ui-redesign

# Setup
cp .env.example .env
# 補上 DATABASE_URL_UNPOOLED（見 §8.1）
# 補上其他 LLM key 才能玩對話功能

# Boot
docker run -d --name marketing-ai-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=marketing_ai_platform \
  -p 5433:5432 \
  pgvector/pgvector:pg15

npm install
npx prisma db push
npx prisma generate
npm run db:seed         # 建立 demo user + 詢價資料
npm run dev             # → http://localhost:3000

# Admin portal (另開 terminal)
npm run admin:dev       # → http://localhost:3001
```

---

## 13. 設計 spec 文件位置

完整 dev spec（含版本紀錄、Phase 1–9 完整規格、驗收標準、分支流程）：

> **`~/Desktop/gtl_ui_redesign_spec.md`** v0.2.0

請 Marlow 與 Grace 索取此檔案後再開始接手工作。

---

## 14. 後續溝通

- 視覺微調或業主回饋 → 直接在這個整合分支開新 Phase（Phase 12 起）
- 後端 / API 改動 → 同上，commit message 用 `fix()` 或 `feat()` 加模組名（trade/orders/chat）
- 整合分支與 main 之間目前沒有自動 merge，需 Grace 審 PR #5 才會進 main

有問題請直接找 Grace，或在 PR #5 留 comment。

— Claude (Anthropic) on behalf of Grace
