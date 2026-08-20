import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { proxy } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "langsmith-api-key",
  values: { region: "us" },
  profile: { accountId: "workspace", displayName: "Workspace", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
});

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("LangSmith proxy region routing", () => {
  it("routes an explicit region to its official origin", async () => {
    const requests: Request[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(input instanceof Request ? input : new Request(input, init));
      return Response.json({ ok: true });
    });

    const result = await proxy({ method: "GET", endpoint: "/runs", query: { region: "eu" } }, context);

    expect(result.ok).toBe(true);
    expect(requests[0]?.url).toBe("https://eu.api.smith.langchain.com/runs");
    expect(requests[0]?.headers.get("x-api-key")).toBe("langsmith-api-key");
  });

  it("rejects unknown regions before sending the API key", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await proxy({ method: "GET", endpoint: "/runs", query: { region: "unknown" } }, context);

    expect(result).toMatchObject({
      ok: false,
      error: { message: "langsmith region must be one of us, eu, apac, or aws_us" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
