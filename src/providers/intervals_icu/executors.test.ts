import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors, proxy } from "./executors.ts";

const apiUrl = "https://intervals.icu/api/v1";
const basicApiKey = `Basic ${Buffer.from("API_KEY:test-key").toString("base64")}`;

interface CapturedRequest {
  url: string;
  authorization: string | null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Intervals.icu actions", () => {
  it("reads the key's own athlete with the API_KEY user name and comma-separated list parameters", async () => {
    const requests = stubResponses([
      Response.json({ athlete: { id: "i12345", name: "Test Athlete" }, sharedFolders: [] }),
      Response.json([{ id: "i55751783", name: "Morning Run" }]),
      Response.json([{ type: "heartrate", data: [120, 121] }]),
      Response.json([]),
    ]);

    const athlete = await executors["intervals_icu.get_athlete"]!({}, contextWithKey());
    await executors["intervals_icu.list_activities"]!(
      { oldest: "2026-11-01", newest: "2026-11-16", fields: ["id", "name"] },
      contextWithKey(),
    );
    await executors["intervals_icu.get_activity_streams"]!(
      { activityId: "i55751783", types: ["heartrate", "watts"] },
      contextWithKey(),
    );
    await executors["intervals_icu.list_events"]!({ categories: ["WORKOUT", "RACE_A"] }, contextWithKey());

    expect(athlete).toMatchObject({ ok: true, output: { athlete: { id: "i12345", name: "Test Athlete" } } });
    expect(requests).toEqual([
      { url: `${apiUrl}/athlete/0/profile`, authorization: basicApiKey },
      {
        url: `${apiUrl}/athlete/0/activities?oldest=2026-11-01&newest=2026-11-16&limit=30&fields=id%2Cname`,
        authorization: basicApiKey,
      },
      { url: `${apiUrl}/activity/i55751783/streams?types=heartrate%2Cwatts`, authorization: basicApiKey },
      { url: `${apiUrl}/athlete/0/events?category=WORKOUT%2CRACE_A`, authorization: basicApiKey },
    ]);
  });

  it("rejects a range that ends on an earlier day without calling Intervals.icu", async () => {
    const requests = stubResponses([Response.json([])]);

    const reversed = await executors["intervals_icu.list_wellness"]!(
      { oldest: "2026-11-16", newest: "2026-11-01" },
      contextWithKey(),
    );
    const sameDay = await executors["intervals_icu.list_activities"]!(
      { oldest: "2026-11-16T09:00:00", newest: "2026-11-16" },
      contextWithKey(),
    );

    expect(reversed).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "newest must not be before oldest." },
    });
    expect(sameDay).toMatchObject({ ok: true });
    expect(requests.map((request) => request.url)).toEqual([
      `${apiUrl}/athlete/0/activities?oldest=2026-11-16T09%3A00%3A00&newest=2026-11-16&limit=30`,
    ]);
  });

  it("refuses an activity id that would leave the activity path", async () => {
    const requests = stubResponses([]);

    const result = await executors["intervals_icu.get_activity"]!({ activityId: ".." }, contextWithKey());

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "activityId is not a valid activity identifier." },
    });
    expect(requests).toEqual([]);
  });

  it("asks to reconnect only for a rejected key and keeps the rate limit pacing hint", async () => {
    stubResponses([
      Response.json({ status: 401, error: "Unauthorized" }, { status: 401 }),
      Response.json({ status: 403, error: "Forbidden" }, { status: 403 }),
      Response.json({ status: 429, error: "Too Many Requests" }, { status: 429, headers: { "retry-after": "60" } }),
    ]);

    const rejectedKey = await executors["intervals_icu.get_athlete"]!({}, contextWithKey());
    const refused = await executors["intervals_icu.get_event"]!({ eventId: 42 }, contextWithKey());
    const limited = await executors["intervals_icu.list_sport_settings"]!({}, contextWithKey());

    expect(rejectedKey).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
    expect(refused).toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "Intervals.icu refused access to this resource." },
    });
    expect(limited).toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429, details: { retryAfterSeconds: 60 } } },
    });
  });
});

describe("Intervals.icu proxy", () => {
  it("sends the API key as Basic auth and serves only API paths", async () => {
    const requests = stubResponses([Response.json([])]);

    const allowed = await proxy({ method: "GET", endpoint: "/api/v1/athlete/0/gear" }, contextWithKey());
    const refused = await proxy({ method: "GET", endpoint: "/settings" }, contextWithKey());

    expect(allowed).toMatchObject({ ok: true });
    expect(refused).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "endpoint is not supported for this provider" },
    });
    expect(requests).toEqual([{ url: `${apiUrl}/athlete/0/gear`, authorization: basicApiKey }]);
  });
});

function contextWithKey(): ExecutionContext {
  const credential: ResolvedCredential = {
    authType: "api_key",
    apiKey: "test-key",
    values: { apiKey: "test-key" },
    profile: { accountId: "i12345", displayName: "Test Athlete", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

function stubResponses(responses: Response[]): CapturedRequest[] {
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({ url: request.url, authorization: request.headers.get("authorization") });
    const response = responses.shift();
    if (!response) {
      throw new Error(`Unexpected Intervals.icu request to ${request.url}`);
    }
    return response;
  });
  return requests;
}
