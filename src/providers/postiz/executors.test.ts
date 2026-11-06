import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const cloudApiBaseUrl = "https://api.postiz.com/public/v1";
const lanInstanceUrl = "http://192.168.31.10:5005";
const selfHostedInstanceUrl = "https://postiz.example.com";

interface EntryPointOutcome {
  ok: boolean;
  message?: string;
  result?: unknown;
}

function apiKeyCredential(baseUrl?: string): ResolvedCredential {
  return {
    authType: "api_key",
    apiKey: "postiz-test-key",
    values: { apiKey: "postiz-test-key", baseUrl: baseUrl ?? "" },
    profile: { accountId: "postiz:test", displayName: "Postiz test", grantedScopes: [] },
    metadata: {},
  };
}

function executionContext(credential: ResolvedCredential): ExecutionContext {
  return { getCredential: async () => credential };
}

/**
 * Exercise the three postiz egress entry points with one credential: credential
 * validation, the list_integrations action executor, and the raw proxy.
 */
async function runEntryPoints(baseUrl?: string): Promise<Record<string, EntryPointOutcome>> {
  const credential = apiKeyCredential(baseUrl) as Extract<ResolvedCredential, { authType: "api_key" }>;
  const context = executionContext(credential);

  const validate = await credentialValidators.apiKey!(
    { apiKey: credential.apiKey, values: credential.values },
    {
      fetcher: async (input: RequestInfo | URL) =>
        String(input).endsWith("/is-connected") ? Response.json({ connected: true }) : Response.json([]),
    },
  ).then(
    (result) => ({ ok: true, result }),
    (error: Error) => ({ ok: false, message: error.message }),
  );
  const execute = await executors["postiz.list_integrations"]!({}, context);
  const proxied = await proxy({ method: "GET", endpoint: "/integrations" }, context);

  return {
    validate,
    execute: { ok: execute.ok, message: execute.error?.message },
    proxy: proxied.ok ? { ok: true } : { ok: false, message: proxied.error.message },
  };
}

function expectAllRejected(outcomes: Record<string, EntryPointOutcome>, message?: string): void {
  for (const [name, outcome] of Object.entries(outcomes)) {
    expect(outcome, name).toMatchObject({ ok: false });
    if (message !== undefined) {
      expect(outcome.message, name).toContain(message);
    }
  }
}

async function executeWithFetch(
  action: string,
  input: Record<string, unknown>,
  baseUrl: string | undefined,
  respond: (url: URL, init: RequestInit) => Response,
): Promise<{ ok: boolean; output?: unknown; error?: { message?: string }; urls: string[]; bodies: unknown[] }> {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    bodies.push(init.body === undefined ? undefined : JSON.parse(String(init.body)));
    return respond(url, init);
  });
  vi.stubGlobal("fetch", fetch);
  try {
    const credential = apiKeyCredential(baseUrl) as Extract<ResolvedCredential, { authType: "api_key" }>;
    const result = await executors[`postiz.${action}`]!(input, executionContext(credential));
    return { ...result, urls, bodies } as typeof result & { urls: string[]; bodies: unknown[] };
  } finally {
    vi.unstubAllGlobals();
  }
}

