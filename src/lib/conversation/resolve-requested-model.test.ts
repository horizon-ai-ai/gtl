/**
 * DB-driven conversation model resolution.
 *
 * `resolveRequestedModelConfig` selects among active `AiModelSetting`
 * (purpose = "conversation") rows: by setting id, by model_id, then the
 * `is_default` row, then the first active row. With no active rows it throws
 * `AI_MODEL_NOT_CONFIGURED`. The plan argument no longer clamps to an
 * allowlist.
 */
const mockQueryRaw = jest.fn();
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
  },
}));

import { ApiError } from "@/lib/api";
import {
  encryptModelApiKey,
  resolveRequestedModelConfig,
  type AiModelSettingRecord,
} from "@/lib/ai-model-settings";

// Set before the row fixtures below call `encryptModelApiKey`, which reads
// NEXTAUTH_SECRET at module-eval time.
process.env.NEXTAUTH_SECRET = "test-secret-for-ai-model-settings";

beforeEach(() => {
  mockQueryRaw.mockReset();
  mockExecuteRawUnsafe.mockClear();
});

function makeRow(overrides: Partial<AiModelSettingRecord>): AiModelSettingRecord {
  return {
    id: "s1",
    label: "Setting",
    model_id: "model-1",
    purpose: "conversation",
    provider: "openai-compatible",
    base_url: "https://api.example.com/v1",
    api_key_ciphertext: encryptModelApiKey("sk-test"),
    api_key_hint: null,
    credit_multiplier: 5,
    active: true,
    is_default: false,
    sort_order: 0,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// Mirrors the spec Example table: active settings
// [(s1, gpt-5.4, default), (s2, claude-opus-4-7, not default)].
const rows: AiModelSettingRecord[] = [
  makeRow({ id: "s1", model_id: "gpt-5.4", is_default: true }),
  makeRow({ id: "s2", model_id: "claude-opus-4-7", is_default: false }),
];

describe("resolveRequestedModelConfig", () => {
  it("selects the default row when no override is provided", async () => {
    mockQueryRaw.mockResolvedValue(rows);
    const resolved = await resolveRequestedModelConfig("free", undefined);
    expect(resolved.model).toBe("gpt-5.4");
  });

  it("selects by setting id when the override equals a row id", async () => {
    mockQueryRaw.mockResolvedValue(rows);
    const resolved = await resolveRequestedModelConfig("free", "s2");
    expect(resolved.model).toBe("claude-opus-4-7");
  });

  it("selects by model_id when the override equals a row model_id", async () => {
    mockQueryRaw.mockResolvedValue(rows);
    const resolved = await resolveRequestedModelConfig("free", "claude-opus-4-7");
    expect(resolved.model).toBe("claude-opus-4-7");
  });

  it("falls back to the default row when the override matches nothing", async () => {
    mockQueryRaw.mockResolvedValue(rows);
    const resolved = await resolveRequestedModelConfig("free", "unknown-model");
    expect(resolved.model).toBe("gpt-5.4");
  });

  it("rejects with AI_MODEL_NOT_CONFIGURED when no active settings exist", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await expect(resolveRequestedModelConfig("free", "anything")).rejects.toBeInstanceOf(
      ApiError,
    );
    mockQueryRaw.mockResolvedValue([]);
    await expect(resolveRequestedModelConfig("free", "anything")).rejects.toMatchObject({
      code: "AI_MODEL_NOT_CONFIGURED",
    });
  });
});
