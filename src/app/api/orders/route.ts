import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import type { DesignTask, Message, Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";
import { writeOrderStatusHistory } from "@/lib/project-orders";
import { cleanTaskSummary, customerInputsText, isDeliveryStatusSummary, valueToRecord } from "@/lib/project-brief";
import { generateOrderNo } from "@/lib/utils";

const itemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  sku: z.string().optional(),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().nonnegative(),
});

const createSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  submit: z.boolean().optional(),
  project_type: z.enum(["website", "product_page", "copywriting", "design", "project"]).optional(),
  title: z.string().max(200).optional(),
  requirements_summary: z.string().max(8000).optional(),
  deliverable_snapshot: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "pending", "quote_pending"]).default("pending"),
  customer: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    tax_id: z.string().optional(),
  }).optional(),
  items: z.array(itemSchema).default([]),
  shipping: z.number().int().nonnegative().default(0),
  tax: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function inputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function messageContentText(content: Prisma.JsonValue) {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const text = stringValue((content as Record<string, unknown>).text);
    if (text) return text;
  }
  return JSON.stringify(content);
}

function summarizeJsonBlock(label: string, value: unknown) {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text || text === "{}" || text === "[]") return null;
  return `${label}：\n${text.slice(0, 1800)}`;
}

function sanitizeProjectSnapshot(value: Record<string, unknown>) {
  const snapshot = { ...value };
  const taskSnapshot = valueToRecord(snapshot.taskSnapshot);
  if (Object.keys(taskSnapshot).length > 0 && isDeliveryStatusSummary(taskSnapshot.summary)) {
    snapshot.taskSnapshot = { ...taskSnapshot, summary: null };
  }

  const alignment = valueToRecord(snapshot.alignment);
  const designTask = valueToRecord(alignment.designTask);
  if (Object.keys(designTask).length > 0 && isDeliveryStatusSummary(designTask.summary)) {
    snapshot.alignment = {
      ...alignment,
      designTask: { ...designTask, summary: null },
    };
  }

  return snapshot;
}

function revisionNumberFromMetadata(value: unknown) {
  const revision = valueToRecord(recordValue(value).project_revision);
  const version = revision.version;
  return typeof version === "number" && Number.isFinite(version) ? version : 1;
}

function revisionFamilyFromMetadata(value: unknown) {
  const revision = valueToRecord(recordValue(value).project_revision);
  return stringValue(revision.familyId) || stringValue(revision.family_id);
}

function metadataSourceTaskId(value: unknown) {
  const metadata = recordValue(value);
  return stringValue(metadata.source_task_id) || stringValue(metadata.task_id);
}

function metadataSourceMessageId(value: unknown) {
  const metadata = recordValue(value);
  return stringValue(metadata.source_message_id) || stringValue(metadata.sourceMessageId);
}

function projectOrderCanBeSuperseded(status: string) {
  return status === "draft" || status === "quote_pending" || status === "quoted";
}

