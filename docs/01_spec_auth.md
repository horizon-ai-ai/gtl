# 01 — Spec: Auth & 帳號系統

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — 個人/公司註冊、統編帶資訊、登入流程 | Grace Wu |

---

## 1. 範圍

### In Scope
- 個人註冊 / 登入
- 公司註冊（統編自動帶公司資訊）
- 密碼重設、Email 驗證
- 第三方登入：Google、LINE
- Session 管理、JWT
- 角色：`user` / `admin` / `super_admin`

### Out of Scope (v1)
- SSO (SAML/OIDC) for Enterprise
- 多因素認證 (MFA) — Phase 2
- 帳號合併（個人 → 公司）

---

## 2. User Stories

| # | As a | I want to | So that |
|---|---|---|---|
| US-1 | 個人 | 用 email 或 Google 註冊 | 快速開始試用 |
| US-2 | 公司窗口 | 填統編就帶出公司資訊 | 不用手動輸入 |
| US-3 | 用戶 | 重設密碼 | 忘記密碼時能找回 |
| US-4 | 用戶 | 切換登入裝置 | 在不同電腦 / 手機使用 |
| US-5 | Admin | 停權違規帳號 | 維持平台秩序 |

---

## 3. 註冊流程

### 3.1 個人註冊
```
[註冊頁] → 選擇「個人」
  → 輸入 Email + 密碼 + 暱稱
  → 寄送驗證信 (Resend)
  → 點擊驗證連結
  → 啟用帳號 → 自動登入 → 進入 Onboarding
```

**欄位驗證：**
- Email：RFC 5322 + 不允許 disposable domains
- 密碼：≥8 字、含大小寫+數字
- 暱稱：2–30 字、不含特殊符號

### 3.2 公司註冊
```
[註冊頁] → 選擇「公司」
  → 輸入統編 (8 碼)
  → 系統呼叫統編 API → 帶出：
       公司名、登記地址、負責人、營業項目、設立日期
  → 用戶補填：聯絡人姓名、聯絡電話、產業類別、員工規模
  → 輸入 Email + 密碼
  → 寄送驗證信
  → 啟用 → 進入 Onboarding（公司版）
```

**統編驗證邏輯：**
1. 格式：8 碼數字 + 校驗碼演算法
2. 呼叫 **財政部營業登記資料公示系統 API**
   - Endpoint: `https://data.gcis.nat.gov.tw/od/data/api/...`
   - 失敗 fallback：第三方（如 Twincn / g0v）
   - 雙失敗：允許用戶手動填寫，標記 `verified=false`，由 Admin 後台審核

### 3.3 第三方登入
- **Google OAuth 2.0**
- **LINE Login v2.1**
- 首次登入：自動建立 `user` record，帳號類型預設 `personal`，可後續升級為 `company`

---

## 4. 登入流程

### 4.1 一般登入
```
Email + 密碼 → 驗證 → 簽發 JWT (access 15min) + Refresh Token (30d)
  → 寫入 httpOnly Cookie
```

### 4.2 失敗處理
- 連續 5 次失敗 → 鎖定帳號 15 分鐘
- 鎖定期間發送告警 email
- 異常 IP 登入 → 寄送通知信

### 4.3 Session 管理
- Refresh Token 存 DB（可主動撤銷）
- 用戶可在「設定 → 登入裝置」查看並登出
- 變更密碼 → 自動撤銷所有其他裝置 session

---

## 5. 密碼管理

### 5.1 重設流程
```
[忘記密碼] → 輸入 Email
  → 寄送一次性連結 (token 1hr 有效)
  → 點擊 → 設定新密碼
  → 撤銷所有 session
```

### 5.2 密碼存儲
- bcrypt cost = 12
- 不允許前 5 次歷史密碼重複

---

## 6. 角色與權限 (RBAC)

