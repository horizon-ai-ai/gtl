/**
 * Task 4.1 — plan-allowlist model validation with clamp-on-miss.
 *
 * With no FLEXION/OPENROUTER env configured, pickModel resolves:
 *   free plan  → fast: gemini-3.1-pro-preview, normal/complex: gpt-5.4
 *   pro plan   → fast: gemini-3.1-pro-preview, normal: gpt-5.4, complex: claude-opus-4-7
 * so `claude-opus-4-7` is in the pro allowlist but NOT in the free allowlist.
 */
jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/conversation/schema-registry", () => ({
  getSchemaByTemplateKey: jest.fn(),
  resolveDefaultExecutionStrategy: jest.fn(),
}));

type ResolveRequestedModel = (plan: string, requestedModel?: string | null) => string;

let resolveRequestedModel: ResolveRequestedModel;
let pickModel: (opts: { plan: string }) => string;

beforeAll(() => {
  delete process.env.FLEXION_MODEL;
  delete process.env.FLEXION_API_BASE_URL;
  delete process.env.CONVERSATION_MODEL_OPTIONS;
  delete process.env.OPENROUTER_API_KEY;
  // Required from a callback so the env above is applied before flexion.ts
  // captures its module-level constants.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ resolveRequestedModel } = require("./api"));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ pickModel } = require("@/lib/flexion"));
});

describe("resolveRequestedModel", () => {
  it("honors a requested model inside the plan allowlist", () => {
    expect(resolveRequestedModel("free", "gemini-3.1-pro-preview")).toBe("gemini-3.1-pro-preview");
    expect(resolveRequestedModel("pro", "claude-opus-4-7")).toBe("claude-opus-4-7");
  });

  it("clamps an out-of-plan model to the plan default", () => {
    const resolved = resolveRequestedModel("free", "claude-opus-4-7");
    expect(resolved).toBe(pickModel({ plan: "free" }));
    expect(resolved).not.toBe("claude-opus-4-7");
  });

  it("clamps an unknown model id to the plan default", () => {
    expect(resolveRequestedModel("free", "totally-made-up-model")).toBe(pickModel({ plan: "free" }));
  });

  it("clamps an absent model to the plan default", () => {
    expect(resolveRequestedModel("free")).toBe(pickModel({ plan: "free" }));
    expect(resolveRequestedModel("free", null)).toBe(pickModel({ plan: "free" }));
    expect(resolveRequestedModel("free", "   ")).toBe(pickModel({ plan: "free" }));
  });
});
