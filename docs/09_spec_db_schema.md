# 09 — Spec: 資料庫 Schema 設計

**Status**: Draft
**Owner**: Grace Wu
**Last Updated**: 2026-04-30

---

## 版本紀錄

| 版本 | 日期 | 變更內容 | 作者 |
|---|---|---|---|
| v0.1 | 2026-04-30 | 初版 — Postgres 完整 schema (Prisma DSL) | Grace Wu |

---

## 1. 約定

- DB：PostgreSQL 15
- ORM：Prisma
- 主鍵：`uuid` (Postgres `gen_random_uuid()`)
- 時戳：`created_at`, `updated_at`（auto by Prisma）
- 軟刪：`deleted_at` (timestamp nullable)
- 命名：`snake_case` 表 / 欄位、`PascalCase` model
- 索引：高頻查詢欄位 + FK 自動加 index
- RLS：以 `user_id` 過濾所有 user-owned 表

---

## 2. ER 圖（簡）

```
User ─┬─ CompanyProfile
      ├─ OAuthAccount
      ├─ Session
      ├─ Subscription ── Plan
      ├─ Invoice
      ├─ TokenPack
      ├─ UserUsage
      ├─ Conversation ── Message
      ├─ Order ── OrderItem
      ├─ Site ── SiteVersion
      ├─ TradeProfile
      ├─ Product (as seller)
      ├─ Inquiry (as buyer)
      ├─ Inquiry (as seller)
      └─ KnowledgeDoc (user-scope)
```

---

## 3. Prisma Schema（核心）

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

// =====================
// AUTH
// =====================
model User {
  id              String    @id @default(uuid()) @db.Uuid
  email           String    @unique
  password_hash   String?
  type            UserType  @default(personal)
  status          UserStatus @default(active)
  role            UserRole  @default(user)
  email_verified_at DateTime?
  display_name    String?
  avatar_url      String?
  locale          String    @default("zh-TW")
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  deleted_at      DateTime?

  company         CompanyProfile?
  oauth_accounts  OAuthAccount[]
  sessions        Session[]
  subscription    Subscription?
  invoices        Invoice[]
  token_packs     TokenPack[]
  usages          UserUsage[]
  conversations   Conversation[]
  orders          Order[]
  sites           Site[]
  trade_profile   TradeProfile?
  products        Product[]   @relation("seller_products")
  inquiries_sent  Inquiry[]   @relation("buyer_inquiries")
  inquiries_recv  Inquiry[]   @relation("seller_inquiries")

  @@index([status, created_at])
}

enum UserType { personal company }
enum UserStatus { active suspended deleted }
enum UserRole { user admin super_admin }

model CompanyProfile {
  user_id         String   @id @db.Uuid
  user            User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  tax_id          String   @unique
  name            String
  address         String
  owner_name      String?
  business_items  String[] @default([])
  industry        String?
  employee_size   String?
  contact_name    String?
  contact_phone   String?
  verified        Boolean  @default(false)
  verified_source String?  // gcis / third_party / manual
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  @@index([tax_id])
}

model OAuthAccount {
  id               String  @id @default(uuid()) @db.Uuid
  user_id          String  @db.Uuid
  user             User    @relation(fields: [user_id], references: [id], onDelete: Cascade)
  provider         String  // google / line
  provider_user_id String
  access_token     String?
  refresh_token    String?
  expires_at       DateTime?
  created_at       DateTime @default(now())

  @@unique([provider, provider_user_id])
}

model Session {
  id                String   @id @default(uuid()) @db.Uuid
  user_id           String   @db.Uuid
  user              User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  refresh_token_hash String  @unique
  ip                String?
  user_agent        String?
  expires_at        DateTime
  revoked_at        DateTime?
  created_at        DateTime @default(now())

  @@index([user_id, revoked_at])
}

// =====================
// BILLING
// =====================
model Plan {
  id              String   @id @default(uuid()) @db.Uuid
  code            String   @unique  // free / starter / pro / enterprise
  name            String
  price_monthly   Int      // TWD cents
  monthly_credits BigInt
  features        Json
  active          Boolean  @default(true)
  sort_order      Int      @default(0)
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  subscriptions   Subscription[]
}

