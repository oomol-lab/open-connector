import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const tailscaleInstanceUrl = "https://gitea.tailnet.ts.net";
const lanInstanceUrl = "http://192.168.1.10:3000";

interface EntryPointOutcome {
  ok: boolean;
  message?: string;
  result?: unknown;
}

function apiKeyCredential(baseUrl: string): Extract<ResolvedCredential, { authType: "api_key" }> {
  return {
    authType: "api_key",
    apiKey: "test-token",
    values: { baseUrl },
    profile: { accountId: "gitea:test", displayName: "Gitea test", grantedScopes: [] },
    metadata: {},
  };
}

async function runEntryPoints(baseUrl: string): Promise<Record<string, EntryPointOutcome>> {
  const credential = apiKeyCredential(baseUrl);
  const executionContext: ExecutionContext = { getCredential: async () => credential };

  const validate = await credentialValidators.apiKey!(
    { apiKey: credential.apiKey, values: credential.values },
    { fetcher: globalThis.fetch },
  ).then(
    (result) => ({ ok: true, result }),
    (error: Error) => ({ ok: false, message: error.message }),
  );
  const execute = await executors["gitea.get_current_user"]!({}, executionContext);
  const proxied = await proxy({ method: "GET", endpoint: "/user" }, executionContext);

  return {
    validate,
    execute: { ok: execute.ok, message: execute.error?.message },
    proxy: proxied.ok ? { ok: true } : { ok: false, message: proxied.error.message },
  };
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

describe("Gitea private-network access", () => {
  it("keeps public HTTPS instances working by default", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ id: 7, login: "alice" }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

    expectAllAccepted(await runEntryPoints("https://gitea.example.com"));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

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
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ id: 7, login: "alice" }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "100.64.0.12", family: 4 }]);
    setPrivateNetworkAccessAllowed(true);

    const outcomes = await runEntryPoints(tailscaleInstanceUrl);

    expectAllAccepted(outcomes);
    expect(outcomes.validate!.result).toMatchObject({ metadata: { baseUrl: tailscaleInstanceUrl } });
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${tailscaleInstanceUrl}/api/v1/user`,
      `${tailscaleInstanceUrl}/api/v1/user`,
      `${tailscaleInstanceUrl}/api/v1/user`,
    ]);
  });

  it("rejects a plain-HTTP LAN instance by default and reaches it once opted in", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ id: 7, login: "alice" }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);

    expectAllRejected(await runEntryPoints(lanInstanceUrl), "must not target private or reserved IP addresses");
    expect(fetch).not.toHaveBeenCalled();

    setPrivateNetworkAccessAllowed(true);
    expectAllAccepted(await runEntryPoints(lanInstanceUrl));
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${lanInstanceUrl}/api/v1/user`,
      `${lanInstanceUrl}/api/v1/user`,
      `${lanInstanceUrl}/api/v1/user`,
    ]);
  });

  it("requires the opt-in for public plain-HTTP instances", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

    expectAllRejected(await runEntryPoints("http://gitea.example.com"), "Base URL must use https");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a private hostname by default and reaches it once opted in", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ id: 7, login: "alice" }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "10.0.0.5", family: 4 }]);

    expectAllRejected(await runEntryPoints("https://gitea.internal"), "must not target local hosts");
    expect(fetch).not.toHaveBeenCalled();

    setPrivateNetworkAccessAllowed(true);
    expectAllAccepted(await runEntryPoints("https://gitea.internal"));
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
      await runEntryPoints("http://127.0.0.1:3000"),
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
