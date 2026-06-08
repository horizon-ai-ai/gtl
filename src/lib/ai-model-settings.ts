import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export type AiModelProviderConfig = {
  baseUrl: string;
  apiKey: string;
  provider: string;
};

export type ResolvedAiModel = {
  model: string;
  settingId?: string;
  providerConfig?: AiModelProviderConfig;
  creditMultiplier?: number;
};

export type AiModelPurpose = "conversation" | "marketing_router" | "marketing_search" | "marketing_deep";

export type AiModelSettingRecord = {
  id: string;
  label: string;
  model_id: string;
  purpose: AiModelPurpose | string;
  provider: string;
  base_url: string;
  api_key_ciphertext: string;
  api_key_hint: string | null;
  credit_multiplier: number;
  active: boolean;
  is_default: boolean;
  sort_order: number;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

const ALGORITHM = "aes-256-gcm";

function encryptionKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required for AI model API key encryption");
  const salt = process.env.AI_MODEL_ENCRYPTION_SALT || "gtl-ai-model-settings";
  return createHash("sha256").update(`${secret}:${salt}`).digest();
}

export function normalizeModelBaseUrl(value: string) {
  let next = value.trim();
  while (next.endsWith("/")) next = next.slice(0, -1);
  return next;
}

export function encryptModelApiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

export function decryptModelApiKey(value: string) {
  // A malformed ciphertext (bad JSON, wrong shape, failed auth tag) is a
  // configuration problem, not a server bug: surface it as
  // AI_MODEL_NOT_CONFIGURED rather than letting a raw SyntaxError escape.
  try {
    const payload = JSON.parse(value) as { iv: string; tag: string; ciphertext: string };
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("AI_MODEL_NOT_CONFIGURED", "Stored AI model API key could not be decrypted");
  }
}

export function modelApiKeyHint(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `••••${trimmed.slice(-4)}`;
}

function providerFromBaseUrl(baseUrl: string) {
  if (baseUrl.includes("openrouter.ai")) return "openrouter";
  if (baseUrl.includes("api.openai.com")) return "openai";
  if (baseUrl.includes("api.moonshot")) return "moonshot";
  return "openai-compatible";
}

export function publicModelOption(setting: AiModelSettingRecord) {
  return {
    id: setting.id,
    value: setting.id,
    label: setting.label,
    provider: setting.provider || providerFromBaseUrl(setting.base_url),
    isDefault: setting.is_default,
    modelId: setting.model_id,
  };
}

// The Prisma migration is the source of truth for this table; this runtime
// DDL is a defensive backstop. Memoize it with a module-level Promise so the
// CREATE/ALTER/CREATE INDEX block runs at most once per process instead of on
// every resolution. On failure the cache is cleared so a later call can retry.
let ensureTablePromise: Promise<void> | null = null;

export function ensureAiModelSettingsTable(): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = runEnsureAiModelSettingsTable().catch((err) => {
      ensureTablePromise = null;
      throw err;
    });
  }
  return ensureTablePromise;
}

async function runEnsureAiModelSettingsTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiModelSetting" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "label" text NOT NULL,
      "model_id" text NOT NULL,
      "purpose" text NOT NULL DEFAULT 'conversation',
      "provider" text NOT NULL DEFAULT 'openai-compatible',
      "base_url" text NOT NULL,
      "api_key_ciphertext" text NOT NULL,
      "api_key_hint" text,
      "credit_multiplier" integer NOT NULL DEFAULT 5,
      "active" boolean NOT NULL DEFAULT true,
      "is_default" boolean NOT NULL DEFAULT false,
      "sort_order" integer NOT NULL DEFAULT 0,
      "notes" text,
      "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiModelSetting_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "AiModelSetting" ADD COLUMN IF NOT EXISTS "purpose" text NOT NULL DEFAULT 'conversation'`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiModelSetting_active_sort_order_idx" ON "AiModelSetting"("active", "sort_order")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiModelSetting_purpose_active_sort_order_idx" ON "AiModelSetting"("purpose", "active", "sort_order")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AiModelSetting_is_default_idx" ON "AiModelSetting"("is_default")`);
}

export async function listActiveAiModelSettings(purpose: AiModelPurpose = "conversation") {
  await ensureAiModelSettingsTable();
  return prisma.$queryRaw<AiModelSettingRecord[]>`
    SELECT * FROM "AiModelSetting"
    WHERE "active" = true AND "purpose" = ${purpose}
    ORDER BY "is_default" DESC, "sort_order" ASC, "created_at" ASC
  `;
}

export async function listAllAiModelSettings() {
  await ensureAiModelSettingsTable();
  return prisma.$queryRaw<AiModelSettingRecord[]>`
    SELECT * FROM "AiModelSetting"
    ORDER BY "active" DESC, "is_default" DESC, "sort_order" ASC, "created_at" ASC
  `;
}

export async function clearDefaultAiModelSettings(purpose: AiModelPurpose, exceptId?: string) {
  await ensureAiModelSettingsTable();
  if (exceptId) {
    await prisma.$executeRaw`
      UPDATE "AiModelSetting"
      SET "is_default" = false, "updated_at" = CURRENT_TIMESTAMP
      WHERE "purpose" = ${purpose} AND "id" <> ${exceptId}::uuid
    `;
    return;
  }
  await prisma.$executeRaw`
    UPDATE "AiModelSetting"
    SET "is_default" = false, "updated_at" = CURRENT_TIMESTAMP
    WHERE "purpose" = ${purpose}
  `;
}

export async function createAiModelSetting(input: {
  label: string;
  modelId: string;
  purpose: AiModelPurpose;
  provider: string;
  baseUrl: string;
  apiKey: string;
  creditMultiplier: number;
  sortOrder: number;
  isDefault: boolean;
  notes: string | null;
}) {
  await ensureAiModelSettingsTable();
  await prisma.$executeRaw`
    INSERT INTO "AiModelSetting"
      ("label", "model_id", "purpose", "provider", "base_url", "api_key_ciphertext", "api_key_hint", "credit_multiplier", "sort_order", "is_default", "active", "notes")
    VALUES
      (
        ${input.label},
        ${input.modelId},
        ${input.purpose},
        ${input.provider},
        ${input.baseUrl},
        ${encryptModelApiKey(input.apiKey)},
        ${modelApiKeyHint(input.apiKey)},
        ${input.creditMultiplier},
        ${input.sortOrder},
        ${input.isDefault},
        true,
        ${input.notes}
      )
  `;
}

export async function updateAiModelSetting(input: {
  id: string;
  label: string;
  modelId: string;
  purpose: AiModelPurpose;
  provider: string;
  baseUrl: string;
  apiKey?: string;
  creditMultiplier: number;
  sortOrder: number;
  active: boolean;
  isDefault: boolean;
  notes: string | null;
}) {
  await ensureAiModelSettingsTable();
  if (input.apiKey) {
    await prisma.$executeRaw`
      UPDATE "AiModelSetting"
      SET
        "label" = ${input.label},
        "model_id" = ${input.modelId},
        "purpose" = ${input.purpose},
        "provider" = ${input.provider},
        "base_url" = ${input.baseUrl},
        "api_key_ciphertext" = ${encryptModelApiKey(input.apiKey)},
        "api_key_hint" = ${modelApiKeyHint(input.apiKey)},
        "credit_multiplier" = ${input.creditMultiplier},
        "sort_order" = ${input.sortOrder},
        "active" = ${input.active},
        "is_default" = ${input.isDefault},
        "notes" = ${input.notes},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.id}::uuid
    `;
    return;
  }

  await prisma.$executeRaw`
    UPDATE "AiModelSetting"
    SET
      "label" = ${input.label},
      "model_id" = ${input.modelId},
      "purpose" = ${input.purpose},
      "provider" = ${input.provider},
      "base_url" = ${input.baseUrl},
      "credit_multiplier" = ${input.creditMultiplier},
      "sort_order" = ${input.sortOrder},
      "active" = ${input.active},
      "is_default" = ${input.isDefault},
      "notes" = ${input.notes},
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${input.id}::uuid
  `;
}

export async function pickConversationModels() {
  const settings = await listActiveAiModelSettings("conversation");
  return settings.map(publicModelOption);
}

export async function resolveRequestedModelConfig(_plan: string, requestedModel?: string | null): Promise<ResolvedAiModel> {
  const requested = typeof requestedModel === "string" ? requestedModel.trim() : "";
  const settings = await listActiveAiModelSettings("conversation");
  if (settings.length > 0) {
    const selected =
      settings.find((setting) => setting.id === requested) ||
      settings.find((setting) => setting.model_id === requested) ||
      settings.find((setting) => setting.is_default) ||
      settings[0];
    return {
      model: selected.model_id,
      settingId: selected.id,
      providerConfig: {
        baseUrl: normalizeModelBaseUrl(selected.base_url),
        apiKey: decryptModelApiKey(selected.api_key_ciphertext),
        provider: selected.provider || providerFromBaseUrl(selected.base_url),
      },
      creditMultiplier: selected.credit_multiplier,
    };
  }

  throw new ApiError("AI_MODEL_NOT_CONFIGURED", "AI model is not configured");
}

export async function resolvePurposeModelConfig(purpose: AiModelPurpose): Promise<ResolvedAiModel | null> {
  const settings = await listActiveAiModelSettings(purpose);
  const selected = settings.find((setting) => setting.is_default) || settings[0];
  if (!selected) return null;
  return {
    model: selected.model_id,
    settingId: selected.id,
    providerConfig: {
      baseUrl: normalizeModelBaseUrl(selected.base_url),
      apiKey: decryptModelApiKey(selected.api_key_ciphertext),
      provider: selected.provider || providerFromBaseUrl(selected.base_url),
    },
    creditMultiplier: selected.credit_multiplier,
  };
}
