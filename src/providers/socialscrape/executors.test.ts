import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "ss_live_test",
  values: {},
  profile: { accountId: "socialscrape:team:team_1", displayName: "SocialScrape team_1", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

/** A SocialScrape success answer around one `data` object. */
function answer(data: Record<string, unknown>, extra: Record<string, unknown> = {}): Response {
  return Response.json({
    ok: true,
    credits_charged: 1,
    credits_remaining: 99,
    cached: false,
    cached_at: null,
    request_id: "req_1",
    data,
    ...extra,
  });
}

/** A SocialScrape error answer. */
function failure(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, error: { code, message, retryable: false }, credits_charged: 0, request_id: "req_2" },
    { status },
  );
}

/** The answer SocialScrape gives, with HTTP 202, for a request that is still running. */
function job(jobId: string): Response {
  return Response.json(
    {
      ok: true,
      credits_charged: 0,
      credits_remaining: 99,
      cached: false,
      cached_at: null,
      request_id: "req_3",
      data: {
        object: "job",
        job_id: jobId,
        status: "running",
        poll_url: `https://api.socialscrape.dev/v1/jobs/${jobId}`,
      },
    },
    { status: 202 },
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SocialScrape credentials", () => {
  it("validates an API key against the credit balance and names the team", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "ss_live_test", values: {} },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.socialscrape.dev/v1/account/credits");
          expect(new Headers(init?.headers).get("x-api-key")).toBe("ss_live_test");
          return answer({ object: "credit_balance", credits_remaining: 99, team_id: "team_1" }, { credits_charged: 0 });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "socialscrape:team:team_1", displayName: "SocialScrape team_1" },
      metadata: { validationEndpoint: "/v1/account/credits", creditsRemaining: 99 },
    });
  });

  it("reports a refused key as a field error, not a reconnect prompt", async () => {
    await expect(
      credentialValidators.apiKey!(
        { apiKey: "wrong", values: {} },
        { fetcher: async () => failure(401, "unauthorized", "this API key is not valid") },
      ),
    ).rejects.toMatchObject({ status: 400, message: "this API key is not valid" });
  });
});

