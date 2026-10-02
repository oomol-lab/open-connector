import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { googleRequest } from "./runtime-request.ts";

const accessToken = "test-token";
const url = "https://example.googleapis.com/v1/resource";

function respondWith(status: number, body: string): ProviderFetch {
  return (async () => new Response(body, { status })) as ProviderFetch;
}

const hangingFetcher: ProviderFetch = ((_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("Aborted", "AbortError"));
    });
  })) as ProviderFetch;

async function messageOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderRequestError);
    return (error as ProviderRequestError).message;
  }
  throw new Error("expected the request to reject");
}

async function errorOf(run: Promise<unknown>): Promise<ProviderRequestError> {
  try {
    await run;
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderRequestError);
    return error as ProviderRequestError;
  }
  throw new Error("expected the request to reject");
}

describe("googleRequest fallback error messages", () => {
  it("names the calling service when the error response has no body", async () => {
    const message = await messageOf(
      googleRequest(url, { accessToken, fetcher: respondWith(500, ""), service: "googlechat" }),
    );

    expect(message).toBe("googlechat request failed with 500");
  });

  it("names the calling service when a request times out", async () => {
    const message = await messageOf(
      googleRequest(url, { accessToken, fetcher: hangingFetcher, timeoutMs: 5, service: "googlechat" }),
    );

    expect(message).toBe("googlechat request timed out after 1 second");
  });

  it("names the calling service when a GET carries a body", async () => {
    const message = await messageOf(
      googleRequest(url, {
        accessToken,
        fetcher: respondWith(200, "{}"),
        method: "GET",
        body: { unexpected: true },
        service: "googlechat",
      }),
    );

    expect(message).toBe("googlechat GET request must not include a body");
  });

  it("falls back to Google Drive when no service is given", async () => {
    const message = await messageOf(googleRequest(url, { accessToken, fetcher: respondWith(500, "") }));

    expect(message).toBe("googledrive request failed with 500");
  });

  it("keeps Google's own error message instead of the fallback", async () => {
    const body = JSON.stringify({ error: { message: "Insufficient permission" } });
    const message = await messageOf(
      googleRequest(url, { accessToken, fetcher: respondWith(403, body), service: "googlechat" }),
    );

    expect(message).toBe("Insufficient permission");
  });
});

describe("googleRequest rate limit classification", () => {
  it.each(["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded"])(
    "maps the classic 403 reason %s to rate_limited",
    async (reason) => {
      const body = JSON.stringify({
        error: { code: 403, message: "Rate limit exceeded", errors: [{ domain: "usageLimits", reason }] },
      });
      const error = await errorOf(googleRequest(url, { accessToken, fetcher: respondWith(403, body) }));

      expect(error.status).toBe(403);
      expect(error.code).toBe("rate_limited");
    },
  );

  it("maps error.status RESOURCE_EXHAUSTED to rate_limited", async () => {
    const body = JSON.stringify({
      error: { code: 403, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" },
    });
    const error = await errorOf(googleRequest(url, { accessToken, fetcher: respondWith(403, body) }));

    expect(error.code).toBe("rate_limited");
  });

  it("maps error.status PERMISSION_DENIED with a quota detail reason to rate_limited", async () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "Quota exceeded",
        status: "PERMISSION_DENIED",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "RATE_LIMIT_EXCEEDED" }],
      },
    });
    const error = await errorOf(googleRequest(url, { accessToken, fetcher: respondWith(403, body) }));

    expect(error.code).toBe("rate_limited");
  });

  it("leaves a genuine permission 403 as authorization_failed", async () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "The user does not have sufficient permissions for this file.",
        errors: [{ domain: "global", reason: "insufficientPermissions" }],
      },
    });
    const error = await errorOf(googleRequest(url, { accessToken, fetcher: respondWith(403, body) }));

    expect(error.status).toBe(403);
    expect(error.code).toBeUndefined();
  });

  it("leaves error.status PERMISSION_DENIED without a quota reason as authorization_failed", async () => {
    const body = JSON.stringify({
      error: {
        code: 403,
        message: "App not authorized to file.",
        status: "PERMISSION_DENIED",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "appNotAuthorizedToFile" }],
      },
    });
    const error = await errorOf(googleRequest(url, { accessToken, fetcher: respondWith(403, body) }));

    expect(error.code).toBeUndefined();
  });

  it("does not infer a rate limit from an unparseable body", async () => {
    const error = await errorOf(
      googleRequest(url, { accessToken, fetcher: respondWith(403, "not json"), service: "googlechat" }),
    );

    expect(error.message).toBe("not json");
    expect(error.code).toBeUndefined();
  });

  it("does not infer a rate limit from a quota reason outside HTTP 403", async () => {
    const body = JSON.stringify({
      error: { code: 429, message: "Too many requests", errors: [{ reason: "rateLimitExceeded" }] },
    });
    const error = await errorOf(googleRequest(url, { accessToken, fetcher: respondWith(429, body) }));

    expect(error.status).toBe(429);
    expect(error.code).toBeUndefined();
  });
});