async function resolveProjectOrderRevision(params: {
  userId: string;
  orderId: string;
  conversationId?: string;
  projectType?: string;
  sourceTaskId?: string;
  sourceMessageId?: string;
}) {
  if (!params.conversationId || !params.projectType) {
    return {
      duplicateOrderId: null,
      previousOrderId: null,
      previousStatus: null,
      familyId: params.orderId,
      version: 1,
      shouldSupersedePrevious: false,
      relation: "initial",
    };
  }

  const candidates = await prisma.order.findMany({
    where: {
      user_id: params.userId,
      conversation_id: params.conversationId,
      project_type: params.projectType as never,
      deleted_at: null,
    },
    orderBy: { created_at: "desc" },
    take: 30,
    include: { quotes: true },
  });

  const scoped = candidates.filter((order) => {
    const metadata = recordValue(order.metadata);
    const orderTaskId = metadataSourceTaskId(metadata);
    if (params.sourceTaskId && orderTaskId && orderTaskId !== params.sourceTaskId) return false;
    return true;
  });

  if (params.sourceMessageId) {
    const duplicate = scoped.find((order) =>
      metadataSourceMessageId(order.metadata) === params.sourceMessageId &&
      order.status !== "cancelled" &&
      order.status !== "canceled"
    );
    if (duplicate) {
      return {
        duplicateOrderId: duplicate.id,
        previousOrderId: duplicate.id,
        previousStatus: duplicate.status,
        familyId: revisionFamilyFromMetadata(duplicate.metadata) || duplicate.id,
        version: revisionNumberFromMetadata(duplicate.metadata),
        shouldSupersedePrevious: false,
        relation: "duplicate_snapshot",
      };
    }
  }

  const previous = scoped[0] ?? null;
  if (!previous) {
    return {
      duplicateOrderId: null,
      previousOrderId: null,
      previousStatus: null,
      familyId: params.orderId,
      version: 1,
      shouldSupersedePrevious: false,
      relation: "initial",
    };
  }

  const previousFamilyId = revisionFamilyFromMetadata(previous.metadata) || previous.id;
  const previousVersion = Math.max(1, ...scoped.map((order) => revisionNumberFromMetadata(order.metadata)));
  const canSupersede = projectOrderCanBeSuperseded(previous.status);

  return {
    duplicateOrderId: null,
    previousOrderId: previous.id,
    previousStatus: previous.status,
    familyId: previousFamilyId,
    version: previousVersion + 1,
    shouldSupersedePrevious: canSupersede,
    relation: canSupersede ? "supersedes_unconfirmed_order" : "new_scope_after_confirmed_order",
  };
}

function buildProjectRequirementSummary(params: {
  fallback?: string;
  task?: DesignTask | null;
  deliverableSnapshot: Record<string, unknown>;
}) {
  const fallback = cleanTaskSummary(params.fallback);
  if (fallback) return fallback;
  const taskSummary = cleanTaskSummary(params.task?.summary);
  const customerInputs = customerInputsText(params.task?.collected_data);
  const blocks = [
    params.task?.title ? `任務：${params.task.title}` : null,
    params.task?.task_type ? `類型：${params.task.task_type}` : null,
    taskSummary ? `目前對齊摘要：${taskSummary}` : null,
    customerInputs ? `客戶原話與需求紀錄：\n${customerInputs}` : null,
    summarizeJsonBlock("已收集資料", params.task?.collected_data),
    summarizeJsonBlock("已確認需求", params.task?.resolved_requirements),
    summarizeJsonBlock("仍缺資料", params.task?.missing_requirements),
    summarizeJsonBlock("生成結果", params.deliverableSnapshot),
  ].filter((item): item is string => Boolean(item));
  return blocks.join("\n\n") || "請後台依目前對話、任務資料與生成結果進行報價。";
}

async function buildProjectAlignmentSnapshot(params: {
  userId: string;
  conversationId?: string;
  sourceTaskId?: string;
}) {
  if (!params.conversationId) return null;
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.conversationId, user_id: params.userId, deleted_at: null },
    select: {
      id: true,
      title: true,
      active_design_task_id: true,
      shared_brand_context: true,
      project_memory: true,
    },
  });
  if (!conversation) return null;

  let task: DesignTask | null = null;
  if (params.sourceTaskId) {
    task = await prisma.designTask.findFirst({
      where: {
        id: params.sourceTaskId,
        conversation_id: conversation.id,
        user_id: params.userId,
      },
    });
  }
  if (!task && conversation.active_design_task_id) {
    task = await prisma.designTask.findFirst({
      where: {
        id: conversation.active_design_task_id,
        conversation_id: conversation.id,
        user_id: params.userId,
      },
    });
  }

  const recentMessages = await prisma.message.findMany({
    where: {
      conversation_id: conversation.id,
      ...(task
        ? {
            OR: [
              { design_task_id: task.id },
              { role: "user" },
            ],
          }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take: 12,
    select: {
      id: true,
      role: true,
      message_type: true,
      content: true,
      metadata: true,
      design_task_id: true,
      created_at: true,
    },
  });

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      activeDesignTaskId: conversation.active_design_task_id,
      sharedBrandContext: conversation.shared_brand_context,
      projectMemory: conversation.project_memory,
    },
    designTask: task
      ? {
          id: task.id,
          taskType: task.task_type,
          templateKey: task.template_key,
          templateLabel: task.template_label,
          title: task.title,
          status: task.status,
          summary: cleanTaskSummary(task.summary) || null,
          collectedData: task.collected_data,
          resolvedRequirements: task.resolved_requirements,
          missingRequirements: task.missing_requirements,
          currentClarificationGoal: task.current_clarification_goal,
          clarificationCount: task.clarification_count,
          lastActivityAt: task.last_activity_at,
        }
      : null,
    recentDialogue: recentMessages.reverse().map((message: Pick<Message, "id" | "role" | "message_type" | "content" | "metadata" | "design_task_id" | "created_at">) => ({
      id: message.id,
      role: message.role,
      messageType: message.message_type,
      designTaskId: message.design_task_id,
      content: messageContentText(message.content).slice(0, 1200),
      stepDecision: recordValue(message.metadata).stepDecision ?? null,
      createdAt: message.created_at,
    })),
  };
}