describe("SocialScrape actions", () => {
  it("reads a transcript from a video link", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      expect(url.origin + url.pathname).toBe("https://api.socialscrape.dev/v1/transcript");
      expect(url.searchParams.get("url")).toBe("https://www.youtube.com/watch?v=abc");
      expect(url.searchParams.get("language")).toBe("en");
      expect(new Headers(init?.headers).get("x-api-key")).toBe("ss_live_test");
      return answer({ object: "transcript", platform: "youtube", source: "captions", text: "hello" });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await executors["socialscrape.get_transcript"]!(
      { url: "https://www.youtube.com/watch?v=abc", language: "en" },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      output: {
        transcript: { platform: "youtube", text: "hello" },
        meta: { requestId: "req_1", creditsCharged: 1, creditsRemaining: 99, cached: false },
      },
    });
  });

  it("polls a queued job until the transcript is ready", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input.toString());
        calls.push(url.pathname);
        // The job answer twice (the first request, then one poll), then the finished envelope.
        return calls.length < 3
          ? job("job_0123456789abcdef01234567")
          : answer({ object: "transcript", platform: "tiktok", source: "ai", text: "hello" }, { credits_charged: 5 });
      }),
    );

    const pending = executors["socialscrape.get_transcript"]!({ url: "https://www.tiktok.com/@a/video/1" }, context);
    await vi.advanceTimersByTimeAsync(6_000);
    const result = await pending;

    expect(calls).toEqual([
      "/v1/transcript",
      "/v1/jobs/job_0123456789abcdef01234567",
      "/v1/jobs/job_0123456789abcdef01234567",
    ]);
    expect(result).toMatchObject({
      ok: true,
      output: { transcript: { platform: "tiktok", text: "hello" }, meta: { creditsCharged: 5 } },
    });
  });

  it("never reports a job as a profile, and passes on the error a failed job ends with", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      new URL(input.toString()).pathname === "/v1/instagram/profile"
        ? job("job_abc")
        : failure(404, "not_found", "the platform says this profile does not exist"),
    );
    vi.stubGlobal("fetch", fetch);

    const pending = executors["socialscrape.get_profile"]!({ platform: "instagram", handle: "nobody" }, context);
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await pending;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "the platform says this profile does not exist" },
    });
  });

  it("gives up on a job that is still running after the wait budget and names it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => job("job_slow")),
    );

    const pending = executors["socialscrape.get_transcript"]!({ url: "https://www.tiktok.com/@a/video/1" }, context);
    await vi.advanceTimersByTimeAsync(95_000);
    const result = await pending;

    expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining("job_slow") } });
  });

  it("does not let a stalled poll outlive the wait budget", async () => {
    vi.useFakeTimers();
    const startedAt = Date.now();
    let polls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (new URL(input.toString()).pathname === "/v1/transcript") {
          return job("job_stalled");
        }
        polls += 1;
        // A poll that never answers: it ends only when the request is aborted.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      }),
    );

    let settledAfterMs = -1;
    const pending = executors["socialscrape.get_transcript"]!(
      { url: "https://www.tiktok.com/@a/video/1" },
      context,
    ).then((result) => {
      settledAfterMs = Date.now() - startedAt;
      return result;
    });
    await vi.advanceTimersByTimeAsync(120_000);
    const result = await pending;

    expect(polls).toBeGreaterThan(0);
    expect(settledAfterMs).toBeLessThanOrEqual(90_000);
    expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining("job_stalled") } });
  });

  it("refuses a job answer that carries no usable job id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ object: "job", job_id: "../account/credits", status: "pending" })),
    );

    const result = await executors["socialscrape.get_transcript"]!(
      { url: "https://www.tiktok.com/@a/video/1" },
      context,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "provider_error" } });
  });

  it("looks a profile up by handle without the at sign", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe("https://api.socialscrape.dev/v1/instagram/profile?handle=nasa");
      return answer({ object: "profile", platform: "instagram", handle: "nasa", stats: { followers: 10 } });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await executors["socialscrape.get_profile"]!({ platform: "instagram", handle: "@nasa" }, context);

    expect(result).toMatchObject({ ok: true, output: { profile: { handle: "nasa", stats: { followers: 10 } } } });
  });

  it("lists TikTok videos from the videos route and passes the cursor on", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe("https://api.socialscrape.dev/v1/tiktok/profile/videos?handle=nasa&cursor=c1");
      return answer({ object: "list", items: [{ platform: "tiktok", id: "1" }], cursor: "c2", has_more: true });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await executors["socialscrape.list_profile_posts"]!(
      { platform: "tiktok", handle: "nasa", cursor: "c1" },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      output: { posts: [{ platform: "tiktok", id: "1" }], cursor: "c2", hasMore: true },
    });
  });

  it("lists posts from the posts route and ends the paging when there is no cursor", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe("https://api.socialscrape.dev/v1/threads/profile/posts?handle=zuck");
      return answer({ object: "list", items: [], cursor: null, has_more: false });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await executors["socialscrape.list_profile_posts"]!(
      { platform: "threads", handle: "zuck" },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { posts: [], cursor: null, hasMore: false } });
  });

  it("reports an empty balance as insufficient credit with SocialScrape's own message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failure(402, "insufficient_credits", "this team has no credits left")),
    );

    const result = await executors["socialscrape.get_credits"]!({}, context);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "insufficient_credit", message: "this team has no credits left" },
    });
  });

  it("asks for a reconnect when a stored key stops working", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failure(401, "unauthorized", "this API key is not valid")),
    );

    const result = await executors["socialscrape.get_credits"]!({}, context);

    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
  });

  it("keeps the status of an error whose body is not JSON", async () => {
    const fetch = vi.fn<() => Promise<Response>>();
    fetch.mockResolvedValueOnce(new Response("<html>Unauthorized</html>", { status: 401 }));
    fetch.mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }));
    vi.stubGlobal("fetch", fetch);

    const refused = await executors["socialscrape.get_credits"]!({}, context);
    const limited = await executors["socialscrape.get_credits"]!({}, context);

    expect(refused).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
    expect(limited).toMatchObject({ ok: false, error: { code: "rate_limited" } });
  });

  it("reports private content as a problem with the request, not with the key", async () => {
    const fetch = vi.fn<() => Promise<Response>>();
    fetch.mockResolvedValueOnce(failure(403, "private", "The content is private."));
    fetch.mockResolvedValueOnce(failure(403, "forbidden", "The key or team is suspended or revoked."));
    vi.stubGlobal("fetch", fetch);

    const hidden = await executors["socialscrape.get_profile"]!({ platform: "instagram", handle: "someone" }, context);
    const revoked = await executors["socialscrape.get_profile"]!({ platform: "instagram", handle: "someone" }, context);

    expect(hidden).toMatchObject({ ok: false, error: { code: "invalid_input", message: "The content is private." } });
    expect(revoked).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
  });
});
