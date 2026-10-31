import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

const linkedAccount = {
  id: "17841400000000001",
  username: "creator_one",
  name: "Creator One",
};

function graphError(code: number, message: string): Response {
  return Response.json({ error: { message, type: "OAuthException", code } }, { status: 400 });
}

function pathOf(url: URL | RequestInfo): string {
  return new URL(url.toString()).pathname;
}

describe("Instagram Facebook Login credentials", () => {
  it("resolves the linked account from a Page access token", async () => {
    const requested: string[] = [];
    const result = await credentialValidators.apiKey!(
      { apiKey: "page-token", values: {} },
      {
        fetcher: async (url, init) => {
          const target = new URL(url.toString());
          requested.push(`${target.host}${target.pathname}`);
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer page-token");
          expect(target.searchParams.get("fields")).toContain("instagram_business_account{");
          return Response.json({ id: "page-1", name: "Page", instagram_business_account: linkedAccount });
        },
      },
    );

    expect(requested).toEqual(["graph.facebook.com/v25.0/me"]);
    expect(result).toEqual({ profile: { accountId: linkedAccount.id, displayName: "creator_one" } });
  });

  it("falls back to the Pages list when the token belongs to a user", async () => {
    const requested: string[] = [];
    const result = await credentialValidators.apiKey!(
      { apiKey: "user-token", values: {} },
      {
        fetcher: async (url) => {
          requested.push(pathOf(url));
          if (pathOf(url) === "/v25.0/me") {
            return graphError(
              100,
              "Tried accessing nonexisting field (instagram_business_account) on node type (User)",
            );
          }
          return Response.json({
            data: [
              { id: "page-0", name: "No Instagram" },
              { id: "page-1", instagram_business_account: linkedAccount },
            ],
          });
        },
      },
    );

    expect(requested).toEqual(["/v25.0/me", "/v25.0/me/accounts"]);
    expect(result?.profile?.accountId).toBe(linkedAccount.id);
  });

  it("does not hide an invalid token behind the Pages fallback", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "stale-token", values: {} },
        { fetcher: async () => graphError(190, "Error validating access token: Session has expired") },
      ),
    ).rejects.toMatchObject({ message: "Error validating access token: Session has expired" });
  });

  it("requires instagramAccountId when several Pages link an account", async () => {
    const second = { id: "17841400000000002", username: "creator_two" };
    const fetcher = async (url: URL | RequestInfo): Promise<Response> =>
      pathOf(url) === "/v25.0/me"
        ? graphError(100, "nonexisting field")
        : Response.json({
            data: [
              { id: "page-1", instagram_business_account: linkedAccount },
              { id: "page-2", instagram_business_account: second },
            ],
          });

    await expect(credentialValidators.apiKey!({ apiKey: "user-token", values: {} }, { fetcher })).rejects.toMatchObject(
      {
        message: expect.stringContaining("set instagramAccountId"),
      },
    );
    const picked = await credentialValidators.apiKey!(
      { apiKey: "user-token", values: { instagramAccountId: second.id } },
      { fetcher },
    );
    expect(picked?.profile).toEqual({ accountId: second.id, displayName: "creator_two" });
  });

  it("rejects a token whose Page has no linked Instagram account", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "page-token", values: {} },
        { fetcher: async () => Response.json({ id: "page-1", name: "Page" }) },
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("No Instagram Business or Creator account") });
  });
});

describe("Instagram action routing", () => {
  function contextFor(credential: ResolvedCredential): ExecutionContext {
    return { getCredential: async () => credential };
  }

  const facebookCredential: ResolvedCredential = {
    authType: "api_key",
    apiKey: "page-token",
    values: { apiKey: "page-token" },
    profile: { accountId: linkedAccount.id, displayName: "creator_one", grantedScopes: [] },
    metadata: {},
  };

  it("reads media through graph.facebook.com for a pasted token", async () => {
    const seen: URL[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: URL | RequestInfo) => {
      seen.push(new URL(url.toString()));
      return Response.json({
        data: [
          {
            id: "media-1",
            media_type: "IMAGE",
            media_url: "https://cdn.example.com/1.jpg",
            permalink: "https://www.instagram.com/p/abc/",
            timestamp: "2026-01-01T00:00:00+0000",
          },
        ],
        paging: {},
      });
    }) as typeof fetch;
    try {
      const result = await executors["instagram.list_media"]!({ limit: 5 }, contextFor(facebookCredential));
      expect(result.ok).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]!.host).toBe("graph.facebook.com");
    expect(seen[0]!.pathname).toBe(`/v25.0/${linkedAccount.id}/media`);
  });

  it("addresses the linked account by ID instead of /me for a pasted token", async () => {
    const originalFetch = globalThis.fetch;
    let path = "";
    globalThis.fetch = (async (url: URL | RequestInfo) => {
      path = pathOf(url);
      return Response.json({ id: linkedAccount.id, username: "creator_one", media_count: 3 });
    }) as typeof fetch;
    try {
      const result = await executors["instagram.get_current_user"]!({}, contextFor(facebookCredential));
      expect(result).toMatchObject({ ok: true, output: { user: { id: linkedAccount.id, mediaCount: 3 } } });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(path).toBe(`/v25.0/${linkedAccount.id}`);
  });

  it("refuses send_message for a pasted token", async () => {
    const result = await executors["instagram.send_message"]!(
      { recipientId: "1", text: "hi" },
      contextFor(facebookCredential),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("asks to connect when no credential exists", async () => {
    const result = await executors["instagram.get_current_user"]!({}, { getCredential: async () => undefined });
    expect(result.ok).toBe(false);
  });
});
