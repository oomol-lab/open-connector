import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors, proxy } from "./executors.ts";

const oauthCredential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "oauth-access-token",
  tokenType: "Bearer",
  profile: { accountId: "member-1", displayName: "Test member", grantedScopes: [] },
  metadata: {},
};
const keyCredential: ResolvedCredential = {
  authType: "custom_credential",
  values: { apiKey: "stored-key", apiToken: "stored-token" },
  profile: { accountId: "member-1", displayName: "Test member", grantedScopes: [] },
  metadata: {},
};
const oauthContext: ExecutionContext = { getCredential: async () => oauthCredential };
const keyContext: ExecutionContext = { getCredential: async () => keyCredential };

afterEach(() => vi.unstubAllGlobals());

describe("Trello OAuth authentication", () => {
  it("sends the access token as a bearer header without key and token query parameters", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: "member-1", username: "tester" }));
    vi.stubGlobal("fetch", fetcher);

    const result = await executors["trello.get_member"]!({}, oauthContext);

    expect(result.ok).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    const requested = new URL(String(url));
    expect(requested.origin + requested.pathname).toBe("https://trello.com/1/members/me");
    expect(requested.searchParams.has("key")).toBe(false);
    expect(requested.searchParams.has("token")).toBe(false);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer oauth-access-token");
  });

  it("keeps key and token authentication on query parameters", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: "member-1", username: "tester" }));
    vi.stubGlobal("fetch", fetcher);

    const result = await executors["trello.get_member"]!({}, keyContext);

    expect(result.ok).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    const requested = new URL(String(url));
    expect(requested.origin).toBe("https://api.trello.com");
    expect(requested.searchParams.get("key")).toBe("stored-key");
    expect(requested.searchParams.get("token")).toBe("stored-token");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
  });

  it("authenticates proxy requests with the bearer token and drops caller credentials", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: "card-1" }));
    vi.stubGlobal("fetch", fetcher);

    const result = await proxy(
      {
        method: "GET",
        endpoint: "/cards/card-1?key=endpoint-key&token=endpoint-token",
        query: { key: "caller-key", token: "caller-token" },
        headers: { Authorization: "Bearer caller-token" },
      },
      oauthContext,
    );

    expect(result).toMatchObject({ ok: true, response: { status: 200 } });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://trello.com/1/cards/card-1");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer oauth-access-token");
  });

  it("reads the connected member as the account identity", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "member-1", username: "tester", fullName: "Test Member" }),
    );

    const result = await credentialValidators.oauth2!(oauthCredential, { fetcher });

    expect(result).toMatchObject({
      profile: { accountId: "member-1", displayName: "Test Member" },
      metadata: { apiBaseUrl: "https://trello.com/1", memberId: "member-1", username: "tester" },
    });
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("authorization")).toBe("Bearer oauth-access-token");
  });

  it("reports the HTTP status and host when Trello rejects the access token", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("invalid token", { status: 400 }));

    await expect(credentialValidators.oauth2!(oauthCredential, { fetcher })).rejects.toThrow(
      "Trello validate request failed (HTTP 400 from trello.com): invalid token",
    );
  });

  it.each([401, 403, 500, 503])("keeps HTTP %i from Trello so callers can tell auth from outage", async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("failed", { status }));

    await expect(credentialValidators.oauth2!(oauthCredential, { fetcher })).rejects.toMatchObject({
      status,
      message: `Trello validate request failed (HTTP ${status} from trello.com): failed`,
    });
  });

  it("asks for a connection when no credential is stored", async () => {
    const result = await executors["trello.get_member"]!({}, { getCredential: async () => undefined });

    expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining("Connect trello") } });
  });
});
