import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";

const messageSchema = z.object({
  body: z.string().min(1).max(8000),
  kind: z.enum(["message", "progress_update"]).default("message"),
  attachments: z.array(z.record(z.string(), z.unknown())).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const body = messageSchema.parse(await req.json());
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order || order.deleted_at) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    const message = await prisma.orderMessage.create({
      data: {
        order_id: order.id,
        sender_role: "reviewer",
        sender_id: admin.id,
        kind: body.kind,
        body: body.body,
        attachments: (body.attachments ?? []) as Prisma.InputJsonValue,
      },
    });
    return ok(message);
  } catch (err) {
    return handleError(err);
  }
}
