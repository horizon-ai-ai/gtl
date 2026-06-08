/**
 * Runtime DDL memoization (#4).
 *
 * `ensureAiModelSettingsTable` runs the CREATE/ALTER/CREATE INDEX block at most
 * once per process. Across multiple `resolveRequestedModelConfig` calls the
 * DDL executor (`$executeRawUnsafe`) fires only for the first resolution, not
 * on every request. This lives in its own file so the module-level memoization
 * Promise starts fresh (unaffected by sibling suites).
 */
const mockQueryRaw = jest.fn();
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
  },
}));

import {
  encryptModelApiKey,
  resolveRequestedModelConfig,
  type AiModelSettingRecord,
} from "@/lib/ai-model-settings";

process.env.NEXTAUTH_SECRET = "test-secret-for-ai-model-settings";

const row: AiModelSettingRecord = {
  id: "s1",
  label: "Setting",
  model_id: "gpt-5.4",
  purpose: "conversation",
  provider: "openai-compatible",
  base_url: "https://api.example.com/v1",
  api_key_ciphertext: encryptModelApiKey("sk-test"),
  api_key_hint: null,
  credit_multiplier: 5,
  active: true,
  is_default: true,
  sort_order: 0,
  notes: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe("ensureAiModelSettingsTable memoization", () => {
  it("runs the DDL block once across multiple resolveRequestedModelConfig calls", async () => {
    mockQueryRaw.mockResolvedValue([row]);

    await resolveRequestedModelConfig("free", undefined);
    const afterFirst = mockExecuteRawUnsafe.mock.calls.length;

    await resolveRequestedModelConfig("free", "gpt-5.4");
    await resolveRequestedModelConfig("free", "s1");
    const afterThird = mockExecuteRawUnsafe.mock.calls.length;

    // The 5 DDL statements (CREATE TABLE + ALTER + 3 indexes) execute on the
    // first resolution only; later resolutions add zero executor calls.
    expect(afterFirst).toBe(5);
    expect(afterThird).toBe(afterFirst);
  });
});
