-- Extend legacy orders into AI project orders.
CREATE TYPE "ProjectOrderType" AS ENUM ('website', 'product_page', 'copywriting', 'design', 'project');
CREATE TYPE "ProjectCancelReason" AS ENUM ('user', 'quote_expired', 'admin');
CREATE TYPE "QuoteStatus" AS ENUM ('active', 'accepted', 'expired', 'superseded');
CREATE TYPE "PaymentKind" AS ENUM ('deposit', 'revision_quota', 'points_topup');
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'transfer', 'points', 'manual');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'refunded', 'partial_refund', 'failed');
CREATE TYPE "PointTxnReason" AS ENUM ('ai_usage', 'topup', 'buy_revision', 'refund');
CREATE TYPE "OrderMessageSenderRole" AS ENUM ('customer', 'reviewer', 'system');
CREATE TYPE "OrderMessageKind" AS ENUM ('message', 'progress_update', 'revision_request', 'system_event');
CREATE TYPE "MeetingStatus" AS ENUM ('requested', 'confirmed', 'done', 'cancelled');

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'quote_pending';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'quoted';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'in_execution';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "project_type" "ProjectOrderType",
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "requirements_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "deliverable_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "assigned_reviewer_id" UUID,
  ADD COLUMN IF NOT EXISTS "cancel_reason" "ProjectCancelReason",
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ProjectQuote" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "deposit_amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'TWD',
  "cancellation_terms" TEXT NOT NULL,
  "valid_days" INTEGER NOT NULL,
  "quoted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "status" "QuoteStatus" NOT NULL DEFAULT 'active',
  "quoted_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectQuote_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ProjectPayment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID,
  "customer_id" UUID NOT NULL,
  "kind" "PaymentKind" NOT NULL,
  "amount" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "refund_amount" INTEGER,
  "invoice_id" UUID,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectPayment_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProjectPayment_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PointWallet" (
  "customer_id" UUID NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointWallet_pkey" PRIMARY KEY ("customer_id"),
  CONSTRAINT "PointWallet_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PointTransaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
  "delta" INTEGER NOT NULL,
  "reason" "PointTxnReason" NOT NULL,
  "ref_order_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PointTransaction_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RevisionQuota" (
  "order_id" UUID NOT NULL,
  "total" INTEGER NOT NULL DEFAULT 0,
  "used" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionQuota_pkey" PRIMARY KEY ("order_id"),
  CONSTRAINT "RevisionQuota_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OrderMessage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "sender_role" "OrderMessageSenderRole" NOT NULL,
  "sender_id" UUID,
  "kind" "OrderMessageKind" NOT NULL DEFAULT 'message',
  "body" TEXT NOT NULL,
  "attachments" JSONB,
  "consumes_revision" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderMessage_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ReviewItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "checked" BOOLEAN NOT NULL DEFAULT false,
  "detail" TEXT,
  "result" JSONB,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReviewItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Meeting" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "duration_min" INTEGER NOT NULL,
  "status" "MeetingStatus" NOT NULL DEFAULT 'requested',
  "link_or_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Meeting_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Meeting_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OrderStatusHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "from_status" "OrderStatus",
  "to_status" "OrderStatus" NOT NULL,
  "actor_id" UUID,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderStatusHistory_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProjectQuote_order_id_status_idx" ON "ProjectQuote"("order_id", "status");
CREATE INDEX IF NOT EXISTS "ProjectQuote_status_expires_at_idx" ON "ProjectQuote"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "ProjectPayment_order_id_kind_idx" ON "ProjectPayment"("order_id", "kind");
CREATE INDEX IF NOT EXISTS "ProjectPayment_customer_id_created_at_idx" ON "ProjectPayment"("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "PointTransaction_customer_id_created_at_idx" ON "PointTransaction"("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "PointTransaction_ref_order_id_idx" ON "PointTransaction"("ref_order_id");
CREATE INDEX IF NOT EXISTS "OrderMessage_order_id_created_at_idx" ON "OrderMessage"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "ReviewItem_order_id_sort_order_idx" ON "ReviewItem"("order_id", "sort_order");
CREATE INDEX IF NOT EXISTS "Meeting_order_id_scheduled_at_idx" ON "Meeting"("order_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "Meeting_customer_id_scheduled_at_idx" ON "Meeting"("customer_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "OrderStatusHistory_order_id_created_at_idx" ON "OrderStatusHistory"("order_id", "created_at");
