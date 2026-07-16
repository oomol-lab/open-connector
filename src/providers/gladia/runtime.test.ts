import { afterEach, describe, expect, it, vi } from "vitest";
import { gladiaActionHandlers } from "./runtime.ts";

afterEach(() => vi.unstubAllGlobals());

/**
 * Fetch stub that mirrors the Cloudflare Workers runtime: `redirect: "error"`
 * is not implemented there and throws, so a provider that still requests it
 * fails on Workers while passing on Node. Redirects are never followed.
 */
function stubWorkersFetch(response: () => Response): { calls: string[]; fetcher: typeof fetch } {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.redirect === "error") {
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    }
    calls.push(input instanceof Request ? input.url : String(input));
    return response();
  });
  return { calls, fetcher: fetcher as unknown as typeof fetch };
}

describe("gladia upload source redirect handling", () => {
  it("rejects a redirecting sourceUrl without following it, on Workers too", async () => {
    const { calls, fetcher } = stubWorkersFetch(
      () => new Response(null, { status: 302, headers: { location: "https://elsewhere.example.com/audio.mp3" } }),
    );

    await expect(
      gladiaActionHandlers.upload_file!(
        { sourceUrl: "https://files.example.com/audio.mp3" },
        { apiKey: "key", fetcher },
      ),
    ).rejects.toThrow(/failed to download sourceUrl: 302/u);

    expect(calls).toEqual(["https://files.example.com/audio.mp3"]);
  });
});
