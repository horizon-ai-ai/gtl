import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";

type TokenDelegate = {
  findUnique: (args: { where: { token_hash: string } }) => Promise<{
    id: string;
    user_id: string;
    expires_at: Date;
    consumed_at: Date | null;
  } | null>;
  update: (args: {
    where: { id: string };
    data: { consumed_at: Date };
  }) => Promise<unknown>;
  updateMany: (args: {
    where: { user_id: string; consumed_at: null };
    data: { consumed_at: Date };
  }) => Promise<{ count: number }>;
  create: (args: {
    data: { user_id: string; token_hash: string; expires_at: Date };
  }) => Promise<unknown>;
};

type TokenClient = {
  passwordResetToken: TokenDelegate;
  emailVerificationToken: TokenDelegate;
};

export type TokenPurpose = "reset" | "verify";

const TTL_MS: Record<TokenPurpose, number> = {
  reset: 30 * 60 * 1000,
  verify: 24 * 60 * 60 * 1000,
};

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export type IssuedToken = {
  token: string;
  hash: string;
  expires_at: Date;
};

export async function issueToken(
  user_id: string,
  purpose: TokenPurpose,
  client: TokenClient = prisma as unknown as TokenClient
): Promise<IssuedToken> {
  const token = randomBytes(32).toString("hex");
  const hash = hashToken(token);
  const expires_at = new Date(Date.now() + TTL_MS[purpose]);

  const delegate =
    purpose === "reset" ? client.passwordResetToken : client.emailVerificationToken;

  // Supersede prior unconsumed tokens for this user so only the most recent
  // link is valid. `consumed_at` is overloaded here to mean "used OR superseded"
  // — both states correctly fail `consumeToken`'s already-consumed check.
  await delegate.updateMany({
    where: { user_id, consumed_at: null },
    data: { consumed_at: new Date() },
  });
  await delegate.create({ data: { user_id, token_hash: hash, expires_at } });

  return { token, hash, expires_at };
}

export async function consumeToken(
  plaintext: string,
  purpose: TokenPurpose,
  client: TokenClient = prisma as unknown as TokenClient
): Promise<{ user_id: string }> {
  const hash = hashToken(plaintext);
  const now = new Date();
  const delegate =
    purpose === "reset" ? client.passwordResetToken : client.emailVerificationToken;

  const row = await delegate.findUnique({ where: { token_hash: hash } });
  if (!row) throw new ApiError("RESOURCE_NOT_FOUND", "Token not found");
  if (row.consumed_at !== null) {
    throw new ApiError("BUSINESS_RULE_VIOLATION", "Token already consumed");
  }
  if (row.expires_at <= now) {
    throw new ApiError("BUSINESS_RULE_VIOLATION", "Token expired");
  }
  await delegate.update({ where: { id: row.id }, data: { consumed_at: now } });
  return { user_id: row.user_id };
}

export function sha256Hex(value: string): string {
  return hashToken(value);
}
