import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors, proxy } from "./executors.ts";
import { footballChartsApiBaseUrl } from "./runtime.ts";

interface CapturedRequest {
  url: string;
  method: string;
  authorization: string | null;
}

function contextWithKey(apiKey?: string): ExecutionContext {
  const credential: ResolvedCredential = apiKey
    ? {
        authType: "api_key",
        apiKey,
        values: { apiKey },
        profile: { accountId: "football_charts:fc_test_", displayName: "Football Charts API Key", grantedScopes: [] },
        metadata: {},
      }
    : { authType: "no_auth" };
  return { getCredential: async () => credential };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Football Charts actions", () => {
  it("executes keyless and keyed requests against the v1 endpoints", async () => {
    const requests = stubResponses([
      Response.json({
        count: 98,
        leagues: [{ league: "premier", name: "Premier League", country: "England", seasons: ["2026-2027"] }],
      }),
      Response.json({ league: "premier", season: "2026-2027", view: "luck", table: [] }),
      Response.json({ match: { slug: "england/premier-league/2026-11-07-arsenal-vs-chelsea" } }),
    ]);

    await executors["football_charts.list_leagues"]!({}, contextWithKey());
    await executors["football_charts.get_league_table"]!(
      { league: "premier", season: "2026-2027", view: "luck" },
      contextWithKey("fc_test_key_123"),
    );
    await executors["football_charts.get_match"]!(
      { slug: "england/premier-league/2026-11-07-arsenal-vs-chelsea" },
      contextWithKey("fc_test_key_123"),
    );

    expect(requests).toEqual([
      {
        method: "GET",
        url: `${footballChartsApiBaseUrl}/leagues/`,
        authorization: null,
      },
      {
        method: "GET",
        url: `${footballChartsApiBaseUrl}/leagues/premier/table/?season=2026-2027&view=luck`,
        authorization: "Bearer fc_test_key_123",
      },
      {
        method: "GET",
        url: `${footballChartsApiBaseUrl}/matches/england/premier-league/2026-11-07-arsenal-vs-chelsea/`,
        authorization: "Bearer fc_test_key_123",
      },
    ]);
  });

  it("maps season_gated 403 responses to invalid_input rather than authorization_failed", async () => {
    stubResponses([
      Response.json(
        {
          error: {
            code: "season_gated",
            message: "Season 2021-2022 is outside the free window (current and previous season).",
          },
        },
        { status: 403 },
      ),
    ]);

    const result = await executors["football_charts.get_results"]!(
      { league: "premier", season: "2021-2022" },
      contextWithKey("fc_test_key_123"),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "Season 2021-2022 is outside the free window (current and previous season).",
      },
    });
  });

  it("maps unknown_key 401 responses to authorization_failed in execute mode and preserves 429 retry-after", async () => {
    stubResponses([
      Response.json({ error: { code: "unknown_key", message: "API key not recognised." } }, { status: 401 }),
      Response.json(
        { error: { code: "anon_rate_limited", message: "Keyless limit is 20 requests/minute." } },
        { status: 429, headers: { "retry-after": "60" } },
      ),
    ]);

    const authResult = await executors["football_charts.list_leagues"]!({}, contextWithKey("fc_bad_key"));
    expect(authResult).toMatchObject({
      ok: false,
      error: { code: "authorization_failed", message: "API key not recognised." },
    });

    const rateResult = await executors["football_charts.list_leagues"]!({}, contextWithKey());
    expect(rateResult).toMatchObject({
      ok: false,
      error: {
        code: "rate_limited",
        message: "Keyless limit is 20 requests/minute.",
        details: { status: 429, details: { retryAfterSeconds: 60 } },
      },
    });
  });

  it("rejects malformed match slugs before issuing a network request", async () => {
    const requests = stubResponses([]);

    const result = await executors["football_charts.get_match"]!({ slug: "../leagues" }, contextWithKey());

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(requests).toHaveLength(0);
  });
});

describe("Football Charts credential validation and proxy", () => {
  it("validates an API key against /leagues/ and maps a 401 validation error to invalid_input", async () => {
    stubResponses([
      Response.json({ count: 98, leagues: [] }),
      Response.json({ error: { code: "unknown_key", message: "API key not recognised." } }, { status: 401 }),
    ]);

    const valid = await credentialValidators.apiKey!(
      { apiKey: "fc_valid_12345", values: { apiKey: "fc_valid_12345" } },
      { fetcher: fetch },
    );
    expect(valid).toMatchObject({
      profile: { accountId: "football_charts:fc_valid", displayName: "Football Charts API Key" },
      metadata: { apiBaseUrl: footballChartsApiBaseUrl, validationEndpoint: "/leagues/", leagueCount: 98 },
    });

    await expect(
      credentialValidators.apiKey!({ apiKey: "fc_bad", values: { apiKey: "fc_bad" } }, { fetcher: fetch }),
    ).rejects.toMatchObject({ status: 400, message: "API key not recognised." });
  });

  it("attaches optional Bearer auth on the proxy only when an api_key credential is configured", async () => {
    const requests = stubResponses([Response.json({ count: 98 }), Response.json({ count: 98 })]);

    await proxy({ method: "GET", endpoint: "/leagues/" }, contextWithKey());
    await proxy({ method: "GET", endpoint: "/leagues/" }, contextWithKey("fc_proxy_key"));

    expect(requests.map((r) => r.authorization)).toEqual([null, "Bearer fc_proxy_key"]);
  });
});

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      url: request.url,
      method: request.method,
      authorization: request.headers.get("authorization"),
    });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Football Charts request to ${request.url}`);
    }
    return response;
  });
  return requests;
}
