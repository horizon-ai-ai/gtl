import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail, handleError } from "@/lib/api";
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
  status: z.enum(["draft", "pending"]).default("pending"),
  customer: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    tax_id: z.string().optional(),
  }),
  items: z.array(itemSchema).default([]),
  shipping: z.number().int().nonnegative().default(0),
  tax: z.number().int().nonnegative().default(0),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const orders = await prisma.order.findMany({
      where: {
        user_id: session.user.id,
        deleted_at: null,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { created_at: "desc" },
      include: { items: true },
      take: 100,
    });
    return ok(orders);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = createSchema.parse(await req.json());
    const subtotal = body.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const total = subtotal + body.shipping + body.tax;
    if (body.status === "pending" && body.items.length === 0) {
      return fail("BUSINESS_RULE_VIOLATION", "Pending order requires at least one item");
    }
    if (body.status === "pending" && total <= 0) {
      return fail("BUSINESS_RULE_VIOLATION", "Order total must be positive");
    }

    const order = await prisma.order.create({
      data: {
        user_id: session.user.id,
        order_no: generateOrderNo(),
        conversation_id: body.conversation_id,
        customer: body.customer,
        subtotal,
        tax: body.tax,
        shipping: body.shipping,
        total,
        metadata: body.metadata as Prisma.InputJsonValue | undefined,
        notes: body.notes,
        status: body.status,
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
            data: body.metadata as Prisma.InputJsonValue | undefined,
          },
        },
      },
      include: { items: true },
    });

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
              customer: body.customer,
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
