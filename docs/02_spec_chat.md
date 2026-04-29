# 02 — Spec: AI Chat & Token 計量

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — Chat 任務列表、Flexion 接入、Token 計量、引導下單（已實作） | Grace Wu |

---

## 1. 範圍

### In Scope
- 對話介面（任務列表 sidebar + 對話視窗）
- 接入 Flexion Token API（streaming）
- 對話歷史持久化
- Token 用量即時顯示與額度管控
- 對話引導下單（已完成，本 spec 標註整合點）
- 對話分類標籤（自動 + 手動）

### Out of Scope (v1)
- 多模態（語音、圖片輸入） — v2
- 跨對話 memory（長期記憶） — v2
- 協作（多人共編對話） — v3

---

## 2. User Stories

| # | As a | I want to | So that |
|---|---|---|---|
| US-1 | 用戶 | 開新對話討論行銷需求 | 取得 AI 建議 |
| US-2 | 用戶 | 看到歷史對話列表並回到任一條 | 延續之前的工作 |
| US-3 | 用戶 | 對話中能直接下單 | 成交不離開 chat |
| US-4 | 用戶 | 看到本月 Token 剩多少 | 預判何時要充值 |
| US-5 | 用戶 | 額度用完時被引導充值/升級 | 不中斷工作流 |
| US-6 | 用戶 | 重新命名 / 刪除對話 | 整理工作空間 |

---

## 3. 介面架構

```
┌──────────────────────────────────────────────────┐
│  [Sidebar]                  [Chat Main]          │
│  ┌──────────────┐          ┌─────────────────┐  │
│  │ + New Chat   │          │  Title          │  │
│  │              │          │  ───────────    │  │
│  │ Today        │          │  [Messages...]  │  │
│  │  • 對話 1    │          │                 │  │
│  │  • 對話 2    │          │                 │  │
│  │              │          │  [Input]        │  │
│  │ Previous 7d  │          │  Token: 80K/1M  │  │
│  │  • ...       │          └─────────────────┘  │
│  │              │                               │
│  │ Older        │                               │
│  └──────────────┘                               │
└──────────────────────────────────────────────────┘
```

---

## 4. 對話流程

### 4.1 新對話
1. 用戶點 `+ New Chat`
2. 後端建立 `Conversation` record（先不寫 DB，待第一條訊息送出再 commit）
3. 用戶輸入 → 送 `POST /api/chat/messages`
4. 後端：
   - 檢查 Token 額度
   - 組 system prompt（依方案、用戶角色注入工具）
   - 呼叫 Flexion API（streaming）
   - SSE 推回前端
5. AI 回應結束後：
   - 計算實際 Token 用量
   - 寫入 `Message` + 更新 `UserUsage`
   - 自動產生對話標題（首訊息 LLM 摘要）

### 4.2 訊息結構
```typescript
Message {
  id, conversation_id, role: 'user' | 'assistant' | 'tool'
  content: string | StructuredContent
  tool_calls: ToolCall[]?
  tokens_input: int
  tokens_output: int
  model: string
  created_at
}

StructuredContent {
  type: 'text' | 'product_card' | 'order_form' | 'page_preview'
  data: any
}
```

### 4.3 Streaming 規格
- 協定：SSE (Server-Sent Events)
- Endpoint：`POST /api/chat/messages` (streaming response)
- Event types：`token`, `tool_call`, `tool_result`, `done`, `error`
- 客戶端中斷：`AbortController`，後端收到斷線即停止計費

---

## 5. Flexion API 整合

### 5.1 介接點
```
POST https://api.flexion.horizon-ai.ai/v1/chat/completions
Headers:
  Authorization: Bearer {FLEXION_API_KEY}
  X-Tenant-Id: marketing-ai-platform
Body:
  model, messages, tools, stream: true, ...
```

### 5.2 模型選擇策略
| 場景 | 模型 |
|---|---|
| 一般 chat | Flexion → Claude Sonnet 4.6 |
| 複雜推理（建站、貿易報價） | Flexion → Claude Opus 4.7 |
| 快速回答 | Flexion → Haiku 4.5 |

模型選擇在後端決定，前端不暴露。

