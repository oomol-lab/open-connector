import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const tailscaleInstanceUrl = "https://n8n.tailnet.ts.net";
const lanInstanceUrl = "http://192.168.1.10:5678";

interface EntryPointOutcome {
  ok: boolean;
  message?: string;
  result?: unknown;
}

function apiKeyCredential(instanceUrl: string): ResolvedCredential {
  return {
    authType: "api_key",
    apiKey: "test-key",
    values: { instanceUrl },
    profile: { accountId: "n8n:test", displayName: "n8n test", grantedScopes: [] },
    metadata: {},
  };
}

/**
 * Exercise the three n8n egress entry points against one instance URL:
 * credential validation, an action executor, and the raw proxy. Each is wired to
 * the private-network opt-in separately, so a guard that is missing on any one of
 * them must show up as a difference here.
 */
async function runEntryPoints(instanceUrl: string): Promise<Record<string, EntryPointOutcome>> {
  const credential = apiKeyCredential(instanceUrl) as Extract<ResolvedCredential, { authType: "api_key" }>;
  const executionContext: ExecutionContext = { getCredential: async () => credential };

  const validate = await credentialValidators.apiKey!(
    { apiKey: credential.apiKey, values: credential.values },
    { fetcher: globalThis.fetch },
  ).then(
    (result) => ({ ok: true, result }),
    (error: Error) => ({ ok: false, message: error.message }),
  );
  const execute = await executors["n8n.list_workflows"]!({}, executionContext);
  const proxied = await proxy({ method: "GET", endpoint: "/workflows" }, executionContext);

  return {
    validate,
    execute: { ok: execute.ok, message: execute.error?.message },
    proxy: proxied.ok ? { ok: true } : { ok: false, message: proxied.error.message },
  };
}

function expectAllRejected(outcomes: Record<string, EntryPointOutcome>, message: string): void {
  for (const [name, outcome] of Object.entries(outcomes)) {
    expect(outcome, name).toMatchObject({ ok: false });
    expect(outcome.message, name).toContain(message);
  }
}

afterEach(() => {
  // `null`, not `undefined`: undefined would restore the automatic node:dns
  // default, and vitest.setup.ts disables real DNS for the whole suite.
  setDefaultGuardedFetchDnsLookup(null);
  setPrivateNetworkAccessAllowed(false);
  vi.unstubAllGlobals();
});

describe("n8n private-network access", () => {
  it("rejects a Tailscale-resolving instance on every entry point by default", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "100.64.0.12", family: 4 }]);

    expectAllRejected(
      await runEntryPoints(tailscaleInstanceUrl),
      "must not resolve to private or reserved IP addresses",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows credential validation, executor requests, and proxy requests when opted in", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "100.64.0.12", family: 4 }]);
    setPrivateNetworkAccessAllowed(true);

    const outcomes = await runEntryPoints(tailscaleInstanceUrl);

    expect(outcomes).toMatchObject({ validate: { ok: true }, execute: { ok: true }, proxy: { ok: true } });
    expect(outcomes.validate!.result).toMatchObject({
      metadata: { apiBaseUrl: `${tailscaleInstanceUrl}/api/v1` },
    });
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${tailscaleInstanceUrl}/api/v1/discover`,
      `${tailscaleInstanceUrl}/api/v1/workflows`,
      `${tailscaleInstanceUrl}/api/v1/workflows`,
    ]);
  });

  it("rejects a plain-HTTP LAN instance by default and reaches it once opted in", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    // An IPv4 literal is address-validated by the URL guard itself, so no DNS lookup runs.
    setDefaultGuardedFetchDnsLookup(null);

    expectAllRejected(await runEntryPoints(lanInstanceUrl), "instanceUrl must use https");
    expect(fetch).not.toHaveBeenCalled();

    setPrivateNetworkAccessAllowed(true);
    const outcomes = await runEntryPoints(lanInstanceUrl);

    expect(outcomes).toMatchObject({ validate: { ok: true }, execute: { ok: true }, proxy: { ok: true } });
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${lanInstanceUrl}/api/v1/discover`,
      `${lanInstanceUrl}/api/v1/workflows`,
      `${lanInstanceUrl}/api/v1/workflows`,
    ]);
  });

  it("rejects a private-hostname instance by default and reaches it once opted in", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "10.0.0.5", family: 4 }]);

    expectAllRejected(await runEntryPoints("https://n8n.internal"), "instanceUrl must not target local hosts");
    expect(fetch).not.toHaveBeenCalled();

    setPrivateNetworkAccessAllowed(true);

    expect(await runEntryPoints("https://n8n.internal")).toMatchObject({
      validate: { ok: true },
      execute: { ok: true },
      proxy: { ok: true },
    });
  });

  it("keeps loopback and metadata targets blocked even when opted in", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setPrivateNetworkAccessAllowed(true);

    setDefaultGuardedFetchDnsLookup(async () => [{ address: "127.0.0.1", family: 4 }]);
    expectAllRejected(
      await runEntryPoints(tailscaleInstanceUrl),
      "must not resolve to private or reserved IP addresses",
    );

    setDefaultGuardedFetchDnsLookup(null);
    expectAllRejected(
      await runEntryPoints("http://127.0.0.1:5678"),
      "must not target private or reserved IP addresses",
    );
    expectAllRejected(
      await runEntryPoints("http://169.254.169.254"),
      "must not target private or reserved IP addresses",
    );
    expectAllRejected(await runEntryPoints("https://metadata.google.internal"), "must not target cloud metadata hosts");

    expect(fetch).not.toHaveBeenCalled();
  });
});
