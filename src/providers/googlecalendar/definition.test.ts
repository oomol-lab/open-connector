import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import { provider } from "./definition.ts";

const expectedOAuthScopes = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendars",
  "https://www.googleapis.com/auth/calendar.calendarlist",
  "https://www.googleapis.com/auth/calendar.settings.readonly",
  "https://www.googleapis.com/auth/calendar.acls",
  "https://www.googleapis.com/auth/calendar.acls.readonly",
  "openid",
  "email",
  "profile",
];

const calendarListReadonly = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const eventsFreeBusy = "https://www.googleapis.com/auth/calendar.events.freebusy";
const calendar = "https://www.googleapis.com/auth/calendar";
const expectedOptionalScopes = [calendarListReadonly, eventsFreeBusy, calendar];

// A host that writes events and lists calendars without the sensitive calendar.readonly: the
// identity scopes the userinfo validator reads, the events scope, and Google's two non-sensitive
// read scopes for calendarList.list / calendarList.get and freeBusy.query.
const narrowGrant = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  calendarListReadonly,
  eventsFreeBusy,
];
// A host that shares and deletes calendars: the identity scopes and the full calendar scope, which
// every Calendar API method accepts, so no narrower calendar scope rides beside it.
const fullGrant = ["openid", "email", "profile", calendar];

describe("Google Calendar provider definition", () => {
  it("does not request the redundant full-calendar scope alongside narrower scopes", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).toEqual(expectedOAuthScopes);
  });

  it("offers the non-sensitive read scopes and the full calendar scope on request only", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");
    if (oauth?.type !== "oauth2") throw new Error("Expected an oauth2 auth method");

    expect(oauth.optionalScopes).toEqual(expectedOptionalScopes);
    for (const scope of expectedOptionalScopes) expect(oauth.scopes).not.toContain(scope);
  });

  it("asks the declared scopes alone when a client config names none", () => {
    const service = configService();
    const config = service.normalizeConfig("googlecalendar", { clientId: "client-id", clientSecret: "client-secret" });

    expect(service.getEffectiveScopes("googlecalendar", config)).toEqual(expectedOAuthScopes);
  });

  it("lets a client config request the narrow grant without calendar.readonly", () => {
    const service = configService();
    const config = service.normalizeConfig("googlecalendar", {
      clientId: "client-id",
      clientSecret: "client-secret",
      requestedScopes: narrowGrant,
    });

    expect(config.requestedScopes).toEqual(narrowGrant);
    expect(service.getEffectiveScopes("googlecalendar", config)).toEqual(narrowGrant);
  });

  it("lets a client config request the full calendar scope alone beside the identity scopes", () => {
    const service = configService();
    const config = service.normalizeConfig("googlecalendar", {
      clientId: "client-id",
      clientSecret: "client-secret",
      requestedScopes: fullGrant,
    });

    expect(config.requestedScopes).toEqual(fullGrant);
    expect(service.getEffectiveScopes("googlecalendar", config)).toEqual(fullGrant);
  });

  it("still refuses a scope the definition does not declare", () => {
    expect(() =>
      configService().normalizeConfig("googlecalendar", {
        clientId: "client-id",
        clientSecret: "client-secret",
        requestedScopes: ["https://www.googleapis.com/auth/calendar.freebusy"],
      }),
    ).toThrow("requestedScopes contains a scope not declared by googlecalendar");
  });
});

function configService(): OAuthClientConfigService {
  return new OAuthClientConfigService({
    catalog: createCatalogStore([provider]),
    origin: "http://localhost:3000",
    store: new MemoryOAuthClientConfigStore(),
  });
}

class MemoryOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly configs = new Map<string, OAuthClientConfig>();

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return this.configs.get(service);
  }

  async set(config: OAuthClientConfig): Promise<void> {
    this.configs.set(config.service, config);
  }

  async delete(service: string): Promise<void> {
    this.configs.delete(service);
  }

  async list(): Promise<OAuthClientConfig[]> {
    return [...this.configs.values()];
  }
}
