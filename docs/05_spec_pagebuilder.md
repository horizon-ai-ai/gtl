# 05 — Spec: Puck Editor 網頁建置

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — Puck 整合、AI 生成、子網域發佈 | Grace Wu |

---

## 1. 範圍

### In Scope
- Puck Editor 整合（拖拉編輯）
- AI Chat 生成 Puck JSON schema
- 模板庫（落地頁、產品頁、活動頁）
- 子網域發佈：`{slug}.platform.com`
- 預覽 / 發佈版本管理
- 基礎 SEO（meta、OG）

### Out of Scope (v1)
- 自訂網域（v1.5）
- A/B Testing（v2）
- 表單收集 + 自動化（v2）
- 多語站台（v2）

---

## 2. User Stories

| # | As a | I want to | So that |
|---|---|---|---|
| US-1 | 用戶 | 在 chat 描述需求 → AI 生成站台草稿 | 快速啟動 |
| US-2 | 用戶 | 拖拉編輯 AI 生成的內容 | 微調到滿意 |
| US-3 | 用戶 | 預覽桌面 / 行動版 | 確認響應式 |
| US-4 | 用戶 | 一鍵發佈到子網域 | 立即上線 |
| US-5 | 用戶 | 看到發佈歷史並回滾 | 出錯能還原 |
| US-6 | Admin | 審核違規內容 | 維護平台合規 |

---

## 3. 整合架構

```
[Chat: 用戶描述需求]
       │
       ▼
[AI Tool: generate_page]
       │ 產生 PageSchema (Puck JSON)
       ▼
[Editor: Puck React Component]
       │ 用戶編輯
       ▼
[Save Draft → DB]
       │
       ▼
[Publish] → [CDN / Edge Function 渲染]
       │
       ▼
[https://{slug}.platform.com]
```

---

## 4. Puck 整合細節

### 4.1 元件庫
v1 提供約 20 個基礎元件：

| 類別 | 元件 |
|---|---|
| Layout | Container, Section, Grid, Spacer |
| Content | Heading, Paragraph, Image, Button, List |
| Marketing | Hero, FeatureGrid, Testimonial, CTA, Pricing, FAQ |
| Form | ContactForm, EmailSignup |
| Media | Video, Carousel |
| Embed | Iframe, MapEmbed |

### 4.2 元件結構
每個元件 export Puck Config：
```typescript
{
  fields: { ... },          // 編輯器右側面板
  defaultProps: { ... },
  render: ({ ...props }) => JSX
}
```

### 4.3 主題系統
- 全站 theme：色票（primary / secondary / accent）、字型、圓角
- 用戶可選預設主題或自訂

---

## 5. AI 生成

### 5.1 Tool: `generate_page`
```json
{
  "name": "generate_page",
  "parameters": {
    "purpose": "產品落地頁 / 活動頁 / 公司簡介 / ...",
    "industry": "...",
    "key_messages": ["..."],
    "cta": "...",
    "tone": "專業 / 活潑 / ...",
    "reference_url": "https://..."  // optional
  }
}
```

### 5.2 流程
1. AI 根據參數選擇模板骨架
2. 生成各元件的內容（heading、paragraph、CTA 文案）
3. 生成 Puck JSON schema
4. 前端載入 Puck Editor，將 schema 注入
5. 用戶編輯儲存

### 5.3 Prompt 策略
- System prompt 內含可用元件清單與 JSON schema
- Few-shot：3 組 (purpose → schema) 範例
- 輸出強制走 JSON mode

---

## 6. 資料模型

```typescript
Site {
  id, user_id
  slug: string (unique, lowercase, 3-30)
  name, description
  theme: jsonb
  status: 'draft' | 'published' | 'archived'
  created_at, updated_at
}

SiteVersion {
  id, site_id, version: int
  schema: jsonb  // Puck data
  published_at?, published_by
  created_at
}

SiteAnalytics {
  site_id, date, page_views, unique_visitors
}
```

---

## 7. 發佈與渲染

### 7.1 子網域路由
- DNS：`*.platform.com` → Vercel
- Next.js middleware 解析 hostname → 取得 site
- 渲染：`app/(public)/site/[slug]/page.tsx`，ISR 60s

### 7.2 SEO
- `<title>`、`<meta description>`、OG tags 從 `Site.metadata` 取
- Sitemap：`/sitemap.xml`
- robots.txt：可由用戶 toggle

### 7.3 效能
- Edge Runtime
- 靜態圖片走 next/image + CDN
- LCP 目標 < 1.5s

---

## 8. 限制與配額

| Plan | 站數 | 單頁元件數 | 月流量 | 自訂網域 |
|---|---|---|---|---|
| Free | 0 | - | - | ❌ |
| Starter | 1 | 50 | 10K PV | ❌ |
| Pro | 5 | 200 | 100K PV | ✅ |
| Enterprise | ∞ | ∞ | 議定 | ✅ |

超過月流量：超量按 NT$1 / 1K PV 收費（先警告再扣）

---

## 9. API Endpoints

| Method | Path | 說明 |
|---|---|---|
| GET | `/api/sites` | 列表 |
| POST | `/api/sites` | 建立 |
| GET | `/api/sites/:id` | 詳情（最新版） |
| PATCH | `/api/sites/:id` | 更新（draft） |
| POST | `/api/sites/:id/publish` | 發佈當前 draft |
| POST | `/api/sites/:id/rollback/:version` | 回滾 |
| GET | `/api/sites/:id/versions` | 版本歷史 |
| DELETE | `/api/sites/:id` | 封存 |
| GET | `/api/sites/check-slug?slug=xxx` | 檢查可用 |

---

## 10. UI 規格

### 10.1 站台列表
- 卡片式（縮圖 + 名稱 + 狀態 + 子網域）
- 動作：編輯、預覽、發佈、複製、封存

### 10.2 編輯器頁
- 左：元件庫 / 大綱
- 中：畫布（可切桌面/平板/手機）
- 右：屬性面板
- 上：頁面設定、儲存、預覽、發佈
- 「AI 助手」按鈕：開側邊 chat 直接修改頁面

### 10.3 AI 修改流程
- 用戶選中元件 → 點 AI → 描述「改成更活潑」
- AI 回傳新 props → diff 預覽 → 接受/拒絕

---

## 11. 內容審核
- 發佈時自動檢查：違禁字、版權圖片
- Admin 可下架站台
- 用戶被下架 3 次 → 帳號審核

---

## 12. 邊界 & 錯誤
- AI 生成的 schema 不合法 → 退回 chat 重生
- Slug 衝突 → 即時檢查 + 建議
- 同時編輯（多 tab）→ 樂觀鎖 + 衝突提示
- 站台月流量超過 → 顯示「服務暫停」頁

---

## 13. 開放問題
- Q1: 自訂網域驗證流程（DNS TXT? CNAME?）— v1.5 設計
- Q2: 是否提供 GA / Pixel 整合 — v2
- Q3: 模板市集（用戶可賣模板）— v3
