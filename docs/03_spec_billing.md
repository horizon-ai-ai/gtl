# 03 — Spec: Billing、方案、充值、發票

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — 4 級方案、ECPay 訂閱、Token Pack 充值、電子發票 | Grace Wu |

---

## 1. 範圍

### In Scope
- 訂閱方案（Free / Starter / Pro / Enterprise）
- 方案功能 gating（feature flag）
- Token Pack 充值
- 訂閱升級 / 降級 / 取消
- 自動續訂 + 失敗重試
- 電子發票（B2C 二聯 / B2B 三聯帶統編）
- 退款處理（人工審核）

### Out of Scope (v1)
- 年訂閱優惠（v2）
- 推薦碼 / 折扣碼（v2）
- 多幣別（v2）

---

## 2. 方案矩陣

| 功能 | Free | Starter | Pro | Enterprise |
|---|---|---|---|---|
| 月費 (TWD) | 0 | 990 | 2,990 | 洽談 |
| 月 Token Credits | 100K | 1M | 5M | 客製 |
| 可用模型 | Haiku | Haiku, Sonnet | All | All |
| AI Chat | ✅ | ✅ | ✅ | ✅ |
| 引導下單 | ✅ | ✅ | ✅ | ✅ |
| 商品頁建置（Trade Site Builder） | ❌ | ❌ | ✅ | ✅ |
| Puck 視覺編輯 | ❌ | ❌ | ✅ | ✅ |
| 自訂網域 | ❌ | ❌ | ✅ | ✅ |
| 貿易模組 | ❌ | ❌ | ✅ | ✅ |
| RAG 客服 | 基礎 | 基礎 | 進階 | 專屬訓練 |
| Admin 子帳號 | 1 | 3 | 10 | 無限 |
| 客服支援 | 社群 | Email | Email + 線上 | 專屬窗口 |
| API 存取 | ❌ | ❌ | ❌ | ✅ |

> 定價策略待確認（Q3 in PRD）。建議 Pro 維持 NT$2,990 — 對標 Notion/Canva 中階方案。

---

## 3. Token Pack 充值

| Pack | 價格 (TWD) | 信用度 (Credits) | 單價 |
|---|---|---|---|
| Small | 300 | 500K | 0.6 / 1K |
| Medium | 1,200 | 2.5M | 0.48 / 1K |
| Large | 5,000 | 12M | 0.42 / 1K |

- Pack 不過期
- 月方案 credits 用完才動用 pack
- Free 用戶可購買 Pack（但僅能用 Haiku）

---

## 4. 訂閱流程

### 4.1 升級
```
[方案頁] → 點 Pro → 確認頁
  → ECPay 信用卡頁（記卡）
  → 授權成功 → 立即生效
  → 寄發確認信 + 發票
```

**按比例計費（Proration）**：
- 從 Starter 升 Pro，剩餘天數依 Pro 單價收差額
- 計算：`(Pro 月費 - Starter 月費) × 剩餘天數 / 30`

### 4.2 降級
- 月底生效（不退差額）
- 立即標記 `next_plan`，下次續訂時切換
- 多餘的 Pro 限定資料（如商品頁站點數）：保留唯讀，超出限額不能新增

### 4.3 取消
- 月底生效
- 立即停止自動續訂
- 帳號維持當期使用至月底

### 4.4 自動續訂
- ECPay 信用卡定期定額（每月同日）
- 失敗：
  - Day 0：扣款失敗 → 寄通知
  - Day 3：重試 → 失敗再寄
  - Day 7：仍失敗 → 降至 Free，保留資料 30 天

---

## 5. ECPay 整合

### 5.1 用到的 API
| 用途 | API |
|---|---|
| 信用卡定期定額 | 「定期定額」服務 |
| 一次性付款（Token Pack） | 一般信用卡刷卡 |
| 電子發票 | 「電子發票」加值服務 |

### 5.2 流程（訂閱）
```
前端 → 我方後端 /api/billing/subscribe
  → 後端產生 MerchantTradeNo + 簽章
  → 回傳表單 → 前端 POST 到 ECPay
  → ECPay 收款 + Callback to 我方 webhook
  → Webhook 驗章 → 更新 subscription 狀態
  → 通知用戶（前端 polling 或 websocket）
```

### 5.3 Webhook 安全
- 驗 CheckMacValue
- 冪等：以 ECPay TradeNo 為 key
- 失敗重試：ECPay 會重送 3 次，我方需回 `1|OK`

---

## 6. 電子發票

