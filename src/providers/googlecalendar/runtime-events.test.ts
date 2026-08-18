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
const existingEvent = {
  id: "evt-1",
  status: "confirmed",
  summary: "Standup",
  attendees: [
    { email: "alice@example.com", displayName: "Alice", responseStatus: "accepted" },
    { email: "bob@example.com", responseStatus: "tentative" },
  ],
};


interface CapturedRequest {
  method: string;
  url: URL;
  body: unknown;
  headers: Headers;
}

describe("googlecalendar event write sendUpdates", () => {
  it.each(["create_event", "update_event", "patch_event", "delete_event", "move_event", "quick_add_event"] as const)(
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

  // events.import is the only event write Google does not accept sendUpdates on.
  it.each(["get_event", "list_events", "import_event"] as const)("does not add sendUpdates to %s", (name) => {
    const action = googlecalendarActions.find((candidate) => candidate.name === name);

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
    expect(requests[1]?.body).toEqual({ status: "confirmed", summary: "Retro" });
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
    ).rejects.toEqual(new ProviderRequestError(502, "googlecalendar returned an event without an etag"));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
  });

  it("refuses update_event when the event re-read after a 412 has no ETag", async () => {
    const { fetcher, requests } = stubCalendarResponses([
      Response.json(createdEvent),
      new Response(JSON.stringify({ error: { message: "Precondition Failed" } }), { status: 412 }),
      Response.json({ id: "evt-1", status: "confirmed", summary: "Standup" }),
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
    ).rejects.toEqual(new ProviderRequestError(502, "googlecalendar returned an event without an etag"));
    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT", "GET"]);
  });

  it("does not retry update_event when the PUT fails for a reason other than If-Match", async () => {
    const { fetcher, requests } = stubCalendarResponses([
      Response.json(createdEvent),
      new Response(JSON.stringify({ error: { message: "Insufficient permission" } }), { status: 403 }),
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
    ).rejects.toMatchObject({ status: 403, message: "Insufficient permission" });
    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT"]);
  });

  it("retries the update_event PUT at most once and surfaces a second If-Match 412", async () => {
    const { fetcher, requests } = stubCalendarResponses([
      Response.json(createdEvent),
      new Response(JSON.stringify({ error: { message: "Precondition Failed" } }), { status: 412 }),
      Response.json({ ...createdEvent, etag: '"etag-2"' }),
      new Response(JSON.stringify({ error: { message: "Precondition Failed" } }), { status: 412 }),
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
    ).rejects.toMatchObject({ status: 412, message: "Precondition Failed" });
    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT", "GET", "PUT"]);
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
    expect(requests[3]?.body).toEqual({
      status: "confirmed",
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

  it("still forwards sendUpdates on a delete_event that Google reports as already gone", async () => {
    const { fetcher, requests } = stubCalendarResponses([
      new Response(JSON.stringify({ error: { message: "Not Found" } }), { status: 404 }),
    ]);

    const output = await deleteEvent(
      {
        calendarId: "cal-1",
        eventId: "evt-1",
        sendUpdates: "none",
      },
      fetcher,
    );

    expect(output).toEqual({ success: true });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBe("none");
  });

  it("forwards sendUpdates on move_event alongside the destination calendar", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(createdEvent)]);

    await moveEvent(
      {
        calendarId: "cal-1",
        eventId: "evt-1",
        destinationCalendarId: "cal-2",
        sendUpdates: "all",
      },
      fetcher,
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.pathname).toBe("/calendar/v3/calendars/cal-1/events/evt-1/move");
    expect(requests[0]?.url.searchParams.get("destination")).toBe("cal-2");
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBe("all");
  });

  it("omits sendUpdates from move_event when the caller does not set a notification policy", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(createdEvent)]);

    await moveEvent({ calendarId: "cal-1", eventId: "evt-1", destinationCalendarId: "cal-2" }, fetcher);

    expect(requests[0]?.url.searchParams.get("destination")).toBe("cal-2");
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBeNull();
  });

  it("forwards sendUpdates on quick_add_event alongside the natural-language text", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(createdEvent)]);

    await quickAddEvent(
      {
        calendarId: "cal-1",
        text: "Standup tomorrow 9am",
        sendUpdates: "externalOnly",
      },
      fetcher,
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url.pathname).toBe("/calendar/v3/calendars/cal-1/events/quickAdd");
    expect(requests[0]?.url.searchParams.get("text")).toBe("Standup tomorrow 9am");
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBe("externalOnly");
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

describe("googlecalendar.add_attendee", () => {
  it("GETs the event then PATCHes a merged attendees array that keeps existing guests", async () => {
    const { fetcher, requests } = stubCalendarResponses([
      Response.json(existingEvent),
      Response.json({
        ...existingEvent,
        attendees: [
          ...existingEvent.attendees,
          { email: "cara@example.com", displayName: "Cara", optional: true, responseStatus: "needsAction" },
        ],
      }),
    ]);

    const output = await addAttendee(
      {
        eventId: "evt-1",
        calendarId: "cal-1",
        attendeeEmail: "cara@example.com",
        displayName: "Cara",
        optional: true,
      },
      fetcher,
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe("GET");
    expect(requests[0]?.url.pathname).toBe("/calendar/v3/calendars/cal-1/events/evt-1");
    expect(requests[0]?.url.searchParams.get("sendUpdates")).toBeNull();
    expect(requests[1]?.method).toBe("PATCH");
    expect(requests[1]?.url.pathname).toBe("/calendar/v3/calendars/cal-1/events/evt-1");
    expect(requests[1]?.url.searchParams.get("sendUpdates")).toBe("all");
    expect(requests[1]?.body).toEqual({
      attendees: [
        { email: "alice@example.com", displayName: "Alice", responseStatus: "accepted" },
        { email: "bob@example.com", responseStatus: "tentative" },
        { email: "cara@example.com", displayName: "Cara", optional: true },
      ],
    });
    expect(output).toMatchObject({
      id: "evt-1",
      attendees: expect.arrayContaining([
        expect.objectContaining({ email: "cara@example.com", displayName: "Cara", optional: true }),
      ]),
    });
  });

  it("returns the GET payload and skips PATCH when the email is already on the event", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(existingEvent)]);

    const output = await addAttendee(
      {
        eventId: "evt-1",
        calendarId: "cal-1",
        attendeeEmail: "Alice@Example.com",
      },
      fetcher,
    );

    expect(output).toEqual(existingEvent);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
  });

  it("sends sendUpdates=none on the PATCH URL when requested", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(existingEvent), Response.json(existingEvent)]);

    await addAttendee(
      {
        eventId: "evt-1",
        calendarId: "cal-1",
        attendeeEmail: "cara@example.com",
        sendUpdates: "none",
      },
      fetcher,
    );

    expect(requests).toHaveLength(2);
    expect(requests[1]?.method).toBe("PATCH");
    expect(requests[1]?.url.searchParams.get("sendUpdates")).toBe("none");
  });

  it("uses the primary calendar when calendarId is omitted", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(existingEvent), Response.json(existingEvent)]);

    await addAttendee(
      {
        eventId: "evt-1",
        attendeeEmail: "cara@example.com",
      },
      fetcher,
    );

    expect(requests).toHaveLength(2);
    expect(requests[0]?.url.pathname).toBe("/calendar/v3/calendars/primary/events/evt-1");
    expect(requests[1]?.url.pathname).toBe("/calendar/v3/calendars/primary/events/evt-1");
  });

  it("returns 400 when attendeeEmail is missing", async () => {
    const { fetcher, requests } = stubCalendarResponses([]);

    await expect(addAttendee({ eventId: "evt-1" }, fetcher)).rejects.toEqual(
      new ProviderRequestError(400, "attendeeEmail is required"),
    );
    expect(requests).toHaveLength(0);
  });

  it("returns 400 before fetching when sendUpdates is invalid", async () => {
    const { fetcher, requests } = stubCalendarResponses([]);

    await expect(
      addAttendee(
        {
          eventId: "evt-1",
          attendeeEmail: "cara@example.com",
          sendUpdates: "everyone",
        },
        fetcher,
      ),
    ).rejects.toEqual(new ProviderRequestError(400, "sendUpdates must be all, externalOnly, or none"));
    expect(requests).toHaveLength(0);
  });

  it("adds the first attendee when the event has no attendees array", async () => {
    const eventWithoutGuests = { id: "evt-1", status: "confirmed", summary: "Standup" };
    const { fetcher, requests } = stubCalendarResponses([
      Response.json(eventWithoutGuests),
      Response.json({
        ...eventWithoutGuests,
        attendees: [{ email: "cara@example.com" }],
      }),
    ]);

    await addAttendee(
      {
        eventId: "evt-1",
        calendarId: "cal-1",
        attendeeEmail: "cara@example.com",
      },
      fetcher,
    );

    expect(requests[1]?.body).toEqual({
      attendees: [{ email: "cara@example.com" }],
    });
  });

  it("preserves existing attendees' responseStatus and displayName in the PATCH body", async () => {
    const { fetcher, requests } = stubCalendarResponses([Response.json(existingEvent), Response.json(existingEvent)]);

    await addAttendee(
      {
        eventId: "evt-1",
        calendarId: "cal-1",
        attendeeEmail: "cara@example.com",
      },
      fetcher,
    );

    expect(requests[1]?.body).toEqual({
      attendees: [
        { email: "alice@example.com", displayName: "Alice", responseStatus: "accepted" },
        { email: "bob@example.com", responseStatus: "tentative" },
        { email: "cara@example.com" },
      ],
    });
  });
});

