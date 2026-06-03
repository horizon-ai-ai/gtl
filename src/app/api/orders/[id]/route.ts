import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok, ApiError } from "@/lib/api";
import { projectOrderInclude } from "@/lib/project-orders";
import { cleanTaskSummary } from "@/lib/project-brief";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  description: z.string().optional(),
  sku: z.string().optional(),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().nonnegative(),
});

const updateSchema = z.object({
  status: z.enum([
    "draft",
    "pending",
    "paid",
    "shipped",
    "completed",
    "canceled",
    "refunded",
    "quote_pending",
    "quoted",
    "confirmed",
    "in_execution",
    "closed",
    "cancelled",
  ]).optional(),
  customer: z
    .object({
      name: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      tax_id: z.string().optional(),
    })
    .optional(),
  items: z.array(itemSchema).optional(),
  shipping: z.number().int().nonnegative().optional(),
  tax: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function inputJson(value: unknown): Prisma.InputJsonValue {
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

async function buildAlignmentSnapshot(params: {
  userId: string;
  conversationId: string;
  sourceTaskId?: string;
}) {
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

  const task = await prisma.designTask.findFirst({
    where: {
      conversation_id: conversation.id,
      user_id: params.userId,
      ...(params.sourceTaskId ? { id: params.sourceTaskId } : { id: conversation.active_design_task_id ?? undefined }),
    },
  });

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
    recentDialogue: recentMessages.reverse().map((message) => ({
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

async function findOwnedOrder(id: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { id, user_id: userId, deleted_at: null },
    include: { items: true },
  });
  if (!order) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
  return order;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const order = await prisma.order.findFirst({
      where: { id: params.id, user_id: session.user.id, deleted_at: null },
      include: projectOrderInclude(),
    });
    if (!order) return fail("RESOURCE_NOT_FOUND", "Order not found");
    const snapshot = recordValue(order.deliverable_snapshot);
    const hasAlignment = Object.keys(recordValue(snapshot.alignment)).length > 0;
    if (order.project_type && order.conversation_id && !hasAlignment) {
      const metadata = recordValue(order.metadata);
      const alignment = await buildAlignmentSnapshot({
        userId: session.user.id,
        conversationId: order.conversation_id,
        sourceTaskId: stringValue(metadata.source_task_id),
      });
      if (alignment) {
        const deliverableSnapshot = { ...snapshot, alignment };
        await prisma.order.update({
          where: { id: order.id },
          data: { deliverable_snapshot: inputJson(deliverableSnapshot) },
        });
        return ok({ ...order, deliverable_snapshot: deliverableSnapshot });
      }
    }
    return ok(order);
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const existing = await findOwnedOrder(params.id, session.user.id);
    const body = updateSchema.parse(await req.json());

    const items = body.items ?? existing.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? undefined,
      sku: item.sku ?? undefined,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const shipping = body.shipping ?? existing.shipping;
    const tax = body.tax ?? existing.tax;
    const total = subtotal + shipping + tax;

    if ((body.status ?? existing.status) !== "draft" && items.length === 0) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Non-draft order requires items");
    }
    if ((body.status ?? existing.status) !== "draft" && total <= 0) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Order total must be positive");
    }

    const customer = (body.customer ?? existing.customer ?? {}) as Prisma.InputJsonValue;

    const order = await prisma.order.update({
      where: { id: params.id },
      data: {
        status: body.status,
        customer,
        shipping,
        tax,
        subtotal,
        total,
        notes: body.notes ?? existing.notes ?? undefined,
        items: body.items
          ? {
              deleteMany: {},
              create: body.items.map((item) => ({
                name: item.name,
                description: item.description,
                sku: item.sku,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.quantity * item.unit_price,
              })),
            }
          : undefined,
        events: {
          create: {
            type: "updated",
            actor: "user",
            data: {
              status: body.status,
            },
          },
        },
      },
      include: { items: true, events: { orderBy: { created_at: "desc" } } },
    });

    return ok(order);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const order = await findOwnedOrder(params.id, session.user.id);
    if (order.status !== "draft") {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Only draft orders can be deleted");
    }
    await prisma.order.update({
      where: { id: params.id },
      data: { deleted_at: new Date() },
    });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
