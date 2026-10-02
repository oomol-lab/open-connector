import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const creditUsagePath = "/v2/team/credit-usage";

interface EntryPointOutcome {
  ok: boolean;
  message?: string;
  result?: unknown;
}

function apiKeyCredential(values: Record<string, string>): Extract<ResolvedCredential, { authType: "api_key" }> {
  return {
    authType: "api_key",
    apiKey: "fc-test",
    values: { apiKey: "fc-test", ...values },
    profile: { accountId: "api_key", displayName: "Firecrawl API Key", grantedScopes: [] },
    metadata: {},
  };
}

async function runEntryPoints(values: Record<string, string>): Promise<Record<string, EntryPointOutcome>> {
  const credential = apiKeyCredential(values);
  const executionContext: ExecutionContext = { getCredential: async () => credential };

  const validate = await credentialValidators.apiKey!(
    { apiKey: credential.apiKey, values: credential.values },
    { fetcher: globalThis.fetch },
  ).then(
    (result) => ({ ok: true, result }),
    (error: Error) => ({ ok: false, message: error.message }),
  );
  const execute = await executors["firecrawl.credit_usage_get"]!({}, executionContext);
  const proxied = await proxy({ method: "GET", endpoint: creditUsagePath }, executionContext);

  return {
    validate,
    execute: { ok: execute.ok, message: execute.error?.message },
    proxy: proxied.ok ? { ok: true } : { ok: false, message: proxied.error.message },
  };
}

function stubFirecrawlFetch(): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ success: true, data: { remainingCredits: 1000 } }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function requestedUrls(fetch: ReturnType<typeof vi.fn>): string[] {
  return fetch.mock.calls.map(([url]) => String(url));
}

function expectAllAccepted(outcomes: Record<string, EntryPointOutcome>): void {
  for (const [name, outcome] of Object.entries(outcomes)) {
    expect(outcome, name).toMatchObject({ ok: true });
  }
}

function expectAllRejected(outcomes: Record<string, EntryPointOutcome>, message: string): void {
  for (const [name, outcome] of Object.entries(outcomes)) {
    expect(outcome, name).toMatchObject({ ok: false });
    expect(outcome.message, name).toContain(message);
  }
}

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  setPrivateNetworkAccessAllowed(false);
  vi.unstubAllGlobals();
});

describe("Firecrawl API base URL", () => {
  it("uses the Firecrawl cloud API when no base URL is configured", async () => {
    const fetch = stubFirecrawlFetch();
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

    const outcomes = await runEntryPoints({});

    expectAllAccepted(outcomes);
    expect(outcomes.validate!.result).toMatchObject({ metadata: { apiBaseUrl: "https://api.firecrawl.dev" } });
    expect(requestedUrls(fetch)).toEqual([
      `https://api.firecrawl.dev${creditUsagePath}`,
      `https://api.firecrawl.dev${creditUsagePath}`,
      `https://api.firecrawl.dev${creditUsagePath}`,
    ]);
    const headers = new Headers(fetch.mock.calls[0]![1]!.headers);
    expect(headers.get("authorization")).toBe("Bearer fc-test");
  });

  it("sends validation, action, and proxy requests to a self-hosted instance", async () => {
    const fetch = stubFirecrawlFetch();
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

    const outcomes = await runEntryPoints({ baseUrl: " http://firecrawl.example.com:3002/ " });

    expectAllAccepted(outcomes);
    expect(outcomes.validate!.result).toMatchObject({
      metadata: { apiBaseUrl: "http://firecrawl.example.com:3002" },
    });
    expect(requestedUrls(fetch)).toEqual([
      `http://firecrawl.example.com:3002${creditUsagePath}`,
      `http://firecrawl.example.com:3002${creditUsagePath}`,
      `http://firecrawl.example.com:3002${creditUsagePath}`,
    ]);
  });

  it("keeps a reverse-proxy path prefix in front of the API path", async () => {
    const fetch = stubFirecrawlFetch();
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

    expectAllAccepted(await runEntryPoints({ baseUrl: "https://tools.example.com/firecrawl/?ignored=1#section" }));
    expect(requestedUrls(fetch)).toEqual([
      `https://tools.example.com/firecrawl${creditUsagePath}`,
      `https://tools.example.com/firecrawl${creditUsagePath}`,
      `https://tools.example.com/firecrawl${creditUsagePath}`,
    ]);
  });

  it("rejects a private-network instance by default and reaches it once opted in", async () => {
    const fetch = stubFirecrawlFetch();
    const lanInstanceUrl = "http://192.168.1.10:3002";

    expectAllRejected(
      await runEntryPoints({ baseUrl: lanInstanceUrl }),
      "baseUrl must not target private or reserved IP addresses",
    );
    expect(fetch).not.toHaveBeenCalled();

    setPrivateNetworkAccessAllowed(true);
    expectAllAccepted(await runEntryPoints({ baseUrl: lanInstanceUrl }));
    expect(requestedUrls(fetch)).toEqual([
      `${lanInstanceUrl}${creditUsagePath}`,
      `${lanInstanceUrl}${creditUsagePath}`,
      `${lanInstanceUrl}${creditUsagePath}`,
    ]);
  });

  it("rejects a public hostname that resolves to a private address by default", async () => {
    const fetch = stubFirecrawlFetch();
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "10.0.0.5", family: 4 }]);

    expectAllRejected(
      await runEntryPoints({ baseUrl: "https://firecrawl.example.com" }),
      "must not resolve to private or reserved IP addresses",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps loopback and cloud metadata targets blocked even when private networks are allowed", async () => {
    const fetch = stubFirecrawlFetch();
    setPrivateNetworkAccessAllowed(true);

    expectAllRejected(await runEntryPoints({ baseUrl: "http://127.0.0.1:3002" }), "must not target");
    expectAllRejected(await runEntryPoints({ baseUrl: "http://169.254.169.254" }), "must not target");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects base URLs with embedded credentials", async () => {
    const fetch = stubFirecrawlFetch();
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

    expectAllRejected(
      await runEntryPoints({ baseUrl: "https://user:secret@firecrawl.example.com" }),
      "baseUrl must not include credentials",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
