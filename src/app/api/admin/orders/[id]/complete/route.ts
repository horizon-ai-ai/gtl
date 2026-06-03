import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ApiError, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { assertProjectTransition, projectOrderInclude, writeOrderStatusHistory } from "@/lib/project-orders";

const completeSchema = z.object({
  result_note: z.string().max(8000).optional(),
  deliverable_snapshot: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const body = completeSchema.parse(await req.json().catch(() => ({})));
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order || order.deleted_at) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    assertProjectTransition(order.status, "closed");

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "closed",
        closed_at: new Date(),
        deliverable_snapshot: (body.deliverable_snapshot ?? order.deliverable_snapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        events: { create: { type: "closed", actor: "admin", data: { result_note: body.result_note } } },
        messages: {
          create: {
            sender_role: "system",
            kind: "system_event",
            body: body.result_note ? `專案已結案：${body.result_note}` : "專案已結案，成果已送出。",
          },
        },
      },
      include: projectOrderInclude(),
    });
    await writeOrderStatusHistory({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "closed",
      actorId: admin.id,
      reason: "completed",
    });
    return ok(updated);
  } catch (err) {
    return handleError(err);
  }
}