model Subscription {
  id                    String   @id @default(uuid()) @db.Uuid
  user_id               String   @unique @db.Uuid
  user                  User     @relation(fields: [user_id], references: [id])
  plan_id               String   @db.Uuid
  plan                  Plan     @relation(fields: [plan_id], references: [id])
  status                SubStatus @default(active)
  current_period_start  DateTime
  current_period_end    DateTime
  cancel_at_period_end  Boolean  @default(false)
  next_plan_id          String?  @db.Uuid
  ecpay_recurring_id    String?
  version               Int      @default(0)  // optimistic lock
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt

  @@index([status, current_period_end])
}

enum SubStatus { trial active past_due canceled }

model Invoice {
  id              String   @id @default(uuid()) @db.Uuid
  user_id         String   @db.Uuid
  user            User     @relation(fields: [user_id], references: [id])
  type            InvoiceType
  amount          Int      // TWD cents
  currency        String   @default("TWD")
  status          InvoiceStatus @default(pending)
  ecpay_trade_no  String?  @unique
  einvoice_number String?
  einvoice_status String?
  paid_at         DateTime?
  refunded_at     DateTime?
  metadata        Json?
  created_at      DateTime @default(now())

  @@index([user_id, created_at])
}

enum InvoiceType { subscription topup }
enum InvoiceStatus { pending paid failed refunded }

model TokenPack {
  id            String   @id @default(uuid()) @db.Uuid
  user_id       String   @db.Uuid
  user          User     @relation(fields: [user_id], references: [id])
  invoice_id    String?  @db.Uuid
  credits_total BigInt
  credits_used  BigInt   @default(0)
  expires_at    DateTime?
  created_at    DateTime @default(now())

  @@index([user_id, expires_at])
}

model UserUsage {
  user_id        String   @db.Uuid
  user           User     @relation(fields: [user_id], references: [id])
  period         String   // YYYY-MM
  plan_credits   BigInt
  topup_credits  BigInt   @default(0)
  used_credits   BigInt   @default(0)
  reset_at       DateTime
  updated_at     DateTime @updatedAt

  @@id([user_id, period])
}

// =====================
// CHAT
// =====================
model Conversation {
  id              String   @id @default(uuid()) @db.Uuid
  user_id         String   @db.Uuid
  user            User     @relation(fields: [user_id], references: [id])
  title           String   @default("新對話")
  category        String?  // 行銷文案 / 建站 / 詢價 / 下單 / 其他
  pinned          Boolean  @default(false)
  archived        Boolean  @default(false)
  last_message_at DateTime?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  deleted_at      DateTime?

  messages        Message[]

  @@index([user_id, last_message_at(sort: Desc)])
}

model Message {
  id              String   @id @default(uuid()) @db.Uuid
  conversation_id String   @db.Uuid
  conversation    Conversation @relation(fields: [conversation_id], references: [id], onDelete: Cascade)
  role            MessageRole
  content         Json     // text or structured
  tool_calls      Json?
  tokens_input    Int      @default(0)
  tokens_output   Int      @default(0)
  credits_used    BigInt   @default(0)
  model           String?
  created_at      DateTime @default(now())

  @@index([conversation_id, created_at])
}

enum MessageRole { user assistant tool system }

// =====================
// ORDER
// =====================
model Order {
  id              String   @id @default(uuid()) @db.Uuid
  user_id         String   @db.Uuid  // 平台用戶 (賣家)
  user            User     @relation(fields: [user_id], references: [id])
  order_no        String   @unique
  conversation_id String?  @db.Uuid
  status          OrderStatus @default(draft)
  customer        Json     // {name,email,phone,address,tax_id}
  subtotal        Int
  tax             Int      @default(0)
  shipping        Int      @default(0)
  total           Int
  currency        String   @default("TWD")
  notes           String?
  metadata        Json?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  deleted_at      DateTime?

  items           OrderItem[]
  events          OrderEvent[]

  @@index([user_id, created_at(sort: Desc)])
  @@index([status])
}

