import type { ExecutionContext, ResolvedCredential } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { registeredProxyExecutors } from "./proxy.registry.ts";

const grafanaCredential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "glsa_test_service_account_token",
  values: { baseUrl: "https://example-stack.grafana.net" },
  profile: { accountId: "1", displayName: "Main Org.", grantedScopes: [] },
  metadata: {},
};

const executionContext: ExecutionContext = {
  getCredential: async () => grafanaCredential,
};

function stubFetchSequence(responses: Response[]): Array<{ url: string; init: RequestInit | undefined }> {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), init });
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected extra request");
    }
    return response;
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("grafana proxy", () => {
  it("forwards /api requests to the credential baseUrl with a bearer token", async () => {
    const calls = stubFetchSequence([
      new Response(JSON.stringify({ results: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ]);

    const result = await registeredProxyExecutors.grafana!(
      { method: "POST", endpoint: "/api/ds/query", body: { queries: [] } },
      executionContext,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.response.status).toBe(200);
    expect(calls.map((call) => call.url)).toEqual(["https://example-stack.grafana.net/api/ds/query"]);
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer glsa_test_service_account_token");
  });

  it("rejects endpoints outside /api", async () => {
    const calls = stubFetchSequence([]);

    const result = await registeredProxyExecutors.grafana!({ method: "GET", endpoint: "/login" }, executionContext);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.message).toContain("endpoint is not supported");
    expect(calls).toHaveLength(0);
  });
});
