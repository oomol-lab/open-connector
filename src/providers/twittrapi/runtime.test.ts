import { describe, expect, it, vi } from "vitest";
import { credentialValidators } from "./executors.ts";
import { twittrapiActionHandlers } from "./runtime.ts";

const apiKey = "twittrapi-test-key";

interface CapturedRequest {
  url: URL;
  headers: Headers;
}

function mockFetcher(respond: (url: URL) => Response) {
  const requests: CapturedRequest[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, headers: new Headers(init?.headers) });
    return respond(url);
  });
  return { fetcher, requests };
}

const tweet = { id: "1800000000000000001", text: "hello", author: { id: "12", username: "jack" } };

describe("TwittrAPI actions", () => {
  it("searches posts in the simple format and renames the page envelope", async () => {
    const { fetcher, requests } = mockFetcher(() =>
      Response.json({ data: [tweet], nextCursor: "next-1", previousCursor: "prev-1", hasNextPage: true }),
    );

    const result = await twittrapiActionHandlers.search_tweets(
      { query: "from:jack lang:en", category: "Latest", count: 40, cursor: "page-0" },
      { apiKey, fetcher },
    );

    expect(result).toEqual({ tweets: [tweet], nextCursor: "next-1", previousCursor: "prev-1", hasNextPage: true });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.url.origin + request!.url.pathname).toBe("https://api.twittrapi.com/search");
    expect(Object.fromEntries(request!.url.searchParams)).toEqual({
      searchItem: "from:jack lang:en",
      category: "Latest",
      count: "40",
      cursor: "page-0",
      format: "simple",
    });
    expect(request!.headers.get("x-api-key")).toBe(apiKey);
  });

  it("searches accounts through the People tab", async () => {
    const { fetcher, requests } = mockFetcher(() =>
      Response.json({
        data: [{ id: "12", username: "jack" }],
        nextCursor: null,
        previousCursor: null,
        hasNextPage: false,
      }),
    );

    const result = await twittrapiActionHandlers.search_users({ query: "jack" }, { apiKey, fetcher });

    expect(result).toEqual({
      users: [{ id: "12", username: "jack" }],
      nextCursor: null,
      previousCursor: null,
      hasNextPage: false,
    });
    expect(requests[0]!.url.searchParams.get("category")).toBe("People");
  });

  it("reads profile collections by handle with -1 in the user ID path segment", async () => {
    const { fetcher, requests } = mockFetcher(() =>
      Response.json({ data: [], nextCursor: null, previousCursor: null, hasNextPage: false }),
    );

    await twittrapiActionHandlers.get_user_followers({ username: "@jack", count: 20 }, { apiKey, fetcher });
    await twittrapiActionHandlers.get_user_tweets({ userId: "12", username: "ignored" }, { apiKey, fetcher });

    expect(requests[0]!.url.pathname).toBe("/user/-1/followers");
    expect(requests[0]!.url.searchParams.get("username")).toBe("jack");
    expect(requests[0]!.url.searchParams.get("count")).toBe("20");
    expect(requests[1]!.url.pathname).toBe("/user/12/tweets");
    expect(requests[1]!.url.searchParams.has("username")).toBe(false);
  });

  it("looks up a profile by handle and returns null when the handle does not exist", async () => {
    const { fetcher, requests } = mockFetcher(() => Response.json({ data: null }));

    const result = await twittrapiActionHandlers.get_user({ username: "@nobody_here" }, { apiKey, fetcher });

    expect(result).toEqual({ user: null });
    expect(requests[0]!.url.pathname).toBe("/user/by/username/nobody_here");
    expect(requests[0]!.url.searchParams.get("format")).toBe("simple");
  });

  it("joins user IDs and unwraps the profile list", async () => {
    const { fetcher, requests } = mockFetcher(() =>
      Response.json({ data: [{ id: "1" }, { id: "2" }], nextCursor: null, previousCursor: null, hasNextPage: false }),
    );

    const result = await twittrapiActionHandlers.get_users_by_ids({ userIds: ["1", "2"] }, { apiKey, fetcher });

    expect(result).toEqual({ users: [{ id: "1" }, { id: "2" }] });
    expect(requests[0]!.url.searchParams.get("ids")).toBe("1,2");
  });

  it("returns the unavailable stub for a post X does not return", async () => {
    const { fetcher, requests } = mockFetcher(() => Response.json({ data: { id: "42", unavailable: true } }));

    const result = await twittrapiActionHandlers.get_tweet({ tweetId: "42" }, { apiKey, fetcher });

    expect(result).toEqual({ tweet: { id: "42", unavailable: true } });
    expect(requests[0]!.url.pathname).toBe("/simpletweet/42");
  });

  it("maps a 402 to insufficient credit with the upstream message", async () => {
    const { fetcher } = mockFetcher(() => Response.json({ error: "No balance left" }, { status: 402 }));

    await expect(twittrapiActionHandlers.get_trends({ woeid: "1" }, { apiKey, fetcher })).rejects.toMatchObject({
      status: 402,
      code: "insufficient_credit",
      message: "No balance left",
    });
  });

  it("keeps a 401 during execution so the runtime asks to reconnect", async () => {
    const { fetcher } = mockFetcher(() => Response.json({ error: "Unknown API key" }, { status: 401 }));

    await expect(twittrapiActionHandlers.get_list_tweets({ listId: "123" }, { apiKey, fetcher })).rejects.toMatchObject(
      { status: 401, message: "Unknown API key" },
    );
  });

  it("rejects a page whose data is not an array", async () => {
    const { fetcher } = mockFetcher(() => Response.json({ data: { id: "1" } }));

    await expect(
      twittrapiActionHandlers.get_community_tweets({ communityId: "99" }, { apiKey, fetcher }),
    ).rejects.toMatchObject({ status: 502, message: "TwittrAPI response data must be an array." });
  });
});

describe("TwittrAPI credential validation", () => {
  it("reads the account ID from the free balance endpoint without the simple format", async () => {
    const { fetcher, requests } = mockFetcher(() =>
      Response.json({ user_id: 77, balance: 4.2, price_per_call: 0.0001, is_active: true }),
    );

    const result = await credentialValidators.apiKey!({ apiKey, values: {} }, { fetcher });

    expect(result).toEqual({
      profile: { accountId: "77", displayName: "TwittrAPI API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: "https://api.twittrapi.com", validationEndpoint: "/balance" },
    });
    expect(requests[0]!.url.toString()).toBe("https://api.twittrapi.com/balance");
    expect(requests[0]!.headers.get("x-api-key")).toBe(apiKey);
  });

  it("reports an unknown key as an input error", async () => {
    const { fetcher } = mockFetcher(() => Response.json({ error: "Unknown key" }, { status: 404 }));

    await expect(credentialValidators.apiKey!({ apiKey, values: {} }, { fetcher })).rejects.toMatchObject({
      status: 400,
      message: "Unknown key",
    });
  });
});