enum OrderStatus { draft pending paid shipped completed canceled refunded }

model OrderItem {
  id          String  @id @default(uuid()) @db.Uuid
  order_id    String  @db.Uuid
  order       Order   @relation(fields: [order_id], references: [id], onDelete: Cascade)
  name        String
  description String?
  sku         String?
  quantity    Int
  unit_price  Int
  total       Int
}

model OrderEvent {
  id         String   @id @default(uuid()) @db.Uuid
  order_id   String   @db.Uuid
  order      Order    @relation(fields: [order_id], references: [id], onDelete: Cascade)
  type       String
  data       Json?
  actor      String   // user / ai / admin
  created_at DateTime @default(now())
}

// =====================
// SITE / PAGE BUILDER
// =====================
model Site {
  id          String   @id @default(uuid()) @db.Uuid
  user_id     String   @db.Uuid
  user        User     @relation(fields: [user_id], references: [id])
  slug        String   @unique
  name        String
  description String?
  theme       Json?
  status      SiteStatus @default(draft)
  custom_domain String?
  current_version_id String? @db.Uuid
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?

  versions    SiteVersion[]
  analytics   SiteAnalytics[]

  @@index([user_id])
}

enum SiteStatus { draft published archived }

model SiteVersion {
  id           String   @id @default(uuid()) @db.Uuid
  site_id      String   @db.Uuid
  site         Site     @relation(fields: [site_id], references: [id], onDelete: Cascade)
  version      Int
  schema       Json     // Puck data
  published_at DateTime?
  published_by String?  @db.Uuid
  created_at   DateTime @default(now())

  @@unique([site_id, version])
}

model SiteAnalytics {
  site_id    String   @db.Uuid
  site       Site     @relation(fields: [site_id], references: [id], onDelete: Cascade)
  date       DateTime @db.Date
  page_views Int      @default(0)
  unique_visitors Int @default(0)

  @@id([site_id, date])
}

// =====================
// TRADE
// =====================
model TradeProfile {
  user_id          String   @id @db.Uuid
  user             User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  role             TradeRole
  description      String?
  product_categories String[] @default([])
  target_markets   String[] @default([])
  budget_range     String?
  capacity         String?
  verified         Boolean  @default(false)
  created_at       DateTime @default(now())
  updated_at       DateTime @updatedAt
}

// 產品規則已調整為僅允許 seller 身份申請；
// buyer 為所有登入用戶的預設能力，保留 TradeRole 僅為說明 seller profile 欄位用途。
enum TradeRole { seller }

model Product {
  id              String   @id @default(uuid()) @db.Uuid
  seller_id       String   @db.Uuid
  seller          User     @relation("seller_products", fields: [seller_id], references: [id])
  name            String
  description     String?
  hs_code         String?
  category        String?
  images          String[]
  specs           Json?
  moq             Int      @default(1)
  unit            String   @default("pcs")
  price_min       Int?
  price_max       Int?
  currency        String   @default("USD")
  origin_country  String?
  certifications  String[] @default([])
  lead_time_days  Int?
  status          ProductStatus @default(draft)
  search_vector   Unsupported("tsvector")?
  embedding       Unsupported("vector(3072)")?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  deleted_at      DateTime?

  inquiries       Inquiry[]

  @@index([seller_id, status])
  @@index([category, status])
  @@index([hs_code])
}

enum ProductStatus { draft published paused }

model Inquiry {
  id                    String   @id @default(uuid()) @db.Uuid
  buyer_id              String   @db.Uuid
  buyer                 User     @relation("buyer_inquiries", fields: [buyer_id], references: [id])
  seller_id             String   @db.Uuid
  seller                User     @relation("seller_inquiries", fields: [seller_id], references: [id])
  product_id            String   @db.Uuid
  product               Product  @relation(fields: [product_id], references: [id])
  quantity              Int
  target_price          Int?
  delivery_terms        String?
  port_of_destination   String?
  payment_terms         String?
  notes                 String?
  status                InquiryStatus @default(sent)
  quotation_pdf_url     String?
  expires_at            DateTime
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt

  @@index([buyer_id, created_at(sort: Desc)])
  @@index([seller_id, created_at(sort: Desc)])
}

