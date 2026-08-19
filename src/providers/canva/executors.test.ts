import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { createCanvaCredentialValidators, createCanvaExecutors } from "./executors.ts";

interface FetchCall {
  url: string;
  authorization: string | null;
}

const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "test-access-token",
  tokenType: "Bearer",
  profile: { accountId: "canva:test", displayName: "Canva test", grantedScopes: [] },
  metadata: {},
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("Canva regional executors", () => {
  it("keeps credentials and API requests isolated by regional service", async () => {
    const calls: FetchCall[] = [];
    const credentialServices: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push({ url: request.url, authorization: request.headers.get("authorization") });
      if (request.url.endsWith("/profile")) {
        return Response.json({ profile: { display_name: "Canva user" } });
      }
      return Response.json({ team_user: { user_id: "user-1", team_id: "team-1" } });
    });
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);

    const context: ExecutionContext = {
      getCredential: async (service) => {
        credentialServices.push(service);
        return credential;
      },
    };
    const international = createCanvaExecutors("canva", "https://api.canva.com/rest");
    const china = createCanvaExecutors("canva_cn", "https://api.canva.cn/rest");

    await expect(international["canva.get_current_user"]!({}, context)).resolves.toMatchObject({ ok: true });
    await expect(china["canva_cn.get_current_user"]!({}, context)).resolves.toMatchObject({ ok: true });

    expect(credentialServices).toEqual(["canva", "canva_cn"]);
    expect(calls).toEqual([
      { url: "https://api.canva.com/rest/v1/users/me", authorization: "Bearer test-access-token" },
      { url: "https://api.canva.com/rest/v1/users/me/profile", authorization: "Bearer test-access-token" },
      { url: "https://api.canva.cn/rest/v1/users/me", authorization: "Bearer test-access-token" },
      { url: "https://api.canva.cn/rest/v1/users/me/profile", authorization: "Bearer test-access-token" },
    ]);
  });

  it("validates OAuth with the unscoped current-user endpoint", async () => {
    const calls: FetchCall[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push({ url: request.url, authorization: request.headers.get("authorization") });
      expect(request.url).toBe("https://api.canva.com/rest/v1/users/me");
      return Response.json({ team_user: { user_id: "user-1", team_id: "team-1" } });
    };

    const result = await createCanvaCredentialValidators("https://api.canva.com/rest").oauth2!(credential, { fetcher });

    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({
      profile: { accountId: "user-1", displayName: "user-1" },
      metadata: { validationEndpoint: "/v1/users/me", userId: "user-1", teamId: "team-1" },
    });
  });
});
