import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, handleError, ApiError } from "@/lib/api";
import { issueToken } from "@/lib/auth/tokens";
import { sendVerifyEmail } from "@/lib/auth/emails";

const schema = z.object({
  email: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email: bodyEmail } = schema.parse(body);

    const session = await auth();
    const email = session?.user?.email ?? bodyEmail;
    if (!email) {
      throw new ApiError("VALIDATION_ERROR", "Email is required");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.status === "active" && user.email_verified_at === null) {
      const { token } = await issueToken(user.id, "verify");
      await sendVerifyEmail(user.email, token);
    } else {
      const masked = createHash("sha256").update(email).digest("hex").slice(0, 12);
      console.info("[resend-verification:no-match]", { email_hash: masked });
    }

    return ok({});
  } catch (err) {
    return handleError(err);
  }
}
