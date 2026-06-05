-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('ai', 'generation_result', 'system');

-- CreateEnum
CREATE TYPE "DesignTaskStatus" AS ENUM ('active', 'paused', 'collecting', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "DesignTaskType" AS ENUM ('logo', 'vi', 'brand_guideline', 'business_card', 'dm', 'poster', 'catalog', 'menu', 'invitation_card', 'sticker', 'packaging', 'social_post', 'banner', 'edm', 'brand_website', 'landing_page', 'ecommerce_website', 'event_backdrop', 'x_banner', 'standing_sign', 'hand_held_sign', 'banner_cloth', 'outdoor_signboard', 'store_sign', 'merchandise', 'gift', 'illustration', 'design_modification', 'social_copy', 'seo_article', 'website_audit', 'annual_marketing_strategy', 'ads_strategy');

-- CreateEnum
CREATE TYPE "ExecutionStrategy" AS ENUM ('direct_image', 'structured_composition', 'structured_text', 'image_edit');

-- AlterTable
ALTER TABLE "Conversation"
ADD COLUMN "ai_model" TEXT,
ADD COLUMN "active_design_task_id" UUID,
ADD COLUMN "shared_brand_context" JSONB,
ADD COLUMN "project_memory" JSONB;

-- AlterTable
ALTER TABLE "Message"
ADD COLUMN "message_type" "MessageType" NOT NULL DEFAULT 'ai',
ADD COLUMN "metadata" JSONB,
ADD COLUMN "design_task_id" UUID;

-- CreateTable
CREATE TABLE "DesignTask" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_type" "DesignTaskType" NOT NULL,
    "template_key" TEXT NOT NULL,
    "template_label" TEXT,
    "execution_strategy" "ExecutionStrategy",
    "preferred_model" TEXT,
    "title" TEXT NOT NULL,
    "status" "DesignTaskStatus" NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "output_count" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT,
    "collected_data" JSONB,
    "resolved_requirements" JSONB,
    "missing_requirements" JSONB,
    "current_clarification_goal" JSONB,
    "clarification_count" INTEGER NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_design_task_id_created_at_idx" ON "Message"("design_task_id", "created_at");

-- CreateIndex
CREATE INDEX "DesignTask_conversation_id_last_activity_at_idx" ON "DesignTask"("conversation_id", "last_activity_at" DESC);

-- CreateIndex
CREATE INDEX "DesignTask_user_id_status_idx" ON "DesignTask"("user_id", "status");

-- CreateIndex
CREATE INDEX "DesignTask_task_type_status_idx" ON "DesignTask"("task_type", "status");

-- AddForeignKey
ALTER TABLE "DesignTask" ADD CONSTRAINT "DesignTask_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignTask" ADD CONSTRAINT "DesignTask_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_design_task_id_fkey" FOREIGN KEY ("design_task_id") REFERENCES "DesignTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
