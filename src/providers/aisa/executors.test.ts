import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, expect, it, vi } from "vitest";
import { executors } from "./executors.ts";

const context: ExecutionContext = {
  getCredential: async () => ({
    authType: "api_key",
    apiKey: "test-key",
    values: {},
    metadata: {},
    profile: { accountId: "test", displayName: "Test", grantedScopes: [] },
  }),
};
afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([
  [404, "provider_error", 404],
  [400, "invalid_input", 400],
  [422, "invalid_input", 400],
] as const)("classifies upstream HTTP %i without losing its error message", async (status, code, mappedStatus) => {
  const fetcher = vi.fn(async () => Response.json({ error: { message: "Upstream rejected request" } }, { status }));
  vi.stubGlobal("fetch", fetcher);
  expect(await executors["aisa.search_akta_companies"]!({ query: "test" }, context)).toMatchObject({
    ok: false,
    error: { code, message: "Upstream rejected request", details: { status: mappedStatus } },
  });
  expect(fetcher).toHaveBeenCalledOnce();
});
