import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ensureRevisionAvailable } from "@/lib/project-orders";

const messageSchema = z.object({
  body: z.string().min(1).max(8000),
  kind: z.enum(["message", "revision_request"]).default("message"),
  attachments: z.array(z.record(z.string(), z.unknown())).optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const order = await prisma.order.findFirst({ where: { id: params.id, user_id: session.user.id, deleted_at: null } });
    if (!order) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    const messages = await prisma.orderMessage.findMany({
      where: { order_id: order.id },
      orderBy: { created_at: "asc" },
    });
    return ok(messages);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");
    const body = messageSchema.parse(await req.json());
    const order = await prisma.order.findFirst({ where: { id: params.id, user_id: session.user.id, deleted_at: null } });
    if (!order) throw new ApiError("RESOURCE_NOT_FOUND", "Order not found");
    if (order.status === "closed" || order.status === "cancelled" || order.status === "canceled") {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "訂單已結束，無法再送出訊息");
    }
    if (body.kind === "revision_request" && order.status !== "confirmed" && order.status !== "in_execution") {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "修改需求會在訂金確認後開啟");
    }

    const message = await prisma.$transaction(async (tx) => {
      if (body.kind === "revision_request") {
        await ensureRevisionAvailable(order.id);
        await tx.revisionQuota.update({
          where: { order_id: order.id },
          data: { used: { increment: 1 } },
        });
      }
      return tx.orderMessage.create({
        data: {
          order_id: order.id,
          sender_role: "customer",
          sender_id: session.user.id,
          kind: body.kind,
          body: body.body,
          attachments: (body.attachments ?? []) as Prisma.InputJsonValue,
          consumes_revision: body.kind === "revision_request",
        },
      });
    });
    return ok(message);
  } catch (err) {
    return handleError(err);
  }
}
