import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, expect, it, vi } from "vitest";
import { credentialValidators, executors, proxy } from "./executors.ts";
afterEach(() => vi.unstubAllGlobals());
const context: ExecutionContext = {
  getCredential: async () => ({
    authType: "api_key",
    apiKey: "test-key",
    values: {},
    metadata: {},
    profile: { accountId: "test", displayName: "Test", grantedScopes: [] },
  }),
};
it.each([401, 403])(
  "preserves ambiguous HTTP %i as provider_error across validation, actions and proxy",
  async (status) => {
    const fetcher: typeof fetch = async () => Response.json({ message: "Access refused" }, { status });
    vi.stubGlobal("fetch", fetcher);
    await expect(credentialValidators.apiKey!({ apiKey: "test-key", values: {} }, { fetcher })).rejects.toMatchObject({
      status,
      code: "provider_error",
    });
    expect(await executors["neon.get_current_user"]!({}, context)).toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
    expect(await proxy({ endpoint: "/users/me", method: "GET" }, context)).toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
  },
);
