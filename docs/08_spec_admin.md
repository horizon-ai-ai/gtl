# 08 — Spec: Admin Portal

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — 用戶/訂單/內容/儀表板/系統設定 | Grace Wu |

---

## 1. 範圍

### In Scope
- 用戶管理（列表、詳情、停權、改方案）
- 訂單檢視（含 GMV 統計）
- 內容審核（站台、商品）
- 數據儀表板
- 系統設定（方案定價、公告）
- 智能客服（見 07）
- Audit log 查看

### Out of Scope (v1)
- 多階層管理員權限（v2）
- 客服工單分派系統（v2）
- 財報自動化（接會計系統）

---

## 2. 角色與權限

| 角色 | 權限 |
|---|---|
| `admin` | 用戶/訂單/內容檢視+操作；不可改定價/權限 |
| `super_admin` | All + 系統設定 + SQL 查詢 + 帳號權限分配 |

---

## 3. 模組

### 3.1 Dashboard（首頁）
**Cards：**
- DAU / WAU / MAU
- 本月新增用戶（個人 / 公司）
- MRR / ARR
- 本月 GMV（用戶端訂單）
- Token 月消耗 + Flexion 成本
- 客訴未解 / 待處理

**Charts：**
- 用戶成長趨勢（30 / 90 天）
- 訂閱方案分佈
- Token 消耗 by model
- 轉換漏斗（註冊→付費→續訂）

### 3.2 用戶管理
**列表欄位：**
- ID、Email、類型（個人/公司）、方案、註冊日、最後登入、狀態

**搜尋 / 篩選：**
- Email、統編、公司名、方案、狀態、註冊區間

**詳情頁 Tab：**
- 基本資訊（含公司資料）
- 訂閱與帳單歷史
- Token 用量曲線
- 對話列表（限時開放查看，需理由 → audit log）
- 訂單列表
- 站台列表
- 操作：停權、解凍、強制改方案、贈送 Token、刪除帳號

### 3.3 訂單管理
- 全平台訂單檢視（見 04 Admin 端）
- GMV 統計報表
- 異常訂單告警

### 3.4 內容審核
**站台審核：**
- 待審佇列（用戶舉報 / 自動觸發）
- 預覽 + 違規分類
- 動作：通過 / 下架 / 警告 / 封禁

**商品審核：**
- 同上，特別關注違禁品

### 3.5 訂閱與計費管理
- 訂閱列表（按狀態）
- past_due 處理介面
- 退款申請審核（接 03 退款流程）
- 發票補開 / 重發

### 3.6 知識庫管理
（見 07 Admin 端）

### 3.7 系統設定 (super_admin)
- **方案定價**：價格、額度、feature flags
- **公告**：站內公告 banner
- **Email 模板**：編輯
- **Feature flag 全域開關**
- **Maintenance mode**

### 3.8 Audit Log
- 所有 admin 動作紀錄
- 欄位：時間、admin、動作、目標、IP、UA、結果
- 不可刪除

---

## 4. 資料模型

```typescript
AdminAction {
  id, admin_id, action: string
  target_type: 'user'|'order'|'site'|'system'
  target_id: string
  reason: string?
  payload: jsonb
  ip, user_agent
  created_at
}

Announcement {
  id, title, body
  audience: 'all'|'plan:starter'|...
  starts_at, ends_at, active
}
```

---

## 5. API Endpoints（admin only）

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/admin/dashboard/summary` | 首頁卡片 |
| GET | `/api/admin/users` | 用戶列表 |
| GET | `/api/admin/users/:id` | 詳情 |
| POST | `/api/admin/users/:id/suspend` | 停權 |
| POST | `/api/admin/users/:id/unsuspend` | 解凍 |
| POST | `/api/admin/users/:id/grant-credits` | 贈送 Token |
| POST | `/api/admin/users/:id/change-plan` | 改方案 |
| DELETE | `/api/admin/users/:id` | 刪除 |
| GET | `/api/admin/orders` | 訂單列表 |
| GET | `/api/admin/sites/moderation` | 待審站台 |
| POST | `/api/admin/sites/:id/takedown` | 下架 |
| GET | `/api/admin/products/moderation` | 待審商品 |
| GET | `/api/admin/audit-logs` | Audit log |
| GET | `/api/admin/system/announcements` | 公告 |
| POST | `/api/admin/system/announcements` | 發佈公告 |
| GET/PATCH | `/api/admin/system/plans` | (super) 方案管理 |

---

## 6. UI 規格
- 獨立子網域：`admin.platform.com`
- 響應式但偏桌面（Admin 主要桌面用）
- 側欄主導覽
- 強制每次登入 MFA（v2，先用強密碼）
- Session timeout 30 分鐘無操作

---

## 7. 安全
- IP whitelist（內部辦公室 + VPN）
- 所有寫操作都 audit log
- 危險操作（刪除、降級）需二次確認
- super_admin SQL 查詢限唯讀 connection pool

---

## 8. 邊界 & 錯誤
- 同時操作同用戶 → 樂觀鎖
- 大量資料匯出 → background job + 寄連結
- 系統設定改錯 → 變更需 2 人確認（v2 工作流）

---

## 9. 開放問題
- Q1: Admin 是否需要看用戶 chat 內容？— 預設不可，需特批 + audit
- Q2: 退款金額大於 X 是否需要財務經理覆核？— 流程設計
- Q3: Audit log 保留期：建議 2 年（合規）
