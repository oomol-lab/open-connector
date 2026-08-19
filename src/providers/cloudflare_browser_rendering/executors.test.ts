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

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("Cloudflare Browser Run OAuth", () => {
  it("validates OAuth with the current Cloudflare user", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        success: true,
        result: {
          id: "user-1",
          email: "ada@example.com",
          first_name: "Ada",
          last_name: "Lovelace",
          username: "ada",
        },
      }),
    );

    const result = await credentialValidators.oauth2!(oauthCredential({}), { fetcher: fetch });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/user",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer oauth-access-token" }) }),
    );
    expect(result).toMatchObject({
      profile: { accountId: "user-1", displayName: "Ada Lovelace" },
      metadata: { userId: "user-1", email: "ada@example.com", validationEndpoint: "/user" },
    });
    expect(result?.metadata?.accountId).toBeUndefined();
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
});
