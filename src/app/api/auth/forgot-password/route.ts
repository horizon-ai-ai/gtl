import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { issueToken } from "@/lib/auth/tokens";
import { sendPasswordResetEmail } from "@/lib/auth/emails";

const schema = z.object({
  email: z.string().email(),
});

const DUMMY_BCRYPT_HASH =
  "$2b$12$Hyo3LXEx7ttV8/nvVHNEEubpqLisRBWiD2P8r/fZ1CxKxMFDQQ0Y6";

export async function POST(req: NextRequest) {
  try {
    const { email } = schema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { email } });
    if (user && user.status === "active") {
      const { token } = await issueToken(user.id, "reset");
      await sendPasswordResetEmail(user.email, token);
    } else {
      await bcrypt.compare("never-matches", DUMMY_BCRYPT_HASH);
      const masked = createHash("sha256").update(email).digest("hex").slice(0, 12);
      console.info("[forgot-password:no-match]", { email_hash: masked });
    }

    return ok({});
  } catch (err) {
    return handleError(err);
  }
}
