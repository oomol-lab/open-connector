import { describe, expect, it } from "vitest";
import { keenableActionHandlers, validateKeenableCredential } from "./runtime.ts";

interface RecordedRequest {
  method: string;
  url: string;
  apiKey: string | null;
  title: string | null;
  body: unknown;
}

function recordingFetcher(response: () => Response): { fetcher: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      method: init?.method ?? "GET",
      url: String(input),
      apiKey: headers.get("x-api-key"),
      title: headers.get("x-keenable-title"),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return response();
  };
  return { fetcher, requests };
}

const unauthorized = (): Response =>
  Response.json({ error: "Authentication failed", message: "Invalid API key" }, { status: 401 });

describe("Keenable runtime", () => {
  it("searches the keyless endpoint with the app title and reads text from snippet", async () => {
    const { fetcher, requests } = recordingFetcher(() =>
      Response.json({
        query: "agent gateway",
        results: [
          {
            title: "OpenConnector",
            url: "https://github.com/oomol-lab/open-connector",
            description: "",
            snippet: "OpenConnector is an open-source connector gateway for AI agents.",
            acquired_at: "2026-09-20T18:13:53Z",
          },
        ],
      }),
    );

    const result = await keenableActionHandlers.search(
      { query: "agent gateway", maxResults: 5, site: "github.com", publishedAfter: "2026-01-01" },
      { fetcher },
    );

    expect(requests).toEqual([
      {
        method: "POST",
        url: "https://api.keenable.ai/v1/search/public",
        apiKey: null,
        title: "OpenConnector",
        body: { query: "agent gateway", max_results: 5, site: "github.com", published_after: "2026-01-01" },
      },
    ]);
    expect(result).toEqual({
      results: [
        {
          title: "OpenConnector",
          url: "https://github.com/oomol-lab/open-connector",
          snippet: "OpenConnector is an open-source connector gateway for AI agents.",
          acquiredAt: "2026-09-20T18:13:53Z",
        },
      ],
    });
  });

  it("uses the keyed endpoints and X-API-Key header when a key is configured", async () => {
    const { fetcher, requests } = recordingFetcher(() =>
      Response.json({ url: "https://example.com/", title: "Example Domain", content: "# Example", description: "" }),
    );

    const result = await keenableActionHandlers.fetch_page(
      { url: "https://example.com/" },
      { apiKey: "test-key", fetcher },
    );

    expect(requests).toEqual([
      {
        method: "GET",
        url: "https://api.keenable.ai/v1/fetch?url=https%3A%2F%2Fexample.com%2F",
        apiKey: "test-key",
        title: "OpenConnector",
        body: undefined,
      },
    ]);
    expect(result).toEqual({ url: "https://example.com/", title: "Example Domain", content: "# Example" });
  });

  it("refuses to send a local page URL", async () => {
    const { fetcher, requests } = recordingFetcher(() => Response.json({}));

    await expect(
      keenableActionHandlers.fetch_page({ url: "http://127.0.0.1/admin" }, { fetcher }),
    ).rejects.toMatchObject({ status: 400 });
    expect(requests).toEqual([]);
  });

  it("reports a rejected key as an authorization failure only when an action sent one", async () => {
    await expect(
      keenableActionHandlers.search(
        { query: "x" },
        { apiKey: "revoked", fetcher: recordingFetcher(unauthorized).fetcher },
      ),
    ).rejects.toMatchObject({ status: 401, message: "Invalid API key" });
    await expect(
      keenableActionHandlers.search({ query: "x" }, { fetcher: recordingFetcher(unauthorized).fetcher }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      validateKeenableCredential({ apiKey: "wrong" }, { fetcher: recordingFetcher(unauthorized).fetcher }),
    ).rejects.toMatchObject({ status: 400, message: "Invalid API key" });
  });

  it("keeps the rate-limit status and Retry-After", async () => {
    const { fetcher } = recordingFetcher(() =>
      Response.json(
        { error: "Too many requests", message: "Rate limit exceeded" },
        { status: 429, headers: { "retry-after": "30" } },
      ),
    );

    await expect(keenableActionHandlers.search({ query: "x" }, { fetcher })).rejects.toMatchObject({
      status: 429,
      details: { retryAfterSeconds: 30 },
    });
  });
});
