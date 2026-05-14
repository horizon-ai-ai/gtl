import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fail, handleError, ok, ApiError } from "@/lib/api";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  description: z.string().optional(),
  sku: z.string().optional(),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().nonnegative(),
});

const updateSchema = z.object({
  status: z.enum(["draft", "pending", "paid", "shipped", "completed", "canceled", "refunded"]).optional(),
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
      include: { items: true, events: { orderBy: { created_at: "desc" } } },
    });
    if (!order) return fail("RESOURCE_NOT_FOUND", "Order not found");
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
