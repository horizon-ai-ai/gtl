/**
 * Provider precedence in `flexion` (#1).
 *
 * A request-supplied `providerConfig` must win over an ambient
 * `ANTHROPIC_API_KEY` in the environment: the outgoing request targets the
 * resolved provider's base URL, not `api.anthropic.com`. Env-only callers
 * (no `providerConfig`) still take the Anthropic/env path.
 *
 * `flexion` reads `ANTHROPIC_API_KEY` at module-eval time, so it is set
 * before the import below.
 */
process.env.ANTHROPIC_API_KEY = "sk-ambient-anthropic";

import { flexionComplete } from "@/lib/flexion";

type FetchCall = { url: string; init: RequestInit | undefined };

let calls: FetchCall[];

beforeEach(() => {
  calls = [];
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    if (url.includes("api.anthropic.com")) {
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "anthropic-reply" }],
          usage: { input_tokens: 1, output_tokens: 1 },
          model: "claude-haiku-4-5",
        }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "provider-reply" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
        model: "model-1",
      }),
    } as Response;
  }) as unknown as typeof fetch;
});

describe("flexionComplete provider precedence", () => {
  it("uses the supplied providerConfig even when ANTHROPIC_API_KEY is set", async () => {
    const result = await flexionComplete({
      model: "model-1",
      messages: [{ role: "user", content: "hi" }],
      providerConfig: {
        baseUrl: "https://custom.example.com/v1",
        apiKey: "sk-resolved",
        provider: "openai-compatible",
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://custom.example.com/v1/chat/completions");
    expect(calls[0].url).not.toContain("api.anthropic.com");
    const auth = (calls[0].init?.headers as Record<string, string>)?.Authorization;
    expect(auth).toBe("Bearer sk-resolved");
    expect(result.text).toBe("provider-reply");
  });

  it("falls back to the Anthropic/env path when no providerConfig is supplied", async () => {
    const result = await flexionComplete({
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.anthropic.com");
    expect(result.text).toBe("anthropic-reply");
  });
});
