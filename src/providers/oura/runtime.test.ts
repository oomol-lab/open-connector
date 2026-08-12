import type { BearerProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { ouraActions } from "./actions.ts";
import { fetchOuraAccountProfile, ouraActionHandlers } from "./runtime.ts";

describe("Oura action catalog", () => {
  it("derives each action from what its collection actually supports", () => {
    // Heart rate is a time series: no document endpoint, timestamps instead of
    // days, and a `latest` shortcut. Ring configuration takes no time window.
    expect(ouraActions.map(({ name }) => name)).not.toContain("get_heartrate");
    expect(inputProperties("list_heartrate")).toEqual([
      "startDatetime",
      "endDatetime",
      "latest",
      "nextToken",
      "fields",
    ]);
    expect(inputProperties("list_daily_sleep")).toEqual(["startDate", "endDate", "nextToken", "fields"]);
    expect(inputProperties("list_ring_configuration")).toEqual(["nextToken", "fields"]);
  });
});

describe("Oura document requests", () => {
  it("maps the list query onto Oura query parameters", async () => {
    const requests: string[] = [];
    const output = await ouraActionHandlers.list_daily_sleep!(
      { startDate: "2026-08-01", endDate: "2026-08-10", fields: ["score", "day"], nextToken: "page-2" },
      context(recordingFetcher(requests, { data: [{ id: "doc-1" }], next_token: "page-3" })),
    );

    expect(requests).toEqual([
      "https://api.ouraring.com/v2/usercollection/daily_sleep?next_token=page-2&fields=score%2Cday&start_date=2026-08-01&end_date=2026-08-10",
    ]);
    expect(output).toEqual({ documents: [{ id: "doc-1" }], nextToken: "page-3" });
  });

  it("normalizes a missing next_token to null", async () => {
    const output = await ouraActionHandlers.list_workout!({}, context(jsonFetcher({ data: [], next_token: null })));

    expect(output).toEqual({ documents: [], nextToken: null });
  });

  it("uses the Oura path segment when it differs from the action name", async () => {
    const requests: string[] = [];
    await ouraActionHandlers.get_vo2_max!(
      { documentId: "doc 1" },
      context(recordingFetcher(requests, { id: "doc 1" })),
    );

    expect(requests).toEqual(["https://api.ouraring.com/v2/usercollection/vO2_max/doc%201"]);
  });

  it("reports an unknown document id as invalid input", async () => {
    await expect(
      ouraActionHandlers.get_daily_sleep!(
        { documentId: "missing" },
        context(jsonFetcher({ detail: "not found" }, 404)),
      ),
    ).rejects.toMatchObject({ status: 400, message: "not found" });
  });

  it("reports a lapsed subscription as an unauthorized credential", async () => {
    await expect(
      ouraActionHandlers.list_daily_sleep!({}, context(jsonFetcher({ detail: "subscription expired" }, 403))),
    ).rejects.toMatchObject({ status: 401, message: "subscription expired" });
  });

  it("summarizes validation errors returned as a detail list", async () => {
    await expect(
      ouraActionHandlers.list_daily_sleep!(
        { startDate: "yesterday" },
        context(jsonFetcher({ detail: [{ msg: "invalid start_date" }, { msg: "invalid end_date" }] }, 422)),
      ),
    ).rejects.toMatchObject({ status: 400, message: "invalid start_date; invalid end_date" });
  });
});

describe("Oura credential validation", () => {
  it("identifies the account by user id and email", async () => {
    const result = await fetchOuraAccountProfile(
      "oura-token",
      jsonFetcher({ id: "user-1", email: "runner@example.com", age: 33 }),
    );

    expect(result.profile).toEqual({ accountId: "user-1", displayName: "runner@example.com" });
  });

  it("falls back to the user id when the email scope was not granted", async () => {
    const result = await fetchOuraAccountProfile("oura-token", jsonFetcher({ id: "user-1", email: null }));

    expect(result.profile?.displayName).toBe("Oura user user-1");
  });

  it("reports a rejected token as invalid input so the user can fix it", async () => {
    await expect(fetchOuraAccountProfile("bad-token", jsonFetcher({ detail: "invalid token" }, 401))).rejects.toEqual(
      new ProviderRequestError(400, "invalid token"),
    );
  });
});

function inputProperties(actionName: string): string[] {
  const action = ouraActions.find(({ name }) => name === actionName);
  return Object.keys(action?.inputSchema.properties ?? {});
}

function context(fetcher: ProviderFetch): BearerProviderContext {
  return { accessToken: "oura-token", fetcher };
}

function jsonFetcher(payload: unknown, status = 200): ProviderFetch {
  return async () => Response.json(payload, { status });
}

function recordingFetcher(requests: string[], payload: unknown, status = 200): ProviderFetch {
  return async (input) => {
    requests.push(input instanceof Request ? input.url : input.toString());
    return Response.json(payload, { status });
  };
}
