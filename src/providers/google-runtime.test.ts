import type { ProviderFetch } from "./provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { googleRequest } from "./google-runtime.ts";
import { ProviderRequestError } from "./provider-runtime.ts";

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
