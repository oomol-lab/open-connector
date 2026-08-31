import type { ExecutionContext, ResolvedCredential } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { crossOriginSafeHeaders } from "../core/guarded-fetch.ts";
import { proxy as arcgisOnlineProxy } from "./arcgis_online/executors.ts";
import { providerFetch } from "./provider-runtime.ts";
import { proxy as scopusProxy } from "./scopus/executors.ts";

interface RecordedHop {
  url: string;
  headers: Headers;
}

const arcgisCredential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "SECRET-ESRI-KEY",
  values: { apiKey: "SECRET-ESRI-KEY" },
  profile: { accountId: "acct", displayName: "ArcGIS Online API Key", grantedScopes: [] },
  metadata: {},
};

const scopusCredential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "SECRET-ELS-APIKEY",
  values: { apiKey: "SECRET-ELS-APIKEY", institutionToken: "SECRET-INSTTOKEN" },
  profile: { accountId: "acct", displayName: "Scopus API Key", grantedScopes: [] },
  metadata: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider egress on cross-origin redirects", () => {
  it("does not forward the ArcGIS Online proxy credential header to the redirect target", async () => {
    const hops = stubCrossOriginRedirect();

    const result = await arcgisOnlineProxy({ method: "GET", endpoint: "/suggest" }, contextFor(arcgisCredential));

    expect(result.ok).toBe(true);
    expect(hops).toHaveLength(2);
    expect(hops[0]?.headers.get("x-esri-authorization")).toBe("Bearer SECRET-ESRI-KEY");
    expect(hops[1]?.url).toBe("https://attacker.example.net/collect");
    expect(hops[1]?.headers.has("x-esri-authorization")).toBe(false);
    expect(headerNames(hops[1])).toEqual(safeSubsetOf(hops[0]));
  });

  it("does not forward the Scopus institution token to the redirect target", async () => {
    const hops = stubCrossOriginRedirect();

    const result = await scopusProxy({ method: "GET", endpoint: "/search/scopus" }, contextFor(scopusCredential));

    expect(result.ok).toBe(true);
    expect(hops).toHaveLength(2);
    expect(hops[0]?.headers.get("x-els-insttoken")).toBe("SECRET-INSTTOKEN");
    expect(hops[1]?.url).toBe("https://attacker.example.net/collect");
    expect(hops[1]?.headers.has("x-els-insttoken")).toBe(false);
    expect(hops[1]?.headers.has("x-els-apikey")).toBe(false);
    expect(headerNames(hops[1])).toEqual(safeSubsetOf(hops[0]));
  });

  it("does not forward an action-path credential header through the shared provider fetch", async () => {
    const hops = stubCrossOriginRedirect();

    await providerFetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": "SECRET-XI", "x-request-id": "req-1" },
    });

    expect(hops).toHaveLength(2);
    expect(hops[0]?.headers.get("xi-api-key")).toBe("SECRET-XI");
    expect(hops[1]?.url).toBe("https://attacker.example.net/collect");
    expect(hops[1]?.headers.has("xi-api-key")).toBe(false);
    expect(headerNames(hops[1])).toEqual(safeSubsetOf(hops[0]));
    expect(hops[1]?.headers.get("x-request-id")).toBe("req-1");
  });
});

function contextFor(credential: ResolvedCredential): ExecutionContext {
  return { getCredential: async () => credential };
}

/** Stub the global fetch so hop 1 answers 302 to a different origin and hop 2 succeeds. */
function stubCrossOriginRedirect(): RecordedHop[] {
  const hops: RecordedHop[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    hops.push({
      url: input instanceof Request ? input.url : String(input),
      headers: new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
    });
    if (hops.length === 1) {
      return new Response(null, { status: 302, headers: { location: "https://attacker.example.net/collect" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  return hops;
}

/**
 * Sorted header names a hop was issued with. The cross-origin rule is
 * deny-by-default, so each case asserts the exact surviving set rather than the
 * absence of names that look like credentials: a credential header nobody
 * recognizes as one is precisely the case this layer exists to cover.
 */
function headerNames(hop: RecordedHop | undefined): string[] {
  return [...new Headers(hop?.headers).keys()].sort();
}

/**
 * The names from the first hop the cross-origin rule is allowed to keep. Deriving
 * the expectation this way keeps the exact-set assertion strong while leaving the
 * headers a provider happens to send its own concern: a provider dropping its
 * `accept` default must not fail a guarded-fetch regression test.
 */
function safeSubsetOf(hop: RecordedHop | undefined): string[] {
  return headerNames(hop).filter((name) => crossOriginSafeHeaders.has(name));
}
