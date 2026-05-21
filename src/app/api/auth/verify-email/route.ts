import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { ok, handleError, ApiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) {
      throw new ApiError("VALIDATION_ERROR", "Missing token");
    }

    const token_hash = createHash("sha256").update(token).digest("hex");
    const row = await prisma.emailVerificationToken.findUnique({
      where: { token_hash },
      include: { user: { select: { id: true, email_verified_at: true } } },
    });

    if (!row) {
      throw new ApiError("RESOURCE_NOT_FOUND", "Token not found");
    }

    if (row.user.email_verified_at !== null) {
      return ok({ user_id: row.user.id, already_verified: true });
    }

    const now = new Date();
    if (row.expires_at <= now) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Token expired");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.user_id },
        data: { email_verified_at: now },
      }),
      prisma.emailVerificationToken.update({
        where: { id: row.id },
        data: { consumed_at: now },
      }),
    ]);

    return ok({ user_id: row.user_id, already_verified: false });
  } catch (err) {
    return handleError(err);
  }
}
