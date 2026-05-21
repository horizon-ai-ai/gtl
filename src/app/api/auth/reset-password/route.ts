import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { consumeToken } from "@/lib/auth/tokens";

const schema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(8).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const { token, new_password } = schema.parse(await req.json());

    const password_hash = await bcrypt.hash(new_password, 12);

    const { user_id } = await prisma.$transaction(async (tx) => {
      const consumed = await consumeToken(token, "reset", tx as never);
      await tx.user.update({
        where: { id: consumed.user_id },
        data: { password_hash },
      });
      await tx.session.updateMany({
        where: { user_id: consumed.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      return consumed;
    });

    return ok({ user_id });
  } catch (err) {
    return handleError(err);
  }
}
