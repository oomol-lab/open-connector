import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
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

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expectAllAccepted(await runEntryPoints({ baseUrl: lanInstanceUrl }));
      expect(requestedUrls(fetch)).toEqual([
        `${lanInstanceUrl}${creditUsagePath}`,
        `${lanInstanceUrl}${creditUsagePath}`,
        `${lanInstanceUrl}${creditUsagePath}`,
      ]);
    });
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
    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expectAllRejected(await runEntryPoints({ baseUrl: "http://127.0.0.1:3002" }), "must not target");
      expectAllRejected(await runEntryPoints({ baseUrl: "http://169.254.169.254" }), "must not target");
      expect(fetch).not.toHaveBeenCalled();
    });
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

describe("Firecrawl deep research", () => {
  function stubAgentFetch(payloads: unknown[]): ReturnType<typeof vi.fn> {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(payloads.shift()));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
    return fetch;
  }

  const executionContext: ExecutionContext = { getCredential: async () => apiKeyCredential({}) };
  const reportSchema = {
    report: { type: "string", description: "A markdown report that answers the question." },
    sources: {
      type: "array",
      description: "The sources the report is based on.",
      items: {
        type: "object",
        properties: { url: { type: "string" }, title: { type: "string" } },
        required: ["url", "title"],
      },
    },
  };

  it("starts an agent run with the prompts merged and the removed v1 limits dropped", async () => {
    const fetch = stubAgentFetch([{ success: true, id: "job-1" }]);
    const studiesSchema = { type: "object", properties: { studies: { type: "array" } } };

    const result = await executors["firecrawl.deep_research"]!(
      {
        query: "How do EVs and gas cars compare on lifetime emissions?",
        systemPrompt: "Prefer peer-reviewed sources.",
        analysisPrompt: "Answer in three sections.",
        jsonOptions: { prompt: "List the studies you used.", schema: studiesSchema },
        maxCredits: 500,
        maxUrls: 20,
        maxDepth: 3,
        timeLimit: 120,
        formats: ["markdown", "json"],
      },
      executionContext,
    );

    expect(result).toEqual({ ok: true, output: { success: true, id: "job-1" } });
    expect(requestedUrls(fetch)).toEqual(["https://api.firecrawl.dev/v2/agent"]);
    const init = fetch.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      prompt:
        "How do EVs and gas cars compare on lifetime emissions?\n\nPrefer peer-reviewed sources.\n\nAnswer in three sections.\n\nList the studies you used.",
      schema: {
        type: "object",
        properties: { ...reportSchema, json: studiesSchema },
        required: ["report", "sources", "json"],
      },
      maxCredits: 500,
    });
  });

  it("asks only for the report and sources when no JSON schema is given", async () => {
    const fetch = stubAgentFetch([{ success: true, id: "job-2" }]);

    await executors["firecrawl.deep_research"]!({ query: "What is Firecrawl?" }, executionContext);

    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({
      prompt: "What is Firecrawl?",
      schema: { type: "object", properties: reportSchema, required: ["report", "sources"] },
    });
  });

  it("returns a completed agent run in the deep research status shape", async () => {
    const sources = [{ url: "https://example.com/study", title: "Lifetime emissions study" }];
    const fetch = stubAgentFetch([
      {
        success: true,
        status: "completed",
        data: { report: "# Findings", sources, json: { studies: ["Lifetime emissions study"] } },
        expiresAt: "2026-12-01T00:00:00.000Z",
        creditsUsed: 42,
      },
    ]);

    const result = await executors["firecrawl.get_deep_research_status"]!({ id: "job-1" }, executionContext);

    expect(requestedUrls(fetch)).toEqual(["https://api.firecrawl.dev/v2/agent/job-1"]);
    expect(result).toEqual({
      ok: true,
      output: {
        success: true,
        status: "completed",
        data: { finalAnalysis: "# Findings", sources, json: { studies: ["Lifetime emissions study"] } },
        sources,
        expiresAt: "2026-12-01T00:00:00.000Z",
        creditsUsed: 42,
      },
    });
  });

  it("passes processing and failed agent runs through unchanged", async () => {
    const processing = { success: true, status: "processing", expiresAt: "2026-12-01T00:00:00.000Z" };
    const failed = {
      success: true,
      status: "failed",
      error: "Agent reached max credits",
      stopReason: "credit_limit_reached",
    };
    const fetch = stubAgentFetch([processing, failed]);

    expect(await executors["firecrawl.get_deep_research_status"]!({ id: "job-1" }, executionContext)).toEqual({
      ok: true,
      output: processing,
    });
    expect(await executors["firecrawl.get_deep_research_status"]!({ id: "job-1" }, executionContext)).toEqual({
      ok: true,
      output: failed,
    });
    expect(requestedUrls(fetch)).toEqual([
      "https://api.firecrawl.dev/v2/agent/job-1",
      "https://api.firecrawl.dev/v2/agent/job-1",
    ]);
  });
});