afterEach(() => {
  // `null`, not `undefined`: undefined would restore the automatic node:dns
  // default, and vitest.setup.ts disables real DNS for the whole suite.
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("postiz base URL resolution", () => {
  it("targets the Postiz cloud API when the base URL is empty", async () => {
    const result = await executeWithFetch("list_integrations", {}, undefined, () => Response.json([]));
    expect(result).toMatchObject({ ok: true });
    expect(result.urls).toEqual([`${cloudApiBaseUrl}/integrations`]);
  });

  it("appends /api/public/v1 to a bare self-hosted instance root", async () => {
    const result = await executeWithFetch("list_integrations", {}, selfHostedInstanceUrl, () => Response.json([]));
    expect(result).toMatchObject({ ok: true });
    expect(result.urls).toEqual([`${selfHostedInstanceUrl}/api/public/v1/integrations`]);
  });

  it("keeps a reverse-proxy /api prefix and appends only /public/v1", async () => {
    const result = await executeWithFetch("list_integrations", {}, `${selfHostedInstanceUrl}/api`, () =>
      Response.json([]),
    );
    expect(result).toMatchObject({ ok: true });
    expect(result.urls).toEqual([`${selfHostedInstanceUrl}/api/public/v1/integrations`]);
  });

  it("keeps an already complete /api/public/v1 base URL", async () => {
    const result = await executeWithFetch("list_integrations", {}, `${selfHostedInstanceUrl}/api/public/v1/`, () =>
      Response.json([]),
    );
    expect(result).toMatchObject({ ok: true });
    expect(result.urls).toEqual([`${selfHostedInstanceUrl}/api/public/v1/integrations`]);
  });

  it("sends the API key as the raw Authorization header", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json([]));
    vi.stubGlobal("fetch", fetch);
    const credential = apiKeyCredential(selfHostedInstanceUrl) as Extract<ResolvedCredential, { authType: "api_key" }>;
    const result = await executors["postiz.list_integrations"]!({}, executionContext(credential));
    expect(result.ok).toBe(true);
    const headers = new Headers(fetch.mock.calls[0]![1]!.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("postiz-test-key");
  });
});

describe("postiz action wiring", () => {
  it("passes the group filter and returns the integrations collection", async () => {
    const result = await executeWithFetch("list_integrations", { group: "grp_1" }, selfHostedInstanceUrl, () =>
      Response.json([{ id: "int_1", name: "Channel", identifier: "x" }]),
    );
    expect(result).toMatchObject({ ok: true });
    expect(result.urls![0]).toContain("group=grp_1");
    expect(result.output).toEqual([{ id: "int_1", name: "Channel", identifier: "x" }]);
  });

  it("posts the create_post payload to /posts", async () => {
    const payload = { type: "draft", posts: [] };
    const result = await executeWithFetch("create_post", payload, selfHostedInstanceUrl, () =>
      Response.json([{ postId: "p1", integration: "int_1" }]),
    );
    expect(result).toMatchObject({ ok: true });
    expect(result.urls![0]).toBe(`${selfHostedInstanceUrl}/api/public/v1/posts`);
    expect(result.bodies![0]).toEqual(payload);
    expect(result.output).toEqual([{ postId: "p1", integration: "int_1" }]);
  });

  it("surfaces provider error messages from non-2FA responses", async () => {
    const result = await executeWithFetch("list_integrations", {}, selfHostedInstanceUrl, () =>
      Response.json({ message: "Unauthorized" }, { status: 401 }),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("Unauthorized");
  });
});

describe("postiz credential validation", () => {
  it("confirms the key against /is-connected on the resolved base URL and stores it in metadata", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ connected: true }));
    vi.stubGlobal("fetch", fetch);
    const result = await credentialValidators.apiKey!(
      { apiKey: "postiz-test-key", values: { apiKey: "postiz-test-key", baseUrl: selfHostedInstanceUrl } },
      { fetcher: globalThis.fetch },
    );
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${selfHostedInstanceUrl}/api/public/v1/is-connected`,
    ]);
    expect(result).toMatchObject({
      metadata: { apiBaseUrl: `${selfHostedInstanceUrl}/api/public/v1` },
      grantedScopes: [],
    });
  });

  it("rejects a key the instance does not confirm", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ connected: false }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "postiz-test-key", values: { apiKey: "postiz-test-key", baseUrl: "" } },
        { fetcher: globalThis.fetch },
      ),
    ).rejects.toThrow("Postiz did not confirm the API key connection");
  });
});

describe("postiz private-network access", () => {
  it("rejects a plain-HTTP LAN instance on every entry point by default", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);

    const outcomes = await runEntryPoints(lanInstanceUrl);
    for (const [name, outcome] of Object.entries(outcomes)) {
      expect(outcome, name).toMatchObject({ ok: false });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows validation, actions, and proxy requests against the LAN instance once opted in", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json([]));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      const outcomes = await runEntryPoints(lanInstanceUrl);

      expect(outcomes).toMatchObject({ validate: { ok: true }, execute: { ok: true }, proxy: { ok: true } });
      expect(outcomes.validate!.result).toMatchObject({
        metadata: { apiBaseUrl: `${lanInstanceUrl}/api/public/v1` },
      });
      // The validator uses its own guarded fetcher; the global stub sees only the
      // executor and proxy calls.
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
        `${lanInstanceUrl}/api/public/v1/integrations`,
        `${lanInstanceUrl}/api/public/v1/integrations`,
      ]);
    });
  });

  it("rejects a plain-HTTP public host by default and reaches it once opted in", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json([]));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

    expectAllRejected(await runEntryPoints("http://selfhosted.example.org"), "baseUrl must use https");
    expect(fetch).not.toHaveBeenCalled();

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      const outcomes = await runEntryPoints("http://selfhosted.example.org");
      expect(outcomes).toMatchObject({ validate: { ok: true }, execute: { ok: true }, proxy: { ok: true } });
      expect(outcomes.validate!.result).toMatchObject({
        metadata: { apiBaseUrl: "http://selfhosted.example.org/api/public/v1" },
      });
    });
  });

  it("still blocks loopback and metadata targets even when opted in", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);

    return withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      for (const url of ["http://127.0.0.1:5005", "http://169.254.169.254"]) {
        const outcomes = await runEntryPoints(url);
        for (const [name, outcome] of Object.entries(outcomes)) {
          expect(outcome, `${url} ${name}`).toMatchObject({ ok: false });
        }
      }
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