### 5.3 Tools (Function Calling)
| Tool | 用途 | 模組 |
|---|---|---|
| `create_order` | 建立訂單（已實作） | Order |
| `lookup_product` | 查商品 | Trade（Phase 3） |
| `send_inquiry` | 發詢價 | Trade |
| `generate_page` | 生成 Puck schema | PageBuilder |
| `query_kb` | RAG 知識查詢 | RAG |

---

## 6. Token 計量與額度

### 6.1 計量單位
- 以 Flexion 回傳的 `usage.input_tokens` + `usage.output_tokens` 為準
- 不同模型的 cost ratio 換算成「平台 Token Credits」（隱藏實際成本）

| 模型 | 平台 Credits 倍率 |
|---|---|
| Haiku | 1× |
| Sonnet | 5× |
| Opus | 25× |

> 例：Sonnet 用 1000 input + 500 output = 1500 raw tokens × 5 = 7500 credits 扣除

### 6.2 額度管理
```
UserUsage {
  user_id, period: 'YYYY-MM'
  plan_credits: int        // 當月方案內含
  topup_credits: int       // 加值購買
  used_credits: int
  reset_at: datetime       // 下次重置時間
}
```

### 6.3 流程
- 每次對話前：`available = plan_credits + topup_credits - used_credits`
- `available <= 0` → 阻擋並彈出充值/升級 modal
- `available < 10%` → 黃色警示
- 月底重置 plan_credits（topup_credits 不歸零，順延）

### 6.4 即時顯示
- 對話下方顯示：`已用 80K / 1M (本月)`
- 進度條 + 顏色（綠/黃/紅）
- 點擊 → 跳轉至 Billing 頁

---

## 7. 對話管理

### 7.1 列表 (Sidebar)
- 分組：Today / Previous 7 days / Previous 30 days / Older
- 顯示：標題（自動產生或手動命名）、時間
- 動作：重新命名、刪除、釘選、分享（v2）

### 7.2 標題自動產生
- 第一輪對話結束後，背景呼叫 LLM 摘要為 ≤20 字標題
- 失敗 → 用首訊息前 20 字

### 7.3 分類標籤
- 系統自動標：`行銷文案` / `建站` / `詢價` / `下單` / `其他`
- 規則：依觸發的 tool call 或 LLM 分類
- UI：列表項旁小 tag

---

## 8. 引導下單整合（已實作的接點）

> 已實作部分不重做，本節僅標註新功能的整合點。

- AI 回應中觸發 `create_order` tool → 前端渲染 `OrderForm` 元件
- 用戶確認 → 呼叫 Order API → 回 `order_id`
- 對話訊息儲存：`role=tool, content={type:'order_form', data:{order_id}}`
- 後續可在對話中查詢該訂單狀態（透過 `lookup_order` tool）

---

## 9. API Endpoints

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/conversations` | 列表（分組） |
| POST | `/api/conversations` | 建立 |
| GET | `/api/conversations/:id` | 詳情 + messages |
| PATCH | `/api/conversations/:id` | 改標題、釘選 |
| DELETE | `/api/conversations/:id` | 刪除（軟刪） |
| POST | `/api/chat/messages` | 送訊息（SSE） |
| GET | `/api/usage/current` | 本月用量 |

---

## 10. 效能與限流

- 單一用戶並發對話：1 條（送出中時禁止再送）
- 訊息長度上限：50K characters
- 對話訊息數上限：500（超過自動切新對話並注入摘要）
- Rate limit：30 messages / min per user

---

## 11. 邊界 & 錯誤

| 情境 | 處理 |
|---|---|
| Flexion API 5xx | 重試 2 次，仍失敗 → 不扣 token、提示用戶 |
| 用戶斷網 | 客戶端 reconnect；訊息標記 `pending` |
| Token 中途用盡 | 在 stream 結束後扣足、彈出升級 modal |
| Tool call 失敗 | 訊息標 `tool_error`，AI 自動重試或致歉 |
| 對話超長 | 自動 summarize 舊訊息為 system message |

---

## 12. 開放問題
- Q1: 是否要支援「對話分享連結」（公開唯讀）？— v2
- Q2: Tool call 是否暴露原始參數給用戶看？— 預設摺疊
- Q3: 跨方案的模型可用性差異（Free 只能用 Haiku?）— 待 Billing spec 定
