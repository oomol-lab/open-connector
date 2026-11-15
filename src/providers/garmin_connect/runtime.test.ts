import type { ApiKeyProviderContext } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { garminConnectActionHandlers, validateGarminConnectApiKey } from "./runtime.ts";

const tokenUrl = "https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token";
const settingsUrl = "https://personal.connectapi.garmin.com/userprofile-service/userprofile/settings";

describe("Garmin Connect access tokens", () => {
  it("exchanges the key once and reuses the token across actions", async () => {
    const garmin = fakeGarmin({ [settingsUrl]: [json({}), json({})] });
    const context = contextFor("key-reuse", garmin.fetcher);

    await garminConnectActionHandlers.get_user_settings({}, context);
    await garminConnectActionHandlers.get_user_settings({}, context);

    expect(garmin.requests).toEqual([
      { url: tokenUrl, authorization: "ApiKey key-reuse" },
      { url: settingsUrl, authorization: "Bearer token-1" },
      { url: settingsUrl, authorization: "Bearer token-1" },
    ]);
  });

  it("renews a day-long token an hour before it expires", async () => {
    const garmin = fakeGarmin({ [settingsUrl]: [json({}), json({}), json({})] });
    const context = contextFor("key-renewal", garmin.fetcher);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-15T00:00:00Z") });
    try {
      await garminConnectActionHandlers.get_user_settings({}, context);
      vi.setSystemTime(Date.parse("2026-11-15T22:59:00Z"));
      await garminConnectActionHandlers.get_user_settings({}, context);
      vi.setSystemTime(Date.parse("2026-11-15T23:01:00Z"));
      await garminConnectActionHandlers.get_user_settings({}, context);
    } finally {
      vi.useRealTimers();
    }

    expect(garmin.requests.map((request) => request.authorization)).toEqual([
      "ApiKey key-renewal",
      "Bearer token-1",
      "Bearer token-1",
      "ApiKey key-renewal",
      "Bearer token-2",
    ]);
  });

  it("keeps a token issued in the key's last hour for half of its life", async () => {
    const garmin = fakeGarmin({ [settingsUrl]: [json({}), json({}), json({})] }, { expiresInSeconds: 40 * 60 });
    const context = contextFor("key-last-hour", garmin.fetcher);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-15T00:00:00Z") });
    try {
      await garminConnectActionHandlers.get_user_settings({}, context);
      vi.setSystemTime(Date.parse("2026-11-15T00:19:00Z"));
      await garminConnectActionHandlers.get_user_settings({}, context);
      vi.setSystemTime(Date.parse("2026-11-15T00:21:00Z"));
      await garminConnectActionHandlers.get_user_settings({}, context);
    } finally {
      vi.useRealTimers();
    }

    expect(garmin.requests.filter((request) => request.url === tokenUrl)).toHaveLength(2);
  });

  it("renews once when concurrent callers find the token due", async () => {
    const garmin = fakeGarmin({ [settingsUrl]: [json({}), json({}), json({})] });
    const context = contextFor("key-concurrent-renewal", garmin.fetcher);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-15T00:00:00Z") });
    try {
      await garminConnectActionHandlers.get_user_settings({}, context);
      vi.setSystemTime(Date.parse("2026-11-15T23:30:00Z"));
      await Promise.all([
        garminConnectActionHandlers.get_user_settings({}, context),
        garminConnectActionHandlers.get_user_settings({}, context),
      ]);
    } finally {
      vi.useRealTimers();
    }

    expect(garmin.requests.filter((request) => request.url === tokenUrl)).toHaveLength(2);
  });

  it("shares one exchange between concurrent callers", async () => {
    const garmin = fakeGarmin({ [settingsUrl]: [json({}), json({})] });
    const context = contextFor("key-concurrent", garmin.fetcher);

    await Promise.all([
      garminConnectActionHandlers.get_user_settings({}, context),
      garminConnectActionHandlers.get_user_settings({}, context),
    ]);

    expect(garmin.requests.filter((request) => request.url === tokenUrl)).toHaveLength(1);
  });

  it("retries once with a new token when Garmin rejects a cached one", async () => {
    const garmin = fakeGarmin({ [settingsUrl]: [json({}), empty(401), json({ displayName: "runner" })] });
    const context = contextFor("key-revoked-token", garmin.fetcher);

    await garminConnectActionHandlers.get_user_settings({}, context);
    const output = await garminConnectActionHandlers.get_user_settings({}, context);

    expect(output).toEqual({ settings: { displayName: "runner" } });
    expect(garmin.requests.map((request) => request.authorization)).toEqual([
      "ApiKey key-revoked-token",
      "Bearer token-1",
      "Bearer token-1",
      "ApiKey key-revoked-token",
      "Bearer token-2",
    ]);
  });

  it("renews once when concurrent callers hit the same rejected token", async () => {
    const garmin = fakeGarmin({
      [settingsUrl]: [json({}), empty(401), empty(401), empty(401), json({}), json({}), json({})],
    });
    const context = contextFor("key-concurrent-rejected", garmin.fetcher);

    await garminConnectActionHandlers.get_user_settings({}, context);
    await Promise.all([
      garminConnectActionHandlers.get_user_settings({}, context),
      garminConnectActionHandlers.get_user_settings({}, context),
      garminConnectActionHandlers.get_user_settings({}, context),
    ]);

    expect(garmin.requests.filter((request) => request.url === tokenUrl)).toHaveLength(2);
  });

  it("stops a caller's wait for a shared exchange when its signal aborts", async () => {
    let releaseToken: (response: Response) => void = () => {};
    const fetcher: ProviderFetch = async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === tokenUrl) return new Promise<Response>((resolve) => (releaseToken = resolve));
      return json({});
    };
    const controller = new AbortController();
    const waiting = garminConnectActionHandlers.get_user_settings(
      {},
      { apiKey: "key-abort", fetcher, signal: controller.signal },
    );

    controller.abort(new Error("caller gone"));

    await expect(waiting).rejects.toThrow("caller gone");
    releaseToken(new Response(jwt("token-1", 24 * 60 * 60)));
  });

  it("reports a deleted key as an authorization failure so the client reconnects", async () => {
    const garmin = fakeGarmin({}, { tokenStatus: 401 });

    await expect(
      garminConnectActionHandlers.get_user_settings({}, contextFor("key-deleted", garmin.fetcher)),
    ).rejects.toMatchObject({ status: 401, message: expect.stringContaining("create a new key") });
  });

  it("rejects a token response that is not a JWT", async () => {
    const fetcher: ProviderFetch = async () => new Response("not-a-token", { status: 200 });

    await expect(
      garminConnectActionHandlers.get_user_settings({}, contextFor("key-bad-token", fetcher)),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe("Garmin Connect credential validation", () => {
  it("identifies the account by the Garmin GUID in the token and the display name", async () => {
    const garmin = fakeGarmin({ [settingsUrl]: [json({ displayName: "runner" })] });

    const result = await validateGarminConnectApiKey("key-validate", garmin.fetcher);

    expect(result.profile).toEqual({ accountId: "guid-1", displayName: "runner" });
  });

  it("labels an account whose display name is a generated UUID", async () => {
    const garmin = fakeGarmin({ [settingsUrl]: [json({ displayName: "f0a4cf76-3e6b-49f5-b873-f7c7ff79e05b" })] });

    const result = await validateGarminConnectApiKey("key-uuid-name", garmin.fetcher);

    expect(result.profile).toEqual({ accountId: "guid-1", displayName: "Garmin Connect account" });
  });

  it("reports a rejected key as invalid input for the connect form", async () => {
    const garmin = fakeGarmin({}, { tokenStatus: 401 });

    await expect(validateGarminConnectApiKey("key-invalid", garmin.fetcher)).rejects.toEqual(
      new ProviderRequestError(
        400,
        "Garmin Connect rejected the Personal API key. It may have expired or been deleted; create a new key and reconnect.",
      ),
    );
  });
});

describe("Garmin Connect actions", () => {
  it("maps activity filters to query parameters and pages by offset", async () => {
    const activities = [{ activityId: 1 }, { activityId: 2 }];
    const url =
      "https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities?start=40&limit=2&startDate=2026-10-01&activityType=running&sortOrder=asc";
    const garmin = fakeGarmin({ [url]: [json(activities)] });

    const output = await garminConnectActionHandlers.list_activities(
      { start: 40, limit: 2, startDate: "2026-10-01", activityType: "running", sortOrder: "asc" },
      contextFor("key-activities", garmin.fetcher),
    );

    expect(output).toEqual({ activities, nextStart: 42 });
  });

  it("ends paging when a page holds fewer activities than the limit", async () => {
    const url =
      "https://personal.connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=20";
    const garmin = fakeGarmin({ [url]: [json([{ activityId: 1 }])] });

    const output = await garminConnectActionHandlers.list_activities({}, contextFor("key-last-page", garmin.fetcher));

    expect(output).toEqual({ activities: [{ activityId: 1 }], nextStart: null });
  });

  it("returns no HRV summaries when Garmin answers 204 No Content", async () => {
    const url = "https://personal.connectapi.garmin.com/hrv-service/hrv/daily/2026-01-01/2026-01-10";
    const garmin = fakeGarmin({ [url]: [empty(204)] });

    const output = await garminConnectActionHandlers.list_hrv_summaries(
      { startDate: "2026-01-01", endDate: "2026-01-10" },
      contextFor("key-hrv", garmin.fetcher),
    );

    expect(output).toEqual({ summaries: [] });
  });

  it("refuses a range longer than Garmin accepts before calling Garmin", async () => {
    const garmin = fakeGarmin({});

    await expect(
      garminConnectActionHandlers.list_body_battery(
        { startDate: "2026-09-01", endDate: "2026-10-02" },
        contextFor("key-long-range", garmin.fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("at most 31 days") });
    expect(garmin.requests).toEqual([]);
  });

  it("accepts a range of exactly the documented length", async () => {
    const url =
      "https://personal.connectapi.garmin.com/wellness-service/wellness/bodyBattery/reports/daily?startDate=2026-09-01&endDate=2026-10-01";
    const garmin = fakeGarmin({ [url]: [json([])] });

    const output = await garminConnectActionHandlers.list_body_battery(
      { startDate: "2026-09-01", endDate: "2026-10-01" },
      contextFor("key-max-range", garmin.fetcher),
    );

    expect(output).toEqual({ days: [] });
  });

  it("refuses an end date before the start date", async () => {
    await expect(
      garminConnectActionHandlers.list_weight(
        { startDate: "2026-10-02", endDate: "2026-10-01" },
        contextFor("key-reversed", fakeGarmin({}).fetcher),
      ),
    ).rejects.toMatchObject({ status: 400, message: "endDate must not be before startDate." });
  });

  it("reports an object response without its list instead of an empty result", async () => {
    const url =
      "https://personal.connectapi.garmin.com/usersummary-service/v2/dailysummaries?startDate=2026-11-01&endDate=2026-11-02";
    const garmin = fakeGarmin({ [url]: [json({})] });

    await expect(
      garminConnectActionHandlers.list_daily_summaries(
        { startDate: "2026-11-01", endDate: "2026-11-02" },
        contextFor("key-missing-list", garmin.fetcher),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("returns no sleep record for an empty body but rejects a list", async () => {
    const url = "https://personal.connectapi.garmin.com/sleep-service/sleep/dailySleep?date=2026-11-01";
    const garmin = fakeGarmin({ [url]: [empty(204), json([])] });
    const context = contextFor("key-sleep-shape", garmin.fetcher);

    await expect(garminConnectActionHandlers.get_sleep({ date: "2026-11-01" }, context)).resolves.toEqual({
      sleep: null,
    });
    await expect(garminConnectActionHandlers.get_sleep({ date: "2026-11-01" }, context)).rejects.toMatchObject({
      status: 502,
    });
  });

  it("stops reading a response body when the caller aborts", async () => {
    const garmin = fakeGarmin({
      [settingsUrl]: [
        new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } }),
      ],
    });
    const controller = new AbortController();
    const waiting = garminConnectActionHandlers.get_user_settings(
      {},
      { apiKey: "key-body-abort", fetcher: garmin.fetcher, signal: controller.signal },
    );
    setTimeout(() => controller.abort(new Error("caller gone")), 20);

    await expect(waiting).rejects.toBeDefined();
  });

  it("reports a response of the wrong shape instead of an empty result", async () => {
    const url =
      "https://personal.connectapi.garmin.com/usersummary-service/v2/dailysummaries?startDate=2026-11-01&endDate=2026-11-02";
    const garmin = fakeGarmin({ [url]: [json([])] });

    await expect(
      garminConnectActionHandlers.list_daily_summaries(
        { startDate: "2026-11-01", endDate: "2026-11-02" },
        contextFor("key-wrong-shape", garmin.fetcher),
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("passes Garmin's rate limit wait on to the caller", async () => {
    const garmin = fakeGarmin({
      [settingsUrl]: [
        Response.json(
          { count: 104, limit: 100, retryInSeconds: 21 },
          { status: 429, headers: { "retry-after": "21" } },
        ),
      ],
    });

    await expect(
      garminConnectActionHandlers.get_user_settings({}, contextFor("key-rate-limited", garmin.fetcher)),
    ).rejects.toMatchObject({ status: 429, details: { retryAfterSeconds: 21 } });
  });
});

interface RecordedRequest {
  url: string;
  authorization: string | null;
}

interface FakeGarminOptions {
  tokenStatus?: number;
  expiresInSeconds?: number;
}

interface FakeGarmin {
  fetcher: ProviderFetch;
  requests: RecordedRequest[];
}

/**
 * A Garmin Personal API stand-in: the token endpoint issues numbered JWTs and
 * every other URL answers with its queued responses in order.
 */
function fakeGarmin(responses: Record<string, Response[]>, options: FakeGarminOptions = {}): FakeGarmin {
  const requests: RecordedRequest[] = [];
  let issued = 0;
  const fetcher: ProviderFetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    if (url === tokenUrl) {
      if (options.tokenStatus !== undefined) return empty(options.tokenStatus);
      issued += 1;
      return new Response(jwt(`token-${issued}`, options.expiresInSeconds ?? 24 * 60 * 60), {
        headers: { "content-type": "text/plain" },
      });
    }
    const response = responses[url]?.shift();
    if (!response) throw new Error(`Unexpected request: ${url}`);
    return response;
  };
  return { fetcher, requests };
}

/**
 * The fake token carries its own name in the `jti` claim; `contextFor` maps
 * a bearer back to that name so assertions read `Bearer token-1`.
 */
function jwt(name: string, expiresInSeconds: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "none" })}.${encode({ jti: name, garmin_guid: "guid-1", iat: now, exp: now + expiresInSeconds })}.`;
}

function contextFor(apiKey: string, fetcher: ProviderFetch): ApiKeyProviderContext {
  const readable: ProviderFetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const bearer = headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) headers.set("authorization", `Bearer ${tokenName(bearer)}`);
    return fetcher(input, { ...init, headers });
  };
  return { apiKey, fetcher: readable };
}

function tokenName(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as { jti: string };
  return payload.jti;
}

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

function empty(status: number): Response {
  return new Response(null, { status });
}
