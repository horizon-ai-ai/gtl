# 06 — Spec: 貿易模組（Buyer / Seller / 詢價 / Quotation）

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — 商品庫 + 詢價流程 + Quotation PDF | Grace Wu |

---

## 1. 範圍

### In Scope
- 啟用貿易模組（Pro+）
- 角色選擇：Buyer / Seller / Both
- Seller：商品上傳、管理
- Buyer：商品搜尋、詢價
- 詢價自動化：雙向 email + Quotation PDF
- 商品分類（HS Code 標準）

### Out of Scope (v1)
- 撮合演算法（推薦商品）
- 線上議價、聊天室
- 託管交易、付款
- 物流串接
- 多語商品（英中對照）— v2

---

## 2. 啟用流程

```
Pro 方案啟用後
  → [貿易模組] 入口顯示
  → 用戶點擊 → 選擇角色（Buyer / Seller / Both）
  → 補填貿易檔案：
      Seller: 公司簡介、主力產品類別、出口國、產能
      Buyer: 採購類別、預算區間、目標市場
  → 完成 → 進入主介面
```

角色可後續切換但需 Admin 審核（防濫用）。

---

## 3. User Stories

### Seller
| # | Story |
|---|---|
| S-1 | 上傳商品（單筆 / 批次 CSV） |
| S-2 | 管理庫存與價格 |
| S-3 | 收到 Buyer 詢價，取得對方聯絡資訊 |
| S-4 | 自訂 Quotation 模板（公司 logo、條款） |

### Buyer
| # | Story |
|---|---|
| B-1 | 關鍵字 / HS Code / 類別搜尋 |
| B-2 | 收藏感興趣商品 |
| B-3 | 發送詢價（單筆或多筆併送） |
| B-4 | 收到 Quotation PDF |
| B-5 | 在 chat 中讓 AI 協助比價 |

---

## 4. 商品資料模型

```typescript
Product {
  id, seller_id (=user_id)
  name, description
  hs_code: string?
  category: string
  images: string[]
  specs: jsonb          // 規格表
  moq: int              // 最低訂購量
  unit: 'pcs'|'kg'|'set'|...
  price_min, price_max  // 區間
  currency: 'USD'|'TWD'
  origin_country: string
  certifications: string[]
  lead_time_days: int
  status: 'draft'|'published'|'paused'
  search_vector: tsvector  // 全文檢索
  created_at, updated_at
}

ProductCategory {
  id, name, parent_id, hs_code_prefix
}
```

### HS Code
- 採用台灣海關 11 位 CCC Code（前 6 位即國際 HS）
- 系統內建分類樹（建表 seed）
- AI 可協助 Seller 從商品描述推測 HS Code

---

## 5. 商品上傳

### 5.1 單筆
- 表單：基本資訊 + 規格 + 圖片（最多 10 張）
- AI 助手：填寫描述後一鍵生成英文行銷文案

### 5.2 批次
- CSV 模板下載
- 上傳 → 預覽 → 確認
- 失敗逐列回報

### 5.3 圖片處理
- 自動產生 thumbnail / large 兩種尺寸
- 浮水印 toggle（防盜圖）

---

## 6. 搜尋

### 6.1 索引
- PostgreSQL `tsvector`（中英文）
- pgvector 向量搜尋（語意，AI 推薦用）
- 過濾：類別、HS Code、原產地、價格、認證

### 6.2 排序
- 相關性（預設）
- 最新上架
- 價格

### 6.3 結果頁
- 卡片：圖、名、價格區間、MOQ、Seller 國家
- 點進詳情：完整資訊 + 「詢價」按鈕

---

## 7. 詢價流程

### 7.1 Buyer 發起
```
[商品詳情] → [詢價按鈕]
  → 表單：
      期望數量、目標單價（可空）、交期、目的港、付款條件
      其他需求備註
  → 提交
  → 系統觸發雙路 email
```

### 7.2 系統觸發
**Email to Seller**：
- 主旨：「[詢價] {商品名} 來自 {Buyer 公司} ({國家})」
- 內文：詢價詳情 + Buyer 聯絡資訊（姓名、email、電話、公司、地址、統編）
- CTA：「在平台查看」連結

**Email to Buyer**：
- 主旨：「您對 {商品名} 的詢價已送達 {Seller 公司}」
- 附件：**Quotation PDF**
- 內文：Seller 已收到，預估回覆時間；如需後續聯繫可私下接洽

