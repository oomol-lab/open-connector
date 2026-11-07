import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { calActionHandlers } from "./runtime.ts";

const accessToken = "cal-access-token";
const eventType = { id: 7466762, slug: "30min", lengthInMinutes: 30 };
const booking = { uid: "booking-1", status: "accepted", start: "2026-11-11T12:00:00.000Z" };
const schedule = { id: 1, name: "Working hours", timeZone: "America/Sao_Paulo" };
const slots = {
  "2026-11-11": [{ start: "2026-11-11T09:00:00.000-03:00" }, { start: "2026-11-11T09:30:00.000-03:00" }],
};

describe("cal runtime reads the Cal.com v2 data envelope", () => {
  it.each([
    ["list_event_types", {}, [eventType], { eventTypes: [eventType] }],
    ["get_event_type", { eventTypeId: 7466762 }, eventType, { eventType }],
    [
      "get_available_slots_info",
      { eventTypeSlug: "30min", username: "pedro", start: "2026-11-11", end: "2026-11-12" },
      slots,
      { slots },
    ],
    ["list_bookings", {}, [booking], { bookings: [booking], pagination: null }],
    ["get_booking", { bookingUid: "booking-1" }, booking, { booking }],
    ["create_booking", { eventTypeId: 7466762, start: "2026-11-11T12:00:00.000Z" }, booking, { booking }],
    [
      "create_booking",
      { eventTypeId: 7466762, start: "2026-11-11T12:00:00.000Z" },
      [booking, booking],
      { booking: [booking, booking] },
    ],
    ["cancel_booking", { bookingUid: "booking-1" }, booking, { booking }],
    ["list_schedules", {}, [schedule], { schedules: [schedule] }],
    ["get_default_schedule", {}, schedule, { schedule }],
  ] as const)("returns the %s result from data", async (name, input, data, expected) => {
    const fetcher = stubCalResponse({ status: "success", data });

    await expect(calActionHandlers[name]!({ ...input }, { accessToken, fetcher })).resolves.toEqual(expected);
  });
});

function stubCalResponse(payload: unknown): ProviderFetch {
  return async () => new Response(JSON.stringify(payload), { status: 200 });
}
