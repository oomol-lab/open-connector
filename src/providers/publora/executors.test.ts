import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { publoraActions } from "./actions.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const postGroupId = "6b06a8b76f78f5d509b67555";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "sk_test.publora",
  values: {},
  profile: { accountId: "publora", displayName: "Publora", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = { getCredential: async () => credential };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: URL, init: RequestInit | undefined) => Response) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(input.toString()), init));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function action(name: string) {
  return publoraActions.find((action) => action.id === `publora.${name}`)!;
}

describe("Publora credentials", () => {
  it("validates an API key against the account context", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "sk_test.publora", values: {} },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.publora.com/api/v1/account-context");
          expect(new Headers(init?.headers).get("x-publora-key")).toBe("sk_test.publora");
          expect(new Headers(init?.headers).get("authorization")).toBeNull();
          return Response.json({
            success: true,
            context: { actorUserId: "user-1", plan: { key: "pro", name: "Pro" } },
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "user-1", displayName: "Publora" },
      metadata: { plan: "pro" },
    });
  });

  it("reports a rejected key as a field error on connect", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "bad", values: {} },
        { fetcher: async () => Response.json({ error: "Invalid API key" }, { status: 401 }) },
      ),
    ).rejects.toMatchObject({ status: 400, message: "Invalid API key" });
  });
});

describe("Publora actions", () => {
  it("schedules a post with media, first comments and an idempotency key", async () => {
    const input = {
      content: "Launch day",
      platforms: ["linkedin-ABC123", "mastodon-109876543210"],
      scheduledTime: "2026-12-01T14:00:00Z",
      mediaUrls: ["https://cdn.example.com/launch.png"],
      firstComments: [{ text: "Details in the docs", platforms: ["linkedin"] }],
      idempotencyKey: "launch-001",
    };
    expect(validateActionInput(action("create_post"), input).valid).toBe(true);
    const fetch = stubFetch((url, init) => {
      expect(url.toString()).toBe("https://api.publora.com/api/v1/create-post");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-publora-key")).toBe("sk_test.publora");
      expect(headers.get("idempotency-key")).toBe("launch-001");
      const { idempotencyKey: _key, ...body } = input;
      expect(JSON.parse(String(init?.body))).toEqual(body);
      return Response.json({ success: true, postGroupId, scheduledTime: "2026-12-01T14:00:00.000Z" });
    });

    const result = await executors["publora.create_post"]!(input, context);

    expect(result).toMatchObject({
      ok: true,
      output: { postGroupId, scheduledTime: "2026-12-01T14:00:00.000Z" },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns a post without the success flag", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe(`/api/v1/get-post/${postGroupId}`);
      return Response.json({
        success: true,
        postGroupId,
        status: "published",
        posts: [{ platform: "mastodon", platformId: "109876543210", status: "published", postedId: "115" }],
      });
    });

    const result = await executors["publora.get_post"]!({ postGroupId }, context);

    expect(result).toMatchObject({ ok: true, output: { post: { postGroupId, status: "published" } } });
    expect(result).not.toMatchObject({ output: { post: { success: true } } });
  });

  it("lists posts with filters and keeps the pagination", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe("/api/v1/list-posts");
      expect(Object.fromEntries(url.searchParams)).toEqual({ page: "2", limit: "50", status: "scheduled" });
      return Response.json({
        success: true,
        posts: [{ postGroupId, status: "scheduled" }],
        pagination: { page: 2, limit: 50, totalItems: 51, hasNextPage: false },
      });
    });

    const result = await executors["publora.list_posts"]!({ page: 2, limit: 50, status: "scheduled" }, context);

    expect(result).toMatchObject({
      ok: true,
      output: { posts: [{ postGroupId }], pagination: { totalItems: 51, hasNextPage: false } },
    });
  });

  it("unschedules a post with PUT and only the fields given", async () => {
    stubFetch((url, init) => {
      expect(url.pathname).toBe(`/api/v1/update-post/${postGroupId}`);
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toEqual({ status: "draft" });
      return Response.json({
        success: true,
        message: "Post updated",
        postGroup: { _id: postGroupId, status: "draft" },
      });
    });

    const result = await executors["publora.update_post"]!({ postGroupId, status: "draft" }, context);

    expect(result).toMatchObject({ ok: true, output: { postGroup: { status: "draft" } } });
  });

  it("deletes a post with DELETE and no body", async () => {
    stubFetch((url, init) => {
      expect(url.pathname).toBe(`/api/v1/delete-post/${postGroupId}`);
      expect(init?.method).toBe("DELETE");
      expect(init?.body).toBeUndefined();
      return Response.json({ success: true });
    });

    const result = await executors["publora.delete_post"]!({ postGroupId }, context);

    expect(result).toMatchObject({ ok: true, output: { postGroupId, deleted: true } });
  });

  it("rejects a blank idempotency key instead of sending the post without one", () => {
    expect(
      validateActionInput(action("create_post"), { platforms: ["linkedin-ABC123"], idempotencyKey: "  " }).valid,
    ).toBe(false);
  });

  it("only accepts a 24-character post group ID", () => {
    expect(validateActionInput(action("get_post"), { postGroupId }).valid).toBe(true);
    for (const value of ["..", "../webhooks", `${postGroupId}/x`]) {
      expect(validateActionInput(action("get_post"), { postGroupId: value }).valid).toBe(false);
    }
  });

  it("reports a plan limit as invalid input, not as a credential to reconnect", async () => {
    stubFetch(() =>
      Response.json({ error: "Monthly post limit reached", code: "POST_LIMIT_REACHED" }, { status: 403 }),
    );

    const result = await executors["publora.create_post"]!({ content: "Hi", platforms: ["linkedin-ABC123"] }, context);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "Monthly post limit reached (POST_LIMIT_REACHED)" },
    });
  });

  it("reports a rejected key during execution as an authorization failure", async () => {
    stubFetch(() => Response.json({ error: "Invalid API key" }, { status: 401 }));

    const result = await executors["publora.list_connections"]!({}, context);

    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
  });

  it("reports a 429 as rate limited in actions and the proxy", async () => {
    stubFetch(() => Response.json({ error: "Too many requests" }, { status: 429 }));

    await expect(executors["publora.list_posts"]!({}, context)).resolves.toMatchObject({
      ok: false,
      error: { code: "rate_limited" },
    });
    await expect(proxy({ method: "GET", endpoint: "/list-posts" }, context)).resolves.toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429 } },
    });
  });

  it("sends the key in x-publora-key through the proxy", async () => {
    stubFetch((url, init) => {
      expect(url.toString()).toBe("https://api.publora.com/api/v1/platform-limits");
      expect(new Headers(init?.headers).get("x-publora-key")).toBe("sk_test.publora");
      return Response.json({ success: true });
    });

    await expect(proxy({ method: "GET", endpoint: "/platform-limits" }, context)).resolves.toMatchObject({ ok: true });
  });
});