function addAttendee(input: Record<string, unknown>, fetcher: ProviderFetch) {
  return googlecalendarEventActionHandlers.add_attendee(input, { accessToken, fetcher });
}

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

function moveEvent(input: Record<string, unknown>, fetcher: ProviderFetch) {
  return googlecalendarEventActionHandlers.move_event(input, { accessToken, fetcher });
}

function quickAddEvent(input: Record<string, unknown>, fetcher: ProviderFetch) {
  return googlecalendarEventActionHandlers.quick_add_event(input, { accessToken, fetcher });
}

function stubCalendarResponses(responses: Response[]): { fetcher: ProviderFetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const pending = [...responses];
  const fetcher: ProviderFetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    // Only GET/HEAD are guaranteed body-less. Reading every other method, DELETE
    // included, is what makes "this request carried no body" a real assertion.
    const rawBody = request.method === "GET" || request.method === "HEAD" ? "" : await request.text().catch(() => "");
    requests.push({
      method: request.method,
      url: new URL(request.url),
      headers: request.headers,
      body: rawBody === "" ? undefined : parseCapturedBody(rawBody),
    });
    const response = pending.shift();
    if (!response) {
      throw new Error(`Unexpected Google Calendar request to ${request.url}`);
    }
    return response;
  };
  return { fetcher, requests };
}

function parseCapturedBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}
