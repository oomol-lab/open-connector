import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { proxy } from "./executors.ts";
import { clearPiHoleSessionCache } from "./runtime.ts";

const lanInstanceUrl = "http://192.168.150.53:8084";

function apiKeyCredential(): Extract<ResolvedCredential, { authType: "api_key" }> {
  return {
    authType: "api_key",
    apiKey: "app-password",
    values: { baseUrl: lanInstanceUrl, apiPath: "api" },
    profile: { accountId: "pi_hole:test", displayName: "Pi-hole test", grantedScopes: [] },
    metadata: {},
  };
}

function executionContext(): ExecutionContext {
  const credential = apiKeyCredential();
  return { getCredential: async () => credential };
}

interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body?: string;
}

describe("pi_hole proxy", () => {
  afterEach(() => {
    setDefaultGuardedFetchDnsLookup(null);
    setPrivateNetworkAccessAllowed(false);
    clearPiHoleSessionCache();
    vi.unstubAllGlobals();
  });

  it("logs in with the app password and proxies a session-authenticated request", async () => {
    setPrivateNetworkAccessAllowed(true);
    setDefaultGuardedFetchDnsLookup(async (hostname) => [
      { address: hostname === "192.168.150.53" ? "192.168.150.53" : "93.184.216.34", family: 4 },
    ]);

    const requests: CapturedRequest[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const headers = new Headers(init?.headers);
      requests.push({
        url: url.toString(),
        method: init?.method ?? "GET",
        headers,
        body: init?.body ? String(init?.body) : undefined,
      });
      if (url.pathname === "/api/auth") {
        return Response.json({
          session: { valid: true, sid: "sid-1", validity: 600, csrf: "csrf", totp: false, message: "ok" },
          took: 0.1,
        });
      }
      if (url.pathname === "/api/stats/summary") {
        return Response.json({ queries: 42, took: 0.1 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxy({ method: "GET", endpoint: "/stats/summary" }, executionContext());
    if (!result.ok) {
      throw new Error(`expected proxy success, got: ${result.error.message}`);
    }
    expect(result.response.status).toBe(200);
    expect(result.response.data).toMatchObject({ queries: 42 });

    const authCall = requests.find((request) => request.url.endsWith("/api/auth"))!;
    expect(authCall.method).toBe("POST");
    expect(JSON.parse(authCall.body ?? "{}")).toEqual({ password: "app-password" });

    const summaryCall = requests.find((request) => request.url.endsWith("/api/stats/summary"))!;
    expect(summaryCall.url).toBe(`${lanInstanceUrl}/api/stats/summary`);
    expect(summaryCall.headers.get("x-ftl-sid")).toBe("sid-1");
    expect(summaryCall.headers.get("accept")).toBe("application/json");
  });

  it("rejects the proxy base URL on a LAN instance without the private-network opt-in", async () => {
    setDefaultGuardedFetchDnsLookup(async (hostname) => [
      { address: hostname === "192.168.150.53" ? "192.168.150.53" : "93.184.216.34", family: 4 },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxy({ method: "GET", endpoint: "/stats/summary" }, executionContext());

    if (result.ok) {
      throw new Error("expected proxy to reject the LAN base URL");
    }
    expect(result.error.message).toContain("private or reserved IP addresses");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports missing credentials as an explicit 401", async () => {
    setPrivateNetworkAccessAllowed(true);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "192.168.150.53", family: 4 }]);
    vi.stubGlobal("fetch", vi.fn());

    const result = await proxy({ method: "GET", endpoint: "/stats/summary" }, { getCredential: async () => undefined });

    if (result.ok) {
      throw new Error("expected proxy to reject missing credentials");
    }
    expect(result.error.message).toContain("Configure pi_hole API key credentials first.");
  });
});
