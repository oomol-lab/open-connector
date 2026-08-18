import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { googlecalendarActions } from "./actions.ts";
import { googlecalendarEventActionHandlers } from "./runtime-events.ts";

const accessToken = "google-calendar-access-token";
const createdEvent = {
  id: "evt-1",
  etag: '"etag-1"',
  status: "confirmed",
  summary: "Standup",
};
const eventPayload = {
  summary: "Standup",
  start: { dateTime: "2026-08-19T09:00:00Z" },
  end: { dateTime: "2026-08-19T09:30:00Z" },
  attendees: [{ email: "alice@example.com" }],
};

interface CapturedRequest {
  method: string;
  url: URL;
  body: unknown;
  headers: Headers;
}

describe("googlecalendar event write sendUpdates", () => {
  it.each(["create_event", "update_event", "patch_event", "delete_event"] as const)(
    "exposes optional sendUpdates on %s without changing required fields",
    (name) => {
      const action = googlecalendarActions.find((candidate) => candidate.name === name);

      expect(action?.inputSchema.properties).toEqual(
        expect.objectContaining({
          sendUpdates: expect.objectContaining({
            type: "string",
            enum: ["all", "externalOnly", "none"],
          }),
        }),
      );
      expect(action?.inputSchema.required).not.toContain("sendUpdates");
    },
  );

  it("does not add sendUpdates to read-only get_event", () => {
    const action = googlecalendarActions.find((candidate) => candidate.name === "get_event");

    expect(action?.inputSchema.properties).not.toHaveProperty("sendUpdates");
  });

  it("forwards sendUpdates on create_event as a query param, not an event body field", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(createdEvent)]);

    const output = await createEvent(
      {
        calendarId: "cal-1",
        sendUpdates: "all",
        event: {
          ...eventPayload,
          conferenceData: { createRequest: { requestId: "meet-1" } },
        },
      },
      fetcher,
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.pathname).toBe("/calendar/v3/calendars/cal-1/events");
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBe("all");
    expect(requests[0]?.url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(requests[0]?.body).toEqual({
      ...eventPayload,
      conferenceData: { createRequest: { requestId: "meet-1" } },
    });
    expect(output).toEqual(createdEvent);
  });

  it("omits sendUpdates from create_event when the caller does not set a notification policy", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(createdEvent)]);

    await createEvent(
      {
        calendarId: "cal-1",
        event: eventPayload,
      },
      fetcher,
    );

    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBeNull();
  });

  it("keeps sendUpdates off the update_event GET and puts it on the PUT", async () => {
    const { fetcher, requests } = stubCalendarResponses([
      Response.json(createdEvent),
      Response.json({ ...createdEvent, summary: "Retro" }),
    ]);

    await updateEvent(
      {
        calendarId: "cal-1",
        eventId: "evt-1",
        sendUpdates: "externalOnly",
        event: { summary: "Retro" },
      },
      fetcher,
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBeNull();
    expect(requests[1]?.method).toBe("PUT");
    expect(requests[1]?.url.pathname).toBe("/calendar/v3/calendars/cal-1/events/evt-1");
    expect(requests[1]?.url.searchParams.get("sendUpdates")).toBe("externalOnly");
    expect(requests[1]?.headers.get("if-match")).toBe('"etag-1"');
    expect(requests[1]?.body).toMatchObject({ summary: "Retro" });
  });

  it("refuses update_event when the GET payload has no ETag", async () => {
    const { fetcher, requests } = stubCalendarResponses([
      Response.json({
        id: "evt-1",
        status: "confirmed",
        summary: "Standup",
      }),
    ]);

    await expect(
      updateEvent(
        {
          calendarId: "cal-1",
          eventId: "evt-1",
          event: { summary: "Retro" },
        },
        fetcher,
      ),
    ).rejects.toEqual(
      new ProviderRequestError(409, "cannot update event because Google Calendar did not provide an event ETag"),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
  });

  it("re-GETs and retries update_event PUT after an If-Match 412", async () => {
    const concurrentEvent = {
      ...createdEvent,
      etag: '"etag-2"',
      attendees: [{ email: "cara@example.com" }],
    };
    const { fetcher, requests } = stubCalendarResponses([
      Response.json(createdEvent),
      new Response(JSON.stringify({ error: { message: "Precondition Failed" } }), { status: 412 }),
      Response.json(concurrentEvent),
      Response.json({ ...concurrentEvent, summary: "Retro" }),
    ]);

    await updateEvent(
      {
        calendarId: "cal-1",
        eventId: "evt-1",
        sendUpdates: "all",
        event: { summary: "Retro" },
      },
      fetcher,
    );

    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT", "GET", "PUT"]);
    expect(requests[1]?.headers.get("if-match")).toBe('"etag-1"');
    expect(requests[1]?.url.searchParams.get("sendUpdates")).toBe("all");
    expect(requests[3]?.headers.get("if-match")).toBe('"etag-2"');
    expect(requests[3]?.url.searchParams.get("sendUpdates")).toBe("all");
    expect(requests[3]?.body).toMatchObject({
      summary: "Retro",
      attendees: [{ email: "cara@example.com" }],
    });
  });

  it("forwards sendUpdates on patch_event", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(createdEvent)]);

    await patchEvent(
      {
        calendarId: "cal-1",
        eventId: "evt-1",
        sendUpdates: "none",
        event: { location: "Room 2" },
      },
      fetcher,
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("PATCH");
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBe("none");
    expect(requests[0]?.body).toEqual({ location: "Room 2" });
  });

  it("forwards sendUpdates on delete_event", async () => {
    const { fetcher, requests } = stubCalendarResponses([new Response(null, { status: 204 })]);

    const output = await deleteEvent(
      {
        calendarId: "cal-1",
        eventId: "evt-1",
        sendUpdates: "all",
      },
      fetcher,
    );

    expect(output).toEqual({ success: true });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("DELETE");
    expect(requests[0]?.url.pathname).toBe("/calendar/v3/calendars/cal-1/events/evt-1");
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBe("all");
    expect(requests[0]?.body).toBeUndefined();
  });

  it("returns 400 when sendUpdates is not a supported notification policy", async () => {
    const { fetcher, requests } = stubCalendarResponses([]);

    await expect(
      createEvent(
        {
          calendarId: "cal-1",
          sendUpdates: "guests",
          event: eventPayload,
        },
        fetcher,
      ),
    ).rejects.toEqual(new ProviderRequestError(400, "sendUpdates must be all, externalOnly, or none"));
    expect(requests).toHaveLength(0);
  });

  it("rejects invalid update_event sendUpdates before reading the event", async () => {
    const { fetcher, requests } = stubCalendarResponses([]);

    await expect(
      updateEvent(
        {
          calendarId: "cal-1",
          eventId: "evt-1",
          sendUpdates: "guests",
          event: { summary: "Retro" },
        },
        fetcher,
      ),
    ).rejects.toEqual(new ProviderRequestError(400, "sendUpdates must be all, externalOnly, or none"));
    expect(requests).toHaveLength(0);
  });

  it("rejects a supplied empty sendUpdates instead of treating it as omitted", async () => {
    const { fetcher, requests } = stubCalendarResponses([]);

    await expect(
      createEvent(
        {
          calendarId: "cal-1",
          sendUpdates: "",
          event: eventPayload,
        },
        fetcher,
      ),
    ).rejects.toEqual(new ProviderRequestError(400, "sendUpdates must be all, externalOnly, or none"));
    expect(requests).toHaveLength(0);
  });
});