### 6.1 開立規則
- B2C（個人帳號）：二聯式、捐贈愛心碼或載具
- B2B（公司帳號）：三聯式，自動帶統編
- 開立時機：扣款成功後同步開立（ECPay 加值服務）

### 6.2 載具
- 手機條碼
- 自然人憑證
- 會員載具（綁定 email）

### 6.3 折讓 / 作廢
- 退款 → 自動觸發折讓單
- 跨月退款 → 折讓（不可作廢）
- 同月退款 → 作廢原發票

---

## 7. 資料模型

```typescript
Plan {
  id, name, price_monthly, monthly_credits, features: jsonb
  stripe_price_id?, ecpay_period_id?
}

Subscription {
  id, user_id, plan_id, status: 'active'|'past_due'|'canceled'|'trial'
  current_period_start, current_period_end
  cancel_at_period_end: boolean
  next_plan_id?  // 排定下期切換
  ecpay_recurring_id
  created_at, updated_at
}

Invoice {
  id, user_id, subscription_id?, type: 'subscription' | 'topup'
  amount, currency: 'TWD'
  ecpay_trade_no
  einvoice_number, einvoice_status
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  paid_at, refunded_at
}

TokenPack {
  id, user_id, invoice_id, credits_total, credits_used, expires_at?
}

UserUsage  // 見 02_spec_chat.md
```

---

## 8. 功能 Gating

實作方式：
- DB：`Plan.features` jsonb 儲存 feature flag
- seller 權限相關流程使用 `trade_module`
- 前端：`useFeatureFlag()` hook 控制 UI 顯示

| Flag | 對應功能 |
|---|---|
| `chat.model.sonnet` | 可用 Sonnet |
| `chat.model.opus` | 可用 Opus |
| `pagebuilder` | Trade 內商品頁建置 / Puck 視覺編輯 |
| `pagebuilder.custom_domain` | 自訂網域 |
| `pagebuilder.max_sites` | 站數上限（int） |
| `trade_module` | 開啟商品頁建置、seller 身份申請、商品上架與 seller quotation 流程 |
| `rag.advanced` | 進階 RAG |
| `team.max_members` | 子帳號數（int） |
| `api_access` | API 存取 |

---

## 9. API Endpoints

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/billing/plans` | 方案列表 |
| GET | `/api/billing/subscription` | 當前訂閱 |
| POST | `/api/billing/subscribe` | 升級/開通 |
| POST | `/api/billing/cancel` | 取消訂閱 |
| POST | `/api/billing/change-plan` | 升降級 |
| GET | `/api/billing/topup-packs` | 加值方案 |
| POST | `/api/billing/topup` | 購買 Token Pack |
| GET | `/api/billing/invoices` | 發票歷史 |
| GET | `/api/billing/invoices/:id/pdf` | 下載發票 PDF |
| POST | `/api/billing/refund-request` | 退款申請（人工） |
| POST | `/api/webhooks/ecpay` | ECPay callback |

---

## 10. UI 規格

### 10.1 方案頁
- 4 欄卡片對比
- 高亮當前方案 / 推薦方案
- CTA：「升級」「降級」「取消」
- 年付選項預留（v2 灰）

### 10.2 Billing Dashboard
- 當前方案 + 下期方案
- 本月用量條
- 發票歷史表格（可下載）
- 信用卡管理（更換、移除）

### 10.3 額度用盡 Modal
- 標題：「本月 Token 已用完」
- 兩個 CTA：
  - 「升級方案」（推薦）
  - 「立即充值」
- 顯示剩餘天數至重置

---

## 11. 邊界 & 錯誤

| 情境 | 處理 |
|---|---|
| ECPay 扣款失敗 | 進入 past_due 狀態，3+7 天重試 |
| 用戶在升級當下扣款失敗 | 不啟用新方案、維持原方案 |
| 同時升降級併發 | 樂觀鎖：subscription.version |
| 退款已開發票 | 自動折讓 |
| Token Pack 與訂閱併購 | 兩筆獨立交易，各自開發票 |

---

## 12. 安全與合規
- PCI-DSS：信用卡資訊**不**經過我方 server，由 ECPay 託管
- 發票資料保留 7 年
- 用戶刪除帳號 → 發票紀錄保留（法規）、PII 匿名化

---

## 13. 開放問題
- Q1: Pro 與 Starter 之間是否要 Plus 方案 (NT$1,990)? — 觀察 MVP 數據再決定
- Q2: 退款政策：未使用 7 天無條件退？只退未使用 credits？— 法務確認
- Q3: 企業客戶匯款付款（非信用卡）流程 — Phase 2
