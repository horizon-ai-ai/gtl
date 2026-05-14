import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function getBaseKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  const salt = process.env.GA_TOKEN_ENCRYPTION_SALT;

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for analytics token encryption");
  }
  if (!salt) {
    throw new Error("GA_TOKEN_ENCRYPTION_SALT is required for analytics token encryption");
  }

  return Buffer.from(hkdfSync("sha256", Buffer.from(secret), Buffer.from(salt), "ga-token-encryption", 32));
}

export function encryptAnalyticsSecret(value: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getBaseKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptAnalyticsSecret(payload: EncryptedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, getBaseKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
