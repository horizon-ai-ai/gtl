import {
  DesignTaskStatus,
  DesignTaskType,
  ExecutionStrategy,
  Prisma,
  type Conversation,
  type DesignTask,
  type Message,
} from "@prisma/client";

import { ApiError } from "@/lib/api";
import { resolveRequestedModelConfig } from "@/lib/ai-model-settings";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getSchemaByTemplateKey,
  resolveDefaultExecutionStrategy,
  type ExecutionStrategy as SchemaExecutionStrategy,
} from "@/lib/conversation/schema-registry";
import { cleanTaskSummary } from "@/lib/project-brief";

export type SessionUser = {
  id: string;
  role: "user" | "admin" | "super_admin";
  type: "personal" | "company";
};

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new ApiError("UNAUTHORIZED", "Not signed in");
  return session.user;
}

export async function getOwnedConversation(
  conversationId: string,
  userId: string,
): Promise<Conversation> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, user_id: userId, deleted_at: null },
  });
  if (!conversation) {
    throw new ApiError("RESOURCE_NOT_FOUND", "Conversation not found");
  }
  return conversation;
}

export function parseDesignTaskType(value: unknown): DesignTaskType | null {
  if (typeof value !== "string") return null;
  return Object.values(DesignTaskType).includes(value as DesignTaskType)
    ? (value as DesignTaskType)
    : null;
}

export function parseDesignTaskStatus(value: unknown): DesignTaskStatus | null {
  if (typeof value !== "string") return null;
  return Object.values(DesignTaskStatus).includes(value as DesignTaskStatus)
    ? (value as DesignTaskStatus)
    : null;
}

export function parseExecutionStrategy(value: unknown): ExecutionStrategy | null {
  if (typeof value !== "string") return null;
  return Object.values(ExecutionStrategy).includes(value as ExecutionStrategy)
    ? (value as ExecutionStrategy)
    : null;
}

export async function resolveRequestedModelForProvider(plan: string, requestedModel?: string | null) {
  return resolveRequestedModelConfig(plan, requestedModel);
}

const taskTitleByType: Record<DesignTaskType, string> = {
  logo: "Logo Design",
  vi: "Brand VI",
  brand_guideline: "Brand Guideline",
  business_card: "Business Card Design",
  dm: "DM Design",
  poster: "Poster Design",
  catalog: "Catalog Design",
  menu: "Menu Design",
  invitation_card: "Invitation Card Design",
  sticker: "Sticker Design",
  packaging: "Packaging Design",
  social_post: "Social Post Design",
  banner: "Banner Design",
  edm: "EDM Design",
  brand_website: "Brand Website Design",
  landing_page: "Landing Page Design",
  ecommerce_website: "Ecommerce Website Design",
  event_backdrop: "Event Backdrop Design",
  x_banner: "X Banner Design",
  standing_sign: "Standing Sign Design",
  hand_held_sign: "Hand Held Sign Design",
  banner_cloth: "Banner Cloth Design",
  outdoor_signboard: "Outdoor Signboard Design",
  store_sign: "Store Sign Design",
  merchandise: "Merchandise Design",
  gift: "Gift Design",
  illustration: "Illustration",
  design_modification: "Design Modification",
  social_copy: "Social Copywriting",
  seo_article: "SEO Article",
  website_audit: "Website Audit",
  annual_marketing_strategy: "Annual Marketing Strategy",
  ads_strategy: "Ads Strategy",
};

export function getTaskTitle(taskType: DesignTaskType, requestedTitle?: unknown) {
  if (typeof requestedTitle === "string" && requestedTitle.trim()) {
    return requestedTitle.trim();
  }
  return taskTitleByType[taskType];
}

export function toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

export function shapeDesignTask(task: DesignTask) {
  return {
    id: task.id,
    conversationId: task.conversation_id,
    userId: task.user_id,
    taskType: task.task_type,
    templateKey: task.template_key,
    templateLabel: task.template_label,
    executionStrategy: task.execution_strategy,
    preferredModel: task.preferred_model,
    title: task.title,
    status: task.status,
    priority: task.priority,
    outputCount: task.output_count,
    summary: cleanTaskSummary(task.summary) || null,
    collectedData: task.collected_data,
    resolvedRequirements: task.resolved_requirements,
    missingRequirements: task.missing_requirements,
    currentClarificationGoal: task.current_clarification_goal,
    clarificationCount: task.clarification_count,
    lastActivityAt: task.last_activity_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

export function shapeMessage(message: Message) {
  const content = message.content as unknown;
  const metadata = message.metadata && typeof message.metadata === "object"
    ? (message.metadata as Record<string, unknown>)
    : {};
  const attachments = Array.isArray(metadata.attachments)
    ? metadata.attachments
    : [];
  const normalizedContent =
    content &&
    typeof content === "object" &&
    "type" in (content as Record<string, unknown>) &&
    (content as Record<string, unknown>).type === "text" &&
    typeof (content as Record<string, unknown>).text === "string"
      ? ((content as Record<string, unknown>).text as string)
      : content;

  return {
    id: message.id,
    conversation: message.conversation_id,
    conversationId: message.conversation_id,
    role: message.role,
    messageType: message.message_type,
    content: normalizedContent,
    attachments,
    toolCalls: message.tool_calls,
    metadata: message.metadata,
    marketingIntelligence:
      "marketingIntelligence" in metadata
        ? metadata.marketingIntelligence
        : null,
    stepDecision:
      "stepDecision" in metadata
        ? metadata.stepDecision
        : null,
    designTaskId: message.design_task_id,
    tokensInput: message.tokens_input,
    tokensOutput: message.tokens_output,
    creditsUsed: Number(message.credits_used),
    model: message.model,
    createdAt: message.created_at,
  };
}

export async function activateDesignTask(conversationId: string, taskId: string) {
  await prisma.$transaction([
    prisma.designTask.updateMany({
      where: {
        conversation_id: conversationId,
        id: { not: taskId },
        status: { in: [DesignTaskStatus.active, DesignTaskStatus.collecting] },
      },
      data: { status: DesignTaskStatus.paused },
    }),
    prisma.designTask.update({
      where: { id: taskId },
      data: {
        status: DesignTaskStatus.active,
        last_activity_at: new Date(),
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { active_design_task_id: taskId },
    }),
  ]);
}

export async function resolveTaskCreateInput(body: Record<string, unknown>) {
  const requestedTemplateKey =
    typeof body.templateKey === "string" && body.templateKey.trim()
      ? body.templateKey.trim()
      : null;
  const templateSchema = requestedTemplateKey
    ? await getSchemaByTemplateKey(requestedTemplateKey)
    : null;
  const requestedTaskType = parseDesignTaskType(body.taskType);
  const taskType = templateSchema?.taskType || requestedTaskType;

  if (!taskType) {
    throw new ApiError("VALIDATION_ERROR", "Valid taskType or templateKey is required");
  }

  const executionStrategy =
    parseExecutionStrategy(body.executionStrategy) ||
    (templateSchema?.executionStrategy as SchemaExecutionStrategy | undefined) ||
    resolveDefaultExecutionStrategy(taskType);

  return {
    taskType,
    templateKey: requestedTemplateKey || templateSchema?.templateKey || taskType,
    templateLabel: templateSchema?.displayName,
    executionStrategy: executionStrategy as ExecutionStrategy,
  };
}
