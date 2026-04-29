# 07 — Spec: 雙端智能客服 (RAG)

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — User Portal 與 Admin Portal 雙端 RAG | Grace Wu |

---

## 1. 範圍

### In Scope
- 平台知識庫（手冊、FAQ、教學）向量化
- User Portal：個人化客服（限該用戶資料）
- Admin Portal：跨平台分析（含 PII 權限管控）
- 增量索引（內容更新自動 reindex）
- 引用來源 (citations)
- 工具呼叫（查訂單 / 用量 / 訂閱狀態）

### Out of Scope (v1)
- 跨用戶資料分析（風險高，留 Admin only）
- 語音客服
- 工單系統整合（Zendesk 等）

---

## 2. User Stories

### User Portal
| # | Story |
|---|---|
| U-1 | 「我的方案多少錢？什麼時候續訂？」 |
| U-2 | 「我上個月用了多少 token？」 |
| U-3 | 「Pro 跟 Starter 差在哪？」 |
| U-4 | 「我的訂單 #ORD-001 狀態？」 |
| U-5 | 「怎麼設定自訂網域？」 |

### Admin Portal
| # | Story |
|---|---|
| A-1 | 「最近 7 天有多少 past_due 訂閱？」 |
| A-2 | 「Pro 用戶平均月 GMV 多少？」 |
| A-3 | 「Token 用量 Top 10 用戶是誰？」 |
| A-4 | 「最近一週的客訴熱點是什麼？」 |

---

## 3. 知識來源

### 3.1 平台知識（共用）
| 來源 | 內容 | 更新頻率 |
|---|---|---|
| `/docs/help/` | 使用手冊（Markdown） | 即時 |
| FAQ DB | 結構化 FAQ | 每日 |
| 條款 / 政策 | Terms / Privacy | 變更時 |
| 教學影片字幕 | YouTube SRT | 每週 |
| 最新公告 | 站內公告 | 即時 |

### 3.2 用戶層（私有）
- 用戶的 chat 歷史摘要（非全文）
- 用戶的訂單、發票、訂閱
- 用戶的站台、商品、詢價

→ **嚴格 tenant isolation**：vector index 加 `user_id` 過濾，DB 加 RLS

### 3.3 Admin 層（聚合）
- 全平台統計（脫敏）
- 用戶行為事件（聚合）
- 系統 logs（最近 7 天）

---

## 4. 技術架構

```
[Source]
  ├─ Markdown Docs   ──┐
  ├─ FAQ DB          ──┤
  ├─ Chat Summaries  ──┤  ┌──────────────┐
  ├─ Orders / etc.   ──┼─>│  Embedder    │  (text-embedding-3-large)
  └─ Logs            ──┘  └──────┬───────┘
                                 ▼
                          ┌──────────────┐
                          │  pgvector    │
                          │  (per-tenant)│
                          └──────┬───────┘
                                 │
[Query] → [Hybrid Search] → [Rerank] → [LLM with citations]
            │       │
          BM25   Vector
```

### 4.1 Embedding
- 模型：`text-embedding-3-large` (3072d)（可選 BGE-M3 自架）
- Chunk：512 tokens, overlap 64
- Metadata：source、type、tenant_id、timestamp

### 4.2 索引策略
- pgvector ivfflat / hnsw 索引
- Per-tenant 過濾：`WHERE tenant_id = $1`
- 階層化：先過濾再向量

### 4.3 檢索
- Hybrid：BM25 + Vector cosine
- Rerank：Cohere Rerank-3 或自家 cross-encoder
- Top-K：10 → rerank → top 4

### 4.4 生成
- Flexion → Sonnet 4.6
- Prompt 注入 retrieved chunks + citations
- 強制要求引用來源（`[1]` `[2]`...）
- 不知道就說不知道（防幻覺）

---

## 5. RAG Tools

User Portal 客服可呼叫：

| Tool | 說明 |
|---|---|
| `query_kb` | 查平台知識庫 |
| `lookup_my_order(order_no)` | 查我的訂單 |
| `lookup_my_subscription` | 查我的訂閱 |
| `lookup_my_usage(period)` | 查我的用量 |
| `create_support_ticket` | 建立人工支援單 |

Admin Portal 客服：

| Tool | 說明 |
|---|---|
| `query_kb` | |
| `query_metrics(metric, period, group_by)` | 查聚合指標 |
| `query_user(user_id_or_email)` | 查單一用戶（需權限） |
| `query_logs(query, since)` | 查系統 logs |

---

## 6. 介面

### 6.1 User Portal
- 右下角 Floating Bubble
- 點開：聊天視窗，整合在 chat 介面風格
- 引用：訊息下方 chips 顯示來源（點擊跳轉）
- 「轉真人」按鈕（建立 ticket）

### 6.2 Admin Portal
- 側欄常駐 panel
- 支援自然語言查詢 + chart 渲染（v2）
- 「執行 SQL」(super_admin only) — 高風險功能

---

## 7. 資料模型

```typescript
KnowledgeDoc {
  id, source: 'manual'|'faq'|'announcement'|'auto'
  title, content, url?
  tenant_scope: 'global'|'user'|'admin'
  user_id?  // for tenant_scope='user'
  metadata: jsonb
  created_at, updated_at
  indexed_at
}

KnowledgeChunk {
  id, doc_id, chunk_index
  content
  embedding: vector(3072)
  tokens: int
}

SupportConversation {
  id, user_id, mode: 'ai'|'human'
  status: 'open'|'resolved'|'escalated'
  ...
}

SupportTicket {
  id, user_id, conversation_id
  category, priority, status
  assignee_admin_id
  created_at, resolved_at
}
```

---

## 8. 索引管線

### 8.1 觸發
- 文件新增 / 修改：DB trigger → enqueue
- 用戶 chat 結束：背景 job 摘要 → 寫入
- 每日定時：增量重建

### 8.2 Pipeline (BullMQ)
```
[Source Update]
  → [Extract & Chunk]
  → [Embed (batch 100)]
  → [Upsert pgvector]
  → [Mark indexed]
```

失敗：DLQ + 告警

---

## 9. API Endpoints

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/support/ask` | RAG 查詢（streaming） |
| POST | `/api/support/tickets` | 建立工單 |
| GET | `/api/support/tickets` | 我的工單 |
| POST | `/api/admin/support/ask` | (admin) 查詢 |
| GET | `/api/admin/kb/docs` | (admin) 知識文件管理 |
| POST | `/api/admin/kb/docs` | 新增 |
| POST | `/api/admin/kb/reindex` | 強制重建索引 |

---

## 10. 安全與隱私
- Tenant isolation：query 必帶 `user_id` filter，DB RLS 雙保險
- PII 不入 embedding 內容（替換成 placeholder）
- Admin 查單一用戶 → 寫 audit log
- 用戶可請求刪除其資料（含 vector index）

---

## 11. 評估與監控
- 離線評估：每月以 100 題標準集跑 Recall@K / nDCG
- 線上指標：用戶 thumbs-up rate、轉真人率、AHT
- 幻覺偵測：citation 必中規則 + 抽樣人工審

---

## 12. 邊界 & 錯誤
- 找不到相關 chunks → 直接說「找不到」並推送至人工
- LLM API 失敗 → fallback 顯示 FAQ 連結
- 用戶刪除帳號 → 24 小時內清除其 vectors

---

## 13. 開放問題
- Q1: Embedding 模型自架 vs OpenAI（成本 vs 隱私）
- Q2: 是否支援多語檢索（Phase 3 貿易需要）
- Q3: 真人客服整合 Slack? Lark? 自建後台?
