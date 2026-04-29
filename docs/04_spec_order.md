# 04 — Spec: 訂單管理

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — 用戶端訂單追蹤 + Admin 訂單管理 | Grace Wu |

---

## 1. 範圍

> 「下單」這裡指的是 **平台用戶在 chat 中為他們的客戶建立的訂單**（B2B SaaS：用戶用我們的工具替他們的買家成交），與訂閱付款訂單 (`Invoice`) 是兩件事。

### In Scope
- Order：用戶（賣家）為其終端買家建立的訂單
- 訂單狀態流轉
- 訂單列表 / 詳情 / 編輯
- Admin 端訂單檢視（不主動干預）
- 匯出 CSV

### Out of Scope (v1)
- 物流串接
- 金流串接（end-buyer 付款由用戶自理 v1）
- 退貨流程

---

## 2. 名詞定義

| 名詞 | 定義 |
|---|---|
| **平台用戶** | 註冊使用我們服務的人（賣家） |
| **終端買家 (End-buyer)** | 平台用戶的客戶 |
| **Order** | 平台用戶為終端買家建立的訂單紀錄 |
| **Invoice** | 平台用戶付給我們的訂閱費 / Token Pack（見 03） |

---

## 3. User Stories

| # | As a | I want to | So that |
|---|---|---|---|
| US-1 | 平台用戶 | 在 chat 中由 AI 建立訂單 | 不離開對話即成交 |
| US-2 | 平台用戶 | 看到所有訂單列表 | 統一管理客戶 |
| US-3 | 平台用戶 | 編輯訂單狀態（已付款 / 出貨 / 完成） | 追蹤進度 |
| US-4 | 平台用戶 | 匯出訂單 CSV | 對帳 / 報稅 |
| US-5 | Admin | 看到所有平台用戶的訂單統計 | 觀察平台 GMV |

---

## 4. 訂單狀態機

```
[draft] ──確認──> [pending]
   │                   │
   │                ─付款─> [paid]
   │                          │
   │                       ─出貨─> [shipped]
   │                                   │
   │                                ─送達─> [completed]
   │
   └──取消──> [canceled]
[paid] ──退款──> [refunded]
```

| 狀態 | 中文 | 說明 |
|---|---|---|
| `draft` | 草稿 | AI 建立中 |
| `pending` | 待付款 | 用戶確認，等買家付款 |
| `paid` | 已付款 | |
| `shipped` | 已出貨 | |
| `completed` | 已完成 | |
| `canceled` | 已取消 | |
| `refunded` | 已退款 | |

---

## 5. 資料模型

```typescript
Order {
  id, user_id  // 平台用戶
  order_no: string  // 顯示用編號 (e.g. ORD-20260430-0001)
  conversation_id?: string  // 來源對話
  status: enum
  customer: {
    name, email, phone, address, tax_id?
  }
  items: OrderItem[]
  subtotal, tax, shipping, total
  currency: 'TWD'
  notes: string?
  metadata: jsonb  // AI 建立時的 raw context
  created_at, updated_at
}

OrderItem {
  id, order_id
  name, description?, sku?
  quantity, unit_price, total
}

OrderEvent {  // audit log
  id, order_id, type, data, actor: 'user'|'ai'|'admin', created_at
}
```

---

## 6. 介面規格（用戶端）

### 6.1 訂單列表
- 篩選：狀態、日期區間、客戶名、金額區間
- 排序：建立時間、金額
- Bulk action：批次改狀態、匯出
- 分頁：20 / page

### 6.2 訂單詳情
- 基本資訊區（客戶、金額、狀態）
- 商品清單表
- 狀態時間線
- 動作：改狀態、加備註、列印、刪除（僅 draft）
- 「在對話中查看」連結回 Conversation

### 6.3 從 Chat 建立
- 觸發：AI tool call `create_order`
- Chat 中渲染 OrderForm（可編輯）
- 用戶 Confirm → 建立 Order，狀態 `pending`
- Chat 中插入「訂單已建立 #ORD-xxx」訊息卡

---

## 7. 介面規格（Admin 端）

> Admin 預設**唯讀**，僅在客訴時介入

- 訂單總覽（全平台）
- 篩選：用戶、狀態、日期、金額
- 詳情頁：含 platform 用戶資訊
- 動作：標註異常、強制取消（需理由）
- 統計：每日 GMV、Top 用戶

---

## 8. API Endpoints

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/orders` | 列表（自己的） |
| POST | `/api/orders` | 建立（手動 or AI tool） |
| GET | `/api/orders/:id` | 詳情 |
| PATCH | `/api/orders/:id` | 更新狀態 / 欄位 |
| DELETE | `/api/orders/:id` | 刪除（draft only） |
| GET | `/api/orders/export.csv` | 匯出 |
| GET | `/api/admin/orders` | (admin) 全平台列表 |
| GET | `/api/admin/orders/stats` | (admin) 統計 |

---

## 9. AI Tool: `create_order`

```json
{
  "name": "create_order",
  "parameters": {
    "customer": { "name": "...", "email": "...", "phone": "..." },
    "items": [
      { "name": "...", "quantity": 1, "unit_price": 1000 }
    ],
    "shipping": 100,
    "notes": "..."
  }
}
```

行為：
- 建立 Order 狀態 `draft`
- 回傳 order_id 給 LLM
- 前端渲染確認表單；用戶確認後 PATCH 為 `pending`

---

## 10. 通知

| 事件 | 通知對象 | 管道 |
|---|---|---|
| 訂單建立 | 平台用戶 | 站內 + email |
| 狀態變更 | 平台用戶 | 站內 |
| 異常（金額異常等） | Admin | Slack webhook |

---

## 11. 邊界 & 錯誤
- AI 建立訂單金額為 0 / 負 → 拒絕
- 同 conversation 重複建單 → 提示用戶確認
- 大量訂單匯出 → 後台 job + email 寄連結

---

## 12. 開放問題
- Q1: 訂單編號規則：日期+流水 vs UUID 顯示用？
- Q2: 是否要支援多幣別（USD）— v2，搭配貿易模組
- Q3: 訂單修改是否要客戶確認 link？— v2