function createEvent(input: Record<string, unknown>, fetcher: ProviderFetch) {
  return googlecalendarEventActionHandlers.create_event(input, { accessToken, fetcher });
}

function updateEvent(input: Record<string, unknown>, fetcher: ProviderFetch) {
  return googlecalendarEventActionHandlers.update_event(input, { accessToken, fetcher });
}

function patchEvent(input: Record<string, unknown>, fetcher: ProviderFetch) {
  return googlecalendarEventActionHandlers.patch_event(input, { accessToken, fetcher });
}

function deleteEvent(input: Record<string, unknown>, fetcher: ProviderFetch) {
  return googlecalendarEventActionHandlers.delete_event(input, { accessToken, fetcher });
}

function stubCalendarResponses(responses: Response[]): { fetcher: ProviderFetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const pending = [...responses];
  const fetcher: ProviderFetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push({
      method: request.method,
      url: new URL(request.url),
      headers: request.headers,
      body:
        request.method === "GET" || request.method === "HEAD" || request.method === "DELETE"
          ? undefined
          : await request.json().catch(() => undefined),
    });
    const response = pending.shift();
    if (!response) {
      throw new Error(`Unexpected Google Calendar request to ${request.url}`);
    }
    return response;
  };
  return { fetcher, requests };
}
