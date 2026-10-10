import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

function oauthCredential(metadata: Record<string, unknown>): Extract<ResolvedCredential, { authType: "oauth2" }> {
  return {
    authType: "oauth2",
    accessToken: "oauth-access-token",
    tokenType: "Bearer",
    profile: {
      accountId: "cloudflare:test",
      displayName: "Cloudflare Browser Run",
      grantedScopes: ["memberships.read", "browser-rendering.read", "browser-rendering.write"],
    },
    metadata,
  };
}

function executionContext(credential: ResolvedCredential): ExecutionContext {
  return { getCredential: async () => credential };
}

function apiKeyCredential(): Extract<ResolvedCredential, { authType: "api_key" }> {
  return {
    authType: "api_key",
    apiKey: "api-key-token",
    values: { accountId: "account-1" },
    profile: {
      accountId: "account-1",
      displayName: "Cloudflare Browser Run",
      grantedScopes: [],
    },
    metadata: { accountId: "account-1" },
  };
}
afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("Cloudflare Browser Run OAuth", () => {
  it("validates OAuth by resolving the one accessible Cloudflare account", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        success: true,
        result: [
          {
            id: "membership-1",
            account: { id: "account-1", name: "Amplift", type: "standard" },
            status: "accepted",
          },
        ],
        result_info: { page: 1, per_page: 50, count: 1, total_count: 1, total_pages: 1 },
      }),
    );

    const result = await credentialValidators.oauth2!(oauthCredential({}), { fetcher: fetch });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/memberships?page=1&per_page=50&status=accepted",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer oauth-access-token" }) }),
    );
    expect(result).toMatchObject({
      profile: { accountId: "account-1", displayName: "Amplift" },
      metadata: { accountId: "account-1", accountName: "Amplift", accountType: "standard" },
    });
  });

  it("lists OAuth accounts through Cloudflare memberships", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        success: true,
        result: [
          {
            id: "membership-1",
            account: { id: "account-1", name: "Amplift", type: "standard" },
            status: "accepted",
          },
        ],
        result_info: { page: 1, per_page: 50, count: 1, total_count: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);

    const result = await executors["cloudflare_browser_rendering.list_accounts"]!(
      {},
      executionContext(oauthCredential({ accountId: "account-1" })),
    );

    expect(result).toEqual({
      ok: true,
      output: {
        accounts: [{ id: "account-1", name: "Amplift", type: "standard" }],
        resultInfo: { page: 1, perPage: 50, count: 1, totalCount: 1 },
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/memberships?page=1&per_page=50&status=accepted",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer oauth-access-token" }) }),
    );
  });

  it("executes Browser Run with the OAuth bearer token and resolved account", async () => {
    const fetch = vi.fn(async () => Response.json({ success: true, result: "# OpenMeld" }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);

    const result = await executors["cloudflare_browser_rendering.get_markdown"]!(
      { url: "https://openmeld.ai" },
      executionContext(oauthCredential({ accountId: "account-1" })),
    );

    expect(result).toEqual({ ok: true, output: { markdown: "# OpenMeld" } });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-1/browser-rendering/markdown",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer oauth-access-token" }),
      }),
    );
  });

  it("uses OAuth for raw proxy requests", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ success: true, result: [] }),
    );
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);

    const result = await proxy(
      { method: "GET", endpoint: "/accounts" },
      executionContext(oauthCredential({ accountId: "account-1" })),
    );

    expect(result).toMatchObject({ ok: true });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.cloudflare.com/client/v4/accounts");
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer oauth-access-token");
  });

  it("keeps API token actions working", async () => {
    const fetch = vi.fn(async () => Response.json({ success: true, result: "# OpenMeld" }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);

    const result = await executors["cloudflare_browser_rendering.get_markdown"]!(
      { url: "https://openmeld.ai" },
      executionContext(apiKeyCredential()),
    );

    expect(result).toEqual({ ok: true, output: { markdown: "# OpenMeld" } });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/account-1/browser-rendering/markdown",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer api-key-token" }) }),
    );
  });
  it("requires an explicit accessible account when OAuth can reach more than one", async () => {
    const fetch = vi.fn(async () => Response.json({ success: true, result: "# OpenMeld" }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(null);
    const credential = oauthCredential({
      availableAccounts: [
        { id: "account-1", name: "Amplift" },
        { id: "account-2", name: "Personal" },
      ],
    });

    const missingAccount = await executors["cloudflare_browser_rendering.get_markdown"]!(
      { url: "https://openmeld.ai" },
      executionContext(credential),
    );
    const selectedAccount = await executors["cloudflare_browser_rendering.get_markdown"]!(
      { accountId: "account-1", url: "https://openmeld.ai" },
      executionContext(credential),
    );

    expect(missingAccount).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("accountId is required") },
    });
    expect(selectedAccount).toEqual({ ok: true, output: { markdown: "# OpenMeld" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("directs OAuth callers to list_accounts when no Cloudflare account is selected", async () => {
    const result = await executors["cloudflare_browser_rendering.get_markdown"]!(
      { url: "https://openmeld.ai" },
      executionContext(oauthCredential({})),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        message:
          "accountId is required for this Cloudflare Browser Run action. Use list_accounts to find an accessible Cloudflare account ID.",
      },
    });
  });
});
