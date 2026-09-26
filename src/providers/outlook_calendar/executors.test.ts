import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "calendar-token",
  tokenType: "Bearer",
  profile: { accountId: "calendar-user", displayName: "Calendar User", grantedScopes: [] },
  metadata: {},
};

beforeEach(() => setDefaultGuardedFetchDnsLookup(null));

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  vi.unstubAllGlobals();
});

describe("Outlook Calendar execution", () => {
  it("maps event fields and calendar selection to Microsoft Graph", async () => {
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({ id: "event-1", subject: "Planning" });
    });

    const result = await execute("create_event", {
      calendarId: "calendar/shared",
      preferTimeZone: "Pacific Standard Time",
      event: {
        subject: "Planning",
        start: { dateTime: "2026-09-16T10:00:00", timeZone: "Pacific Standard Time" },
        end: { dateTime: "2026-09-16T11:00:00", timeZone: "Pacific Standard Time" },
        attendees: [{ emailAddress: { address: "person@example.com" }, type: "required" }],
      },
    });

    expect(result).toEqual({ ok: true, output: { id: "event-1", subject: "Planning" } });
    expect(request?.url).toContain("/v1.0/me/calendars/calendar%2Fshared/events");
    expect(request?.headers.get("authorization")).toBe("Bearer calendar-token");
    expect(request?.headers.get("prefer")).toBe('outlook.timezone="Pacific Standard Time"');
    expect(await request?.json()).toMatchObject({ subject: "Planning" });
  });

  it("rejects a pagination URL outside the calendar endpoint allowlist", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await execute("list_events", {
      nextLink: "https://graph.microsoft.com/v1.0/me/messages?$top=1",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists a calendar view through calendarView/delta and returns the deltaLink with raw rows", async () => {
    const deltaLink = "https://graph.microsoft.com/v1.0/me/calendarView/delta?%24deltatoken=RFRM9";
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({
        value: [
          { id: "event-1", subject: "Planning" },
          { id: "event-2", "@removed": { reason: "deleted" } },
        ],
        "@odata.deltaLink": deltaLink,
      });
    });

    const result = await execute("list_calendar_view", {
      startDateTime: "2026-09-01T00:00:00Z",
      endDateTime: "2026-10-01T00:00:00Z",
      delta: true,
      preferTimeZone: "UTC",
    });

    expect(result).toEqual({
      ok: true,
      output: {
        events: [
          { id: "event-1", subject: "Planning" },
          { id: "event-2", "@removed": { reason: "deleted" } },
        ],
        nextLink: null,
        deltaLink,
      },
    });
    expect(request?.url).toContain("/v1.0/me/calendarView/delta?");
    expect(request?.url).toContain("startDateTime=2026-09-01T00%3A00%3A00Z");
    expect(request?.headers.get("prefer")).toBe('outlook.timezone="UTC"');
  });

  it("scopes the delta to a calendar and reports an in-round nextLink", async () => {
    const nextLink = "https://graph.microsoft.com/v1.0/me/calendars('AQMk')/calendarView/delta?%24skiptoken=RFRM9";
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({ value: [{ id: "event-1" }], "@odata.nextLink": nextLink });
    });

    const result = await execute("list_calendar_view", {
      calendarId: "AQMk",
      startDateTime: "2026-09-01T00:00:00Z",
      endDateTime: "2026-10-01T00:00:00Z",
      delta: true,
    });

    expect(result).toEqual({ ok: true, output: { events: [{ id: "event-1" }], nextLink, deltaLink: null } });
    expect(request?.url).toContain("/v1.0/me/calendars/AQMk/calendarView/delta?");
  });

  it("honours a calendar view deltaLink follow-up as the request URL", async () => {
    const deltaLink = "https://graph.microsoft.com/v1.0/me/calendars('AQMk')/calendarView/delta?%24deltatoken=RFRM9";
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({ value: [], "@odata.deltaLink": `${deltaLink}0` });
    });

    const result = await execute("list_calendar_view", {
      startDateTime: "2026-09-01T00:00:00Z",
      endDateTime: "2026-10-01T00:00:00Z",
      deltaLink,
      top: 5,
    });

    expect(result).toEqual({ ok: true, output: { events: [], nextLink: null, deltaLink: `${deltaLink}0` } });
    expect(request?.url).toBe(deltaLink);
  });

  it("accepts delta continuation URLs only for calendarView, on the three calendar shapes", async () => {
    for (const url of [
      "https://graph.microsoft.com/v1.0/me/calendarView/delta?%24deltatoken=RFRM9",
      "https://graph.microsoft.com/v1.0/me/calendars('AQMk')/calendarView/delta?%24skiptoken=RFRM9",
      "https://graph.microsoft.com/v1.0/me/calendars/AQMk/calendarView/delta?%24deltatoken=RFRM9",
    ]) {
      const fetch = vi.fn(async () => Response.json({ value: [] }));
      vi.stubGlobal("fetch", fetch);
      const result = await execute("list_calendar_view", {
        startDateTime: "2026-09-01T00:00:00Z",
        endDateTime: "2026-10-01T00:00:00Z",
        deltaLink: url,
      });
      expect(result).toEqual({ ok: true, output: { events: [], nextLink: null, deltaLink: null } });
      expect(fetch).toHaveBeenCalledTimes(1);
    }

    for (const url of [
      "https://graph.microsoft.com/v1.0/me/events/delta?%24deltatoken=RFRM9",
      "https://graph.microsoft.com/v1.0/me/calendars('AQMk')/events/delta",
      "https://graph.microsoft.com/v1.0/me/contacts/delta",
      "https://graph.microsoft.com/v1.0/me/delta",
      "https://graph.microsoft.com/v1.0/me/mailFolders('x')/messages/delta",
    ]) {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const result = await execute("list_calendar_view", {
        startDateTime: "2026-09-01T00:00:00Z",
        endDateTime: "2026-10-01T00:00:00Z",
        deltaLink: url,
      });
      expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it("keeps the plain event listing shape, with deltaLink null", async () => {
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({ value: [{ id: "event-1" }] });
    });

    const result = await execute("list_events", { top: 1 });

    expect(result).toEqual({ ok: true, output: { events: [{ id: "event-1" }], nextLink: null, deltaLink: null } });
    expect(request?.url).toBe("https://graph.microsoft.com/v1.0/me/events?%24top=1");
  });

  it("applies the pagination allowlist to uppercase URL schemes", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await execute("list_events", {
      nextLink: "HTTPS://graph.microsoft.com/v1.0/me/messages?$top=1",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

async function execute(actionName: string, input: Record<string, unknown>) {
  const context: ExecutionContext = {
    async getCredential(service) {
      expect(service).toBe("outlook_calendar");
      return credential;
    },
  };
  return executeAction(
    provider.actions.find((action) => action.name === actionName)!,
    executors[`outlook_calendar.${actionName}`],
    input,
    context,
  );
}