### 7.3 Quotation PDF 生成

模板：
```
┌────────────────────────────────────────┐
│  {Seller Logo}     QUOTATION           │
│  {Seller Co Name}                      │
│  Address / Email / Tel                 │
│  Tax ID                                │
├────────────────────────────────────────┤
│  Quotation No: Q-20260430-0001         │
│  Date: 2026-04-30                      │
│  Valid Until: 2026-05-30               │
├────────────────────────────────────────┤
│  Buyer:                                │
│  {Buyer Co Name}                       │
│  {Buyer Contact}                       │
├────────────────────────────────────────┤
│  Item    Spec    Qty    Unit    Total  │
│  ...                                   │
│  ───────────────────────────────────   │
│  Subtotal:                             │
│  Shipping (FOB Taiwan):                │
│  Total (USD):                          │
├────────────────────────────────────────┤
│  Payment Terms: T/T 30% deposit, ...   │
│  Lead Time: 30 days                    │
│  Notes: ...                            │
├────────────────────────────────────────┤
│  Signature / Stamp area                │
└────────────────────────────────────────┘
```

技術：
- `react-pdf` server-side 生成
- 多頁支援、中英雙語
- 浮水印選項（草稿 / 正式）
- 儲存至 S3 + 簽名 URL（7 天）

### 7.4 Inquiry 資料模型
```typescript
Inquiry {
  id, buyer_id, seller_id, product_id
  quantity, target_price?, delivery_terms, port_of_destination
  payment_terms, notes
  status: 'sent'|'replied'|'closed'|'expired'
  quotation_pdf_url
  expires_at  // 30 天
  created_at
}

InquiryEvent {
  inquiry_id, type, actor, data, created_at
}
```

---

## 8. AI 助手場景

| 場景 | Tool |
|---|---|
| Seller：商品描述生成英文 | `generate_product_description` |
| Seller：推薦 HS Code | `suggest_hs_code` |
| Buyer：搜尋商品 | `search_products` |
| Buyer：比較多筆報價 | `compare_quotations` |
| Buyer：起草詢價需求 | `draft_inquiry` |

---

## 9. API Endpoints

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/trade/profile` | 設定貿易角色 |
| GET | `/api/trade/products` | 商品搜尋 |
| POST | `/api/trade/products` | 上架商品 |
| PATCH | `/api/trade/products/:id` | 編輯 |
| DELETE | `/api/trade/products/:id` | 下架 |
| POST | `/api/trade/products/bulk` | 批次上傳 CSV |
| GET | `/api/trade/products/:id` | 詳情 |
| POST | `/api/trade/inquiries` | 發送詢價 |
| GET | `/api/trade/inquiries` | 列表（買 or 賣） |
| GET | `/api/trade/inquiries/:id` | 詳情 |
| GET | `/api/trade/inquiries/:id/quotation.pdf` | 下載 PDF |
| GET | `/api/trade/categories` | 類別樹 |
| GET | `/api/trade/hs-codes/suggest` | HS Code 建議 |

---

## 10. 通知

| 事件 | Buyer | Seller |
|---|---|---|
| 詢價送出 | ✉️ + 站內 | ✉️ + 站內 |
| Seller 在平台回覆 (v2) | ✉️ + 站內 | — |
| 詢價即將過期 | ✉️ | ✉️ |

---

## 11. 限制
- Pro：100 商品 / 月 500 詢價
- Enterprise：無限
- 每個詢價有效期 30 天

---

## 12. 合規與安全
- 商品內容審核（違禁品、武器、毒品、藥品）
- 報價 PDF 不具法律效力，須在 footer 註明
- Buyer 聯絡資訊揭露需經 Buyer 同意（註冊時 opt-in）
- 反爬蟲：商品列表加速率限制

---

## 13. 邊界 & 錯誤
- Seller 商品下架時的活躍 inquiry → 標記但不刪
- 同 Buyer 24h 內對同 Seller 多次詢價 → 提醒整併
- PDF 生成失敗 → 後台 retry + 通知

---

## 14. 開放問題
- Q1: 是否要支援平台託管交易（escrow）— v3
- Q2: HS Code 自動推薦準確度測試 — Phase 3 開工前 POC
- Q3: 是否開放公開瀏覽（未登入）— SEO 考量，建議 v1.5 開放
