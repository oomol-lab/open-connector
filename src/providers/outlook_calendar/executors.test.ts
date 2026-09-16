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