| 角色 | 描述 | 權限 |
|---|---|---|
| `user` | 一般用戶 | 自己的 chat / 訂單 / 站台 |
| `admin` | 平台運營 | Admin Portal 大部分功能 |
| `super_admin` | 超管 | 含定價、權限分配、危險操作 |

權限檢查：middleware 層 + DB 層 RLS（Row-Level Security）雙保險。

---

## 7. 資料模型（簡化版，完整見 `09_spec_db_schema.md`）

```typescript
User {
  id: string (uuid)
  email: string (unique)
  password_hash: string?
  type: 'personal' | 'company'
  email_verified_at: datetime?
  status: 'active' | 'suspended' | 'deleted'
  role: 'user' | 'admin' | 'super_admin'
  created_at, updated_at
}

CompanyProfile {
  user_id: string (FK, unique)
  tax_id: string (8 碼, indexed)
  name: string
  address: string
  owner_name: string
  business_items: string[]
  industry: string
  employee_size: enum
  contact_name: string
  contact_phone: string
  verified: boolean
  verified_source: 'gcis' | 'third_party' | 'manual'
}

OAuthAccount {
  user_id, provider, provider_user_id, ...
}

Session {
  id, user_id, refresh_token_hash, ip, user_agent, expires_at
}
```

---

## 8. API Endpoints

| Method | Path | 說明 |
|---|---|---|
| POST | `/api/auth/register` | 註冊（personal/company） |
| GET | `/api/auth/lookup-tax-id?id=xxx` | 統編查詢 |
| POST | `/api/auth/login` | 登入 |
| POST | `/api/auth/logout` | 登出 |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/auth/forgot-password` | 發送重設信 |
| POST | `/api/auth/reset-password` | 重設密碼 |
| GET | `/api/auth/verify-email?token=xxx` | Email 驗證 |
| GET | `/api/auth/me` | 取得當前用戶 |
| GET | `/api/auth/sessions` | 列出所有裝置 |
| DELETE | `/api/auth/sessions/:id` | 撤銷指定 session |
| GET/POST | `/api/auth/oauth/[provider]` | OAuth callback |

---

## 9. UI 規格

### 9.1 註冊頁
- 切換 tab：個人 / 公司
- 公司：統編欄位 → 即時 debounced 查詢（500ms）→ 帶出資訊（不可編輯但顯示）
- 載入狀態、錯誤提示、密碼強度條

### 9.2 登入頁
- Email + 密碼
- 「使用 Google 登入」「使用 LINE 登入」
- 「忘記密碼」連結

### 9.3 Onboarding
- 個人：3 步（產業 / 興趣 / 目標）
- 公司：4 步（產業 / 規模 / 行銷預算 / 主要目標）
- 完成 → 進入 Chat 介面

---

## 10. 邊界案例 & 錯誤處理

| 情境 | 處理 |
|---|---|
| 統編格式錯誤 | 前端即時驗證、紅字提示 |
| 統編 API 超時 (>5s) | 切換 fallback；雙失敗 → 允許手動填 |
| Email 已存在 | 提示「請改用登入」，提供登入連結 |
| OAuth Email 與既有帳號衝突 | 引導合併流程（v1：拒絕並提示用戶） |
| 統編所屬公司已有帳號 | 提示「該公司已註冊」，引導申請加入該公司（v2 功能） |

---

## 11. 安全性檢查清單
- [ ] CSRF token 保護（NextAuth 內建）
- [ ] httpOnly + Secure + SameSite=Lax cookie
- [ ] 密碼欄位前端不快取
- [ ] Rate limit：註冊 5/hr、登入 10/min、忘記密碼 3/hr
- [ ] 統編查詢結果不直接信任，二次驗證
- [ ] OAuth state token 防 CSRF

---

## 12. 開放問題
- Q1: 公司註冊是否需要審核？v1 自動通過 vs 人工審核
- Q2: 統編 API 走後端 proxy or 前端直呼？（建議後端，避免暴露 API key）
- Q3: 同一統編多人申請註冊（一個公司多員工）— v1 暫時拒絕，需 v2 設計組織架構
