CREATE TABLE IF NOT EXISTS "AiModelSetting" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "label" text NOT NULL,
  "model_id" text NOT NULL,
  "purpose" text NOT NULL DEFAULT 'conversation',
  "provider" text NOT NULL DEFAULT 'openai-compatible',
  "base_url" text NOT NULL,
  "api_key_ciphertext" text NOT NULL,
  "api_key_hint" text,
  "credit_multiplier" integer NOT NULL DEFAULT 5,
  "active" boolean NOT NULL DEFAULT true,
  "is_default" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "notes" text,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiModelSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiModelSetting_active_sort_order_idx" ON "AiModelSetting"("active", "sort_order");
CREATE INDEX IF NOT EXISTS "AiModelSetting_purpose_active_sort_order_idx" ON "AiModelSetting"("purpose", "active", "sort_order");
CREATE INDEX IF NOT EXISTS "AiModelSetting_is_default_idx" ON "AiModelSetting"("is_default");
