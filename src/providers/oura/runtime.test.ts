import type { JsonSchema } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { ouraActions } from "./actions.ts";
import { ouraDocumentCollections, ouraOauthScopes } from "./collections.ts";
import { fetchOuraAccountProfile, ouraActionHandlers, parseOuraGrantedScopes } from "./runtime.ts";

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

describe("Oura OAuth scopes", () => {
  it("requests every scope its collections read from", () => {
    const requested = new Set(ouraOauthScopes);
    const unrequested = ouraDocumentCollections
      .filter(({ scope }) => !requested.has(scope))
      .map(({ name, scope }) => `${name} needs ${scope}`);

    expect(unrequested).toEqual([]);
  });

  it("uses the scope Oura enforces, not the collection's daily summary neighbours", () => {
    // Oura gates these behind their own scopes even though they are published
    // next to the daily summaries; requesting `daily` alone returns 401.
    expect(scopeFor("daily_cardiovascular_age")).toBe("heart_health");
    expect(scopeFor("vo2_max")).toBe("heart_health");
    expect(scopeFor("daily_resilience")).toBe("stress");
    expect(scopeFor("ring_configuration")).toBe("ring_configuration");
    expect(scopeFor("ring_battery_level")).toBe("ring_configuration");
    expect(scopeFor("daily_spo2")).toBe("spo2");
  });
});

describe("Oura list item schemas", () => {
  it("promises a document id only where Oura serves documents by id", () => {
    // Heart rate and ring battery level are time series: Oura returns bare
    // samples with no identifier and no single-document endpoint to use one on.
    expect(listItemSchema("list_daily_sleep").properties).toHaveProperty("id");
    expect(listItemSchema("list_heartrate").properties).toBeUndefined();
    expect(listItemSchema("list_ring_battery_level").properties).toBeUndefined();
    expect(String(listItemSchema("list_heartrate").description)).not.toContain("`id` is always present");
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

describe("Oura granted scopes", () => {
  it("reports granted scopes in the same vocabulary the actions require", () => {
    // Oura grants `extapi:`-prefixed scopes but its 401s, and this catalog,
    // name them bare, so callers could never match one against the other.
    expect(parseOuraGrantedScopes("extapi:daily extapi:heart_health")).toEqual(["daily", "heart_health"]);
  });

  it("keeps a scope that carries no Oura prefix", () => {
    expect(parseOuraGrantedScopes("daily personal")).toEqual(["daily", "personal"]);
  });

  it("has nothing to report without a scope string", () => {
    expect(parseOuraGrantedScopes(undefined)).toEqual([]);
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

function listItemSchema(actionName: string): JsonSchema {
  const action = ouraActions.find(({ name }) => name === actionName);
  const documents = action?.outputSchema.properties as Record<string, JsonSchema>;
  return documents.documents!.items as JsonSchema;
}

function scopeFor(collectionName: string): string | undefined {
  return ouraDocumentCollections.find(({ name }) => name === collectionName)?.scope;
}

function inputProperties(actionName: string): string[] {
  const action = ouraActions.find(({ name }) => name === actionName);
  return Object.keys(action?.inputSchema.properties ?? {});
}

function context(fetcher: ProviderFetch): OAuthProviderContext {
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