enum InquiryStatus { sent replied closed expired }

// =====================
// RAG / KNOWLEDGE
// =====================
model KnowledgeDoc {
  id            String   @id @default(uuid()) @db.Uuid
  source        String   // manual / faq / announcement / auto
  tenant_scope  String   // global / user / admin
  user_id       String?  @db.Uuid
  title         String
  content       String
  url           String?
  metadata      Json?
  indexed_at    DateTime?
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  chunks        KnowledgeChunk[]

  @@index([tenant_scope, user_id])
}

model KnowledgeChunk {
  id          String   @id @default(uuid()) @db.Uuid
  doc_id      String   @db.Uuid
  doc         KnowledgeDoc @relation(fields: [doc_id], references: [id], onDelete: Cascade)
  chunk_index Int
  content     String
  embedding   Unsupported("vector(3072)")?
  tokens      Int
  created_at  DateTime @default(now())

  @@unique([doc_id, chunk_index])
}

// =====================
// SUPPORT
// =====================
model SupportConversation {
  id         String   @id @default(uuid()) @db.Uuid
  user_id    String   @db.Uuid
  mode       String   @default("ai") // ai / human
  status     String   @default("open")
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
}

model SupportTicket {
  id              String   @id @default(uuid()) @db.Uuid
  user_id         String   @db.Uuid
  conversation_id String?  @db.Uuid
  category        String
  priority        String   @default("normal")
  status          String   @default("open")
  subject         String
  body            String
  assignee_admin_id String? @db.Uuid
  resolved_at     DateTime?
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt

  @@index([status, priority, created_at])
}

// =====================
// ADMIN
// =====================
model AdminAction {
  id           String   @id @default(uuid()) @db.Uuid
  admin_id     String   @db.Uuid
  action       String
  target_type  String
  target_id    String
  reason       String?
  payload      Json?
  ip           String?
  user_agent   String?
  created_at   DateTime @default(now())

  @@index([admin_id, created_at(sort: Desc)])
  @@index([target_type, target_id])
}

model Announcement {
  id         String   @id @default(uuid()) @db.Uuid
  title      String
  body       String
  audience   String   @default("all")
  starts_at  DateTime
  ends_at    DateTime?
  active     Boolean  @default(true)
  created_at DateTime @default(now())
}
```

---

## 4. 索引策略

| 表 | 額外索引 | 說明 |
|---|---|---|
| `messages` | `(conversation_id, created_at)` | 對話拉訊息 |
| `orders` | `(user_id, created_at desc)` | 訂單列表 |
| `products` | tsvector GIN + ivfflat on embedding | 全文+向量 |
| `inquiries` | `(seller_id)` `(buyer_id)` | 雙向查詢 |
| `knowledge_chunks` | hnsw on embedding (m=16) | 向量檢索 |
| `subscriptions` | `(status, current_period_end)` | 續訂掃描 |

---

## 5. RLS（Row-Level Security）

啟用於所有 user-owned 表，policy：
```sql
CREATE POLICY user_owns_data ON conversations
  USING (user_id = current_setting('app.user_id')::uuid);
```
`super_admin` bypass：`pg_role` 為 `app_admin` 時跳過。

---

## 6. 遷移與 Seed

- 用 Prisma Migrate
- 初始 seed：4 個 Plans、HS Code 類別樹、預設知識文件
- Migration 命名：`YYYYMMDDHHMM_description`

---

## 7. 備份
- Supabase 自動每日 + PITR
- 每月手動 logical dump 到 S3 cold storage

---

## 8. 開放問題
- Q1: 對話訊息量大（百萬級）→ 是否分表（partition by month）— v2 評估
- Q2: pgvector 3072 維度成本，是否降到 1536（OpenAI small）
- Q3: Audit log 是否寫獨立 DB / 寫入 Logstash — v2
