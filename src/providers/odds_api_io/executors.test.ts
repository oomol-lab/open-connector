import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

const apiKey = "odds-api-io-test-key";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown, status = 200): URL[] {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    requests.push(new URL(String(input)));
    return Response.json(body, { status });
  });
  return requests;
}

const context: ExecutionContext = {
  async getCredential() {
    return {
      authType: "api_key",
      apiKey,
      values: { apiKey },
      profile: { accountId: "odds_api_io:api-key", displayName: "Odds-API.io API Key", grantedScopes: [] },
      metadata: {},
    };
  },
};

describe("Odds-API.io actions", () => {
  it("sends event filters as query parameters and joins statuses", async () => {
    const events = [{ id: 101, home: "Arsenal", away: "Chelsea", status: "pending" }];
    const requests = stubFetch(events);

    const result = await executors["odds_api_io.list_events"]!(
      {
        sport: "football",
        league: "england-premier-league",
        status: ["pending", "live"],
        from: "2026-11-14T00:00:00Z",
        limit: 50,
      },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { events } });
    expect(requests).toHaveLength(1);
    const url = requests[0]!;
    expect(`${url.origin}${url.pathname}`).toBe("https://api.odds-api.io/v3/events");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      apiKey,
      sport: "football",
      league: "england-premier-league",
      status: "pending,live",
      from: "2026-11-14T00:00:00Z",
      limit: "50",
    });
  });

  it("requests odds for several events with comma-separated IDs and bookmakers", async () => {
    const requests = stubFetch([{ id: 1, bookmakers: {} }]);

    const result = await executors["odds_api_io.get_multi_odds"]!(
      { eventIds: [1, 2], bookmakers: ["Bet365", "Unibet"] },
      context,
    );

    expect(result).toMatchObject({ ok: true, output: { events: [{ id: 1, bookmakers: {} }] } });
    const url = requests[0]!;
    expect(url.pathname).toBe("/v3/odds/multi");
    expect(url.searchParams.get("eventIds")).toBe("1,2");
    expect(url.searchParams.get("bookmakers")).toBe("Bet365,Unibet");
    expect(url.searchParams.get("apiKey")).toBe(apiKey);
  });

  it("reads one event by ID from the path", async () => {
    const requests = stubFetch({ id: 42, home: "Lakers", away: "Celtics" });

    const result = await executors["odds_api_io.get_event"]!({ eventId: 42 }, context);

    expect(result).toMatchObject({ ok: true, output: { id: 42 } });
    expect(requests[0]!.pathname).toBe("/v3/events/42");
  });

  it("rejects a non-array list response", async () => {
    stubFetch({ error: "unexpected" });

    const result = await executors["odds_api_io.list_sports"]!({}, context);

    expect(result).toMatchObject({ ok: false });
  });
});

describe("Odds-API.io credential validation", () => {
  it("validates the key against the selected bookmakers endpoint", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey, values: {} },
      {
        fetcher: async (url) => {
          const parsed = new URL(String(url));
          expect(parsed.pathname).toBe("/v3/bookmakers/selected");
          expect(parsed.searchParams.get("apiKey")).toBe(apiKey);
          return Response.json({ bookmakers: ["Bet365"], count: 1 });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "odds_api_io:api-key" },
      metadata: { validationEndpoint: "/bookmakers/selected", selectedBookmakers: 1 },
    });
  });

  it.each([
    { upstreamStatus: 401, expectedStatus: 400 },
    { upstreamStatus: 403, expectedStatus: 400 },
    { upstreamStatus: 429, expectedStatus: 429 },
  ])("maps upstream $upstreamStatus to $expectedStatus", async ({ upstreamStatus, expectedStatus }) => {
    const payload = { error: "Invalid API key" };
    await expect(
      credentialValidators.apiKey!(
        { apiKey, values: {} },
        { fetcher: async () => Response.json(payload, { status: upstreamStatus }) },
      ),
    ).rejects.toMatchObject({ status: expectedStatus, message: "Invalid API key" });
  });
});
