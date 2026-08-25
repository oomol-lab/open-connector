import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "boldsign-token",
  values: { region: "eu" },
  profile: { accountId: "boldsign:eu", displayName: "BoldSign EU API Key", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("BoldSign region resolver DNS", () => {
  it("rejects an allowlisted API host that resolves to cloud metadata before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "169.254.169.254", family: 4 }]);

    const result = await executors["boldsign.get_api_credits"]!({}, context);

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must not resolve to private or reserved IP addresses") },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
