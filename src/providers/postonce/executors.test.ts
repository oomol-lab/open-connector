import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { postonceActions } from "./actions.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const postId = "5b0c8f62-4d1e-4a39-9a51-0f4f3c3c9d10";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "po_live_test",
  values: {},
  profile: { accountId: "postonce", displayName: "PostOnce", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = { getCredential: async () => credential };

const post = {
  id: postId,
  content: "Launch day",
  status: "scheduled",
  publish_at: "2026-12-01T14:00:00.000Z",
  targets: [{ target_post_id: "target-1", account_id: "account-1", platform: "linkedin", status: "scheduled" }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: URL, init: RequestInit | undefined) => Response) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(input.toString()), init));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("PostOnce credentials", () => {
  it("validates an API key against the accounts endpoint", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "po_live_test", values: {} },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://postonce.to/api/public/v1/accounts");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer po_live_test");
          return Response.json({ data: [{ id: "account-1", platform: "linkedin", status: "active" }] });
        },
      },
    );

    expect(result).toMatchObject({ profile: { displayName: "PostOnce" }, metadata: { connectedAccounts: 1 } });
  });

  it("preserves the rejected key error message", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "bad", values: {} },
        {
          fetcher: async () =>
            Response.json({ error: { code: "invalid_api_key", message: "Invalid API key." } }, { status: 401 }),
        },
      ),
    ).rejects.toMatchObject({ message: "Invalid API key." });
  });
});

it("preserves the rate limit when an error response body fails to read", async () => {
  stubFetch(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("connection closed while reading body"));
          },
        }),
        { status: 429 },
      ),
  );
  await expect(executors["postonce.list_posts"]!({}, context)).resolves.toMatchObject({
    ok: false,
    error: { code: "rate_limited" },
  });
  await expect(proxy({ method: "GET", endpoint: "/v1/posts" }, context)).resolves.toMatchObject({
    ok: false,
    error: { code: "rate_limited", details: { status: 429 } },
  });
});

describe("PostOnce actions", () => {
  it("schedules a post with targets, media and an idempotency key", async () => {
    const fetch = stubFetch((url, init) => {
      expect(url.toString()).toBe("https://postonce.to/api/public/v1/posts");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer po_live_test");
      expect(headers.get("idempotency-key")).toBe("launch-001");
      expect(JSON.parse(String(init?.body))).toEqual({
        content: "Launch day",
        media: [{ url: "https://cdn.example.com/launch.png", type: "image" }],
        publish_at: "2026-12-01T14:00:00.000Z",
        targets: [{ account_id: "account-1" }, { account_id: "account-2", content_override: "Short version" }],
      });
      return Response.json({ data: post }, { status: 201 });
    });

    const result = await executors["postonce.create_post"]!(
      {
        content: "Launch day",
        media: [{ url: "https://cdn.example.com/launch.png", type: "image" }],
        publish_at: "2026-12-01T14:00:00.000Z",
        targets: [{ account_id: "account-1" }, { account_id: "account-2", content_override: "Short version" }],
        idempotency_key: "launch-001",
      },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { post: { id: postId, status: "scheduled" } } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["external_id", "publish_at"])("clears %s with an explicit null update", async (field) => {
    const input = { id: postId, [field]: null };
    const action = postonceActions.find((action) => action.id === "postonce.update_post")!;
    expect(validateActionInput(action, input).valid).toBe(true);
    const fetch = stubFetch((url, init) => {
      expect(url.pathname).toBe(`/api/public/v1/posts/${postId}`);
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ [field]: null });
      return Response.json({ data: { ...post, [field]: null } });
    });
    const result = await executors["postonce.update_post"]!(input, context);
    expect(result).toMatchObject({ ok: true, output: { post: { [field]: null } } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("lists posts with paging and keeps the paging details", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe("/api/public/v1/posts");
      expect(url.searchParams.get("limit")).toBe("10");
      expect(url.searchParams.get("after")).toBe(postId);
      return Response.json({ data: [post], meta: { has_more: false } });
    });

    const result = await executors["postonce.list_posts"]!({ limit: 10, after: postId }, context);

    expect(result).toMatchObject({ ok: true, output: { posts: [{ id: postId }], meta: { has_more: false } } });
  });

  it("retries one failed destination", async () => {
    stubFetch((url, init) => {
      expect(url.pathname).toBe(`/api/public/v1/posts/${postId}/targets/target-1/retry`);
      expect(init?.method).toBe("POST");
      return Response.json({ data: post }, { status: 202 });
    });

    const result = await executors["postonce.retry_post_target"]!({ id: postId, target_post_id: "target-1" }, context);

    expect(result).toMatchObject({ ok: true, output: { post: { id: postId } } });
  });

  it("rejects a target ID that would leave the post path", async () => {
    const fetch = stubFetch(() => Response.json({}));

    const result = await executors["postonce.retry_post_target"]!({ id: postId, target_post_id: ".." }, context);

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps PostOnce's error message and hint", async () => {
    stubFetch(() =>
      Response.json(
        {
          error: {
            code: "post_not_editable",
            message: "Post can no longer be updated.",
            hint: "Only scheduled posts can be changed.",
          },
        },
        { status: 409 },
      ),
    );

    const result = await executors["postonce.update_post"]!({ id: postId, content: "New copy" }, context);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "Post can no longer be updated. Only scheduled posts can be changed." },
    });
  });
});
