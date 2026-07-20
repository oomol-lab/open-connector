import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { anySearchActionHandlers, validateAnySearchApiKey } from "./runtime.ts";

describe("AnySearch runtime", () => {
  it("preserves the status and body of a non-JSON error response", async () => {
    const context = createContext(new Response("rate limit exceeded", { status: 429 }));

    await expect(anySearchActionHandlers.search!({ query: "connector" }, context)).rejects.toMatchObject({
      status: 429,
      message: "rate limit exceeded",
      details: { message: "rate limit exceeded" },
    });
  });

  it("rejects a non-JSON successful response as an upstream failure", async () => {
    const fetcher: ProviderFetch = async () => new Response("not json", { status: 200 });

    await expect(validateAnySearchApiKey("test-api-key", fetcher)).rejects.toMatchObject({
      status: 502,
      message: "AnySearch returned invalid JSON",
    });
  });
});

function createContext(response: Response): ApiKeyProviderContext {
  return {
    apiKey: "test-api-key",
    fetcher: async () => response,
  };
}