/**
 * Map an Order row to one of the business-owner-defined service types
 * (spec §Phase 8 — see dev spec v0.2.0):
 *   marketing | design | trade | website | other
 */
function deriveServiceType(order: {
  project_type: string | null;
  metadata: Prisma.JsonValue;
}): "marketing" | "design" | "trade" | "website" | "other" {
  const meta = recordValue(order.metadata);
  if (meta.source === "trade_inquiry") return "trade";
  if (order.project_type === "website" || order.project_type === "product_page") return "website";
  if (order.project_type === "design") return "design";
  if (order.project_type === "copywriting") return "marketing";
  return "other";
}

const SERVICE_TYPE_FILTERS: Record<string, (where: Prisma.OrderWhereInput) => Prisma.OrderWhereInput> = {
  marketing: (w) => ({ ...w, project_type: "copywriting" }),
  design: (w) => ({ ...w, project_type: "design" }),
  website: (w) => ({ ...w, project_type: { in: ["website", "product_page"] } }),
  trade: (w) => ({ ...w, metadata: { path: ["source"], equals: "trade_inquiry" } }),
  other: (w) => ({
    ...w,
    AND: [
      { OR: [{ project_type: null }, { project_type: "project" }] },
      { NOT: { metadata: { path: ["source"], equals: "trade_inquiry" } } },
    ],
  }),
};

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const params = req.nextUrl.searchParams;

    const status = params.get("status") ?? undefined;
    const service = params.get("service_type") ?? undefined;
    const dateStart = params.get("date_start");
    const dateEnd = params.get("date_end");
    const quoteStart = params.get("quote_date_start");
    const quoteEnd = params.get("quote_date_end");
    const q = (params.get("q") ?? "").trim();

    let where: Prisma.OrderWhereInput = {
      user_id: session.user.id,
      deleted_at: null,
      ...(status ? { status: status as never } : {}),
    };

    if (dateStart || dateEnd) {
      where.created_at = {
        ...(dateStart ? { gte: new Date(dateStart) } : {}),
        ...(dateEnd ? { lte: new Date(dateEnd) } : {}),
      };
    }
    if (quoteStart || quoteEnd) {
      where.submitted_at = {
        ...(quoteStart ? { gte: new Date(quoteStart) } : {}),
        ...(quoteEnd ? { lte: new Date(quoteEnd) } : {}),
      };
    }
    if (q) {
      where.OR = [
        { order_no: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { items: { some: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }
    if (service && SERVICE_TYPE_FILTERS[service]) {
      where = SERVICE_TYPE_FILTERS[service](where);
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: { items: true, quotes: true },
      take: 100,
    });

    const enriched = orders.map((o) => ({
      ...o,
      service_type: deriveServiceType({ project_type: o.project_type, metadata: o.metadata }),
    }));

    return ok(enriched);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = createSchema.parse(await req.json());
    const isProjectOrder = Boolean(body.project_type);
    const nextStatus = isProjectOrder && body.submit ? "quote_pending" : body.status;
    const metadata = recordValue(body.metadata);
    const sourceTaskId = stringValue(metadata.source_task_id) || stringValue(metadata.task_id);
    const baseDeliverableSnapshot = sanitizeProjectSnapshot(recordValue(body.deliverable_snapshot));
    const alignmentSnapshot = isProjectOrder
      ? await buildProjectAlignmentSnapshot({
          userId: session.user.id,
          conversationId: body.conversation_id,
          sourceTaskId,
        })
      : null;
    const alignedTask = alignmentSnapshot?.designTask
      ? ({
          id: alignmentSnapshot.designTask.id,
          conversation_id: body.conversation_id ?? "",
          user_id: session.user.id,
          task_type: alignmentSnapshot.designTask.taskType,
          template_key: alignmentSnapshot.designTask.templateKey,
          template_label: alignmentSnapshot.designTask.templateLabel,
          execution_strategy: null,
          preferred_model: null,
          title: alignmentSnapshot.designTask.title,
          status: alignmentSnapshot.designTask.status,
          priority: 0,
          output_count: 1,
          summary: alignmentSnapshot.designTask.summary,
          collected_data: alignmentSnapshot.designTask.collectedData,
          resolved_requirements: alignmentSnapshot.designTask.resolvedRequirements,
          missing_requirements: alignmentSnapshot.designTask.missingRequirements,
          current_clarification_goal: alignmentSnapshot.designTask.currentClarificationGoal,
          clarification_count: alignmentSnapshot.designTask.clarificationCount,
          last_activity_at: alignmentSnapshot.designTask.lastActivityAt,
          created_at: new Date(),
          updated_at: new Date(),
        } as DesignTask)
      : null;
    const requirementsSummary = isProjectOrder
      ? buildProjectRequirementSummary({
          fallback: body.requirements_summary,
          task: alignedTask,
          deliverableSnapshot: baseDeliverableSnapshot,
        })
      : body.requirements_summary;
    const deliverableSnapshot = isProjectOrder
      ? {
          ...baseDeliverableSnapshot,
          alignment: alignmentSnapshot,
        }
      : body.deliverable_snapshot;
    const orderMetadata = isProjectOrder
      ? {
          ...metadata,
          source_task_id: sourceTaskId || alignmentSnapshot?.designTask?.id || null,
          source_conversation_id: body.conversation_id ?? null,
        }
      : body.metadata;
    const customer = body.customer ?? {
      name: session.user.email ?? "客戶",
      email: session.user.email ?? undefined,
    };
    const subtotal = body.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const total = subtotal + body.shipping + body.tax;
    if (!isProjectOrder && body.status === "pending" && body.items.length === 0) {
      return fail("BUSINESS_RULE_VIOLATION", "Pending order requires at least one item");
    }
    if (!isProjectOrder && body.status === "pending" && total <= 0) {
      return fail("BUSINESS_RULE_VIOLATION", "Order total must be positive");
    }

    const orderId = randomUUID();
    const revision = isProjectOrder
      ? await resolveProjectOrderRevision({
          userId: session.user.id,
          orderId,
          conversationId: body.conversation_id,
          projectType: body.project_type,
          sourceTaskId: sourceTaskId || alignmentSnapshot?.designTask?.id || undefined,
          sourceMessageId: metadataSourceMessageId(metadata),
        })
      : null;
    if (revision?.duplicateOrderId) {
      const existing = await prisma.order.findUnique({
        where: { id: revision.duplicateOrderId },
        include: { items: true },
      });
      if (existing) return ok(existing);
    }

    const versionedOrderMetadata = isProjectOrder
      ? {
          ...orderMetadata,
          project_revision: {
            familyId: revision?.familyId ?? orderId,
            version: revision?.version ?? 1,
            previousOrderId: revision?.previousOrderId ?? null,
            supersedesOrderId: revision?.shouldSupersedePrevious ? revision.previousOrderId : null,
            relation: revision?.relation ?? "initial",
            sourceConversationId: body.conversation_id ?? null,
            sourceTaskId: sourceTaskId || alignmentSnapshot?.designTask?.id || null,
            sourceMessageId: metadataSourceMessageId(metadata) || null,
            sourceGenerationVersion: typeof baseDeliverableSnapshot.versionNumber === "number" ? baseDeliverableSnapshot.versionNumber : null,
          },
        }
      : orderMetadata;

    const order = await prisma.order.create({
      data: {
        id: orderId,
        user_id: session.user.id,
        order_no: generateOrderNo(),
        conversation_id: body.conversation_id,
        project_type: body.project_type,
        title: body.title,
        requirements_summary: requirementsSummary,
        deliverable_snapshot: inputJson(deliverableSnapshot),
        submitted_at: nextStatus === "quote_pending" ? new Date() : undefined,
        customer,
        subtotal,
        tax: body.tax,
        shipping: body.shipping,
        total,
        metadata: inputJson(versionedOrderMetadata),
        notes: body.notes,
        status: nextStatus,
        items: {
          create: body.items.map((it) => ({
            name: it.name,
            description: it.description,
            sku: it.sku,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total: it.quantity * it.unit_price,
          })),
        },
        events: {
          create: {
            type: body.status === "draft" ? "draft_created" : "created",
            actor: "user",
            data: {
              project_type: body.project_type,
              metadata: versionedOrderMetadata,
            } as Prisma.InputJsonValue,
          },
        },
      },
      include: { items: true },
    });

    if (isProjectOrder) {
      if (revision?.shouldSupersedePrevious && revision.previousOrderId && revision.previousStatus) {
        await prisma.projectQuote.updateMany({
          where: { order_id: revision.previousOrderId, status: "active" },
          data: { status: "superseded" },
        });
        await prisma.order.update({
          where: { id: revision.previousOrderId },
          data: {
            status: "cancelled",
            cancel_reason: "user",
            cancelled_at: new Date(),
          },
        });
        await prisma.orderEvent.create({
          data: {
            order_id: revision.previousOrderId,
            type: "project_order_superseded",
            actor: "user",
            data: {
              next_order_id: order.id,
              next_order_no: order.order_no,
              next_version: revision.version,
            } as Prisma.InputJsonValue,
          },
        });
        await writeOrderStatusHistory({
          orderId: revision.previousOrderId,
          fromStatus: revision.previousStatus,
          toStatus: "cancelled",
          actorId: session.user.id,
          reason: `superseded_by:${order.id}`,
        });
      }
      await prisma.orderEvent.create({
        data: {
          order_id: order.id,
          type: "project_order_revision_created",
          actor: "user",
          data: {
            version: revision?.version ?? 1,
            family_id: revision?.familyId ?? order.id,
            previous_order_id: revision?.previousOrderId ?? null,
            relation: revision?.relation ?? "initial",
          } as Prisma.InputJsonValue,
        },
      });
      await writeOrderStatusHistory({
        orderId: order.id,
        fromStatus: null,
        toStatus: order.status,
        actorId: session.user.id,
        reason: body.submit ? "submitted_for_quote" : "draft_created",
      });
    }

    if (body.conversation_id) {
      await prisma.message.create({
        data: {
          conversation_id: body.conversation_id,
          role: "tool",
          content: {
            type: "order_form",
            data: {
              order_id: order.id,
              order_no: order.order_no,
              status: order.status,
              customer,
              project_revision: recordValue(versionedOrderMetadata).project_revision ?? null,
              items: order.items.map((item) => ({
                name: item.name,
                quantity: item.quantity,
                unit_price: item.unit_price,
              })),
              total: order.total,
            },
          },
        },
      });
      await prisma.conversation.update({
        where: { id: body.conversation_id },
        data: { last_message_at: new Date() },
      });
    }
    return ok(order);
  } catch (err) {
    return handleError(err);
  }
}
