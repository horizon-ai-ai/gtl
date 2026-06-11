/**
 * Marketing research availability reflects real configuration (#6).
 *
 * When no usable search model (`marketing_search`/`marketing_deep`) is
 * configured, `maybeResearch` must return null WITHOUT issuing the router
 * classification LLM call — otherwise a router call is burned only to discard
 * its result at the later search-model check.
 */
import type { ResolvedAiModel } from "@/lib/ai-model-settings";

const resolvePurposeModelConfigMock = jest.fn();
jest.mock("@/lib/ai-model-settings", () => ({
  resolvePurposeModelConfig: (...args: unknown[]) => resolvePurposeModelConfigMock(...args),
}));

import { MarketingIntelligenceService } from "@/lib/conversation/marketing-intelligence";

const routerModel: ResolvedAiModel = {
  model: "router-model",
  providerConfig: {
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-router",
    provider: "openrouter",
  },
  creditMultiplier: 5,
};

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("MarketingIntelligenceService.maybeResearch — search-model gate (#6)", () => {
  it("returns null and issues no router classification call when no search model is configured", async () => {
    // Router model present, but neither marketing_search nor marketing_deep.
    resolvePurposeModelConfigMock.mockImplementation(async (purpose: string) =>
      purpose === "marketing_router" ? routerModel : null,
    );

    const service = new MarketingIntelligenceService();
    const result = await service.maybeResearch({
      userMessage: "幫我看看最新的設計趨勢",
      task: null,
      recentTurns: [],
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
