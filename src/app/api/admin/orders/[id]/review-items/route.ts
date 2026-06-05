import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(300),
  checked: z.boolean().default(false),
  detail: z.string().max(4000).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  sort_order: z.number().int().nonnegative().default(0),
});

const reviewSchema = z.object({
  items: z.array(itemSchema).max(100),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = reviewSchema.parse(await req.json());
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order || order.deleted_at) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");

    await prisma.$transaction(
      body.items.map((item) =>
        item.id
          ? prisma.reviewItem.update({
              where: { id: item.id },
              data: {
                label: item.label,
                checked: item.checked,
                detail: item.detail,
                result: item.result as Prisma.InputJsonValue | undefined,
                sort_order: item.sort_order,
              },
            })
          : prisma.reviewItem.create({
              data: {
                order_id: order.id,
                label: item.label,
                checked: item.checked,
                detail: item.detail,
                result: item.result as Prisma.InputJsonValue | undefined,
                sort_order: item.sort_order,
              },
            }),
      ),
    );
    const items = await prisma.reviewItem.findMany({ where: { order_id: order.id }, orderBy: { sort_order: "asc" } });
    return ok(items);
  } catch (err) {
    return handleError(err);
  }
}
