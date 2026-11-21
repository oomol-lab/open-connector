import { describe, expect, it } from "vitest";
import { convertkitSubscriberEvent } from "./convertkit/trigger-on-subscriber-event.ts";
import { copperCrmEvent } from "./copper/trigger-on-crm-event.ts";
import { eventbriteEvent } from "./eventbrite/trigger-on-event.ts";
import { keapEvent } from "./keap/trigger-on-event.ts";

describe("Phase 4 new provider triggers", () => {
  it("convertkit.on_subscriber_event verifies callback token and emits subscriber events", async () => {
    const res = await convertkitSubscriberEvent.receive({
      admit: true,
      callbackSecret: "ck-sec",
      config: { eventName: "subscriber.subscriber_activate" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { subscriber: { id: 10, created_at: "2026-11-21T00:00:00Z" } },
      header: () => undefined,
      query: (name: string) => (name === "ck_token" ? "ck-sec" : undefined),
    } as never);
    expect(res).toMatchObject({ outcome: "event", outputs: { event: "subscriber.subscriber_activate" } });
  });

  it("copper.on_crm_event verifies body secret and matches resourceType/event", async () => {
    const res = await copperCrmEvent.receive({
      admit: true,
      callbackSecret: "cp-sec",
      config: { resourceType: "opportunity", event: "new" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: {
        subscription_id: 1,
        type: "opportunity",
        event: "new",
        ids: [42],
        timestamp: 1700000000,
        secret: { token: "cp-sec" },
      },
      header: () => undefined,
      query: () => undefined,
    } as never);
    expect(res).toMatchObject({ outcome: "event", outputs: { resourceType: "opportunity", event: "new" } });
  });

  it("eventbrite.on_event verifies token and emits subscribed action", async () => {
    const res = await eventbriteEvent.receive({
      admit: true,
      callbackSecret: "eb-sec",
      config: { organizationId: "org-1", actions: ["order.placed"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: {
        api_url: "https://www.eventbriteapi.com/v3/orders/1/",
        config: { action: "order.placed", webhook_id: "9" },
      },
      header: (name: string) => (name.toLowerCase() === "x-eventbrite-delivery" ? "eb-del-1" : undefined),
      query: (name: string) => (name === "eb_token" ? "eb-sec" : undefined),
    } as never);
    expect(res).toMatchObject({ outcome: "event", dedupeKey: "eb-del-1", outputs: { action: "order.placed" } });
  });

  it("keap.on_event echoes X-Hook-Secret handshake and emits REST hook events", async () => {
    const handshake = await keapEvent.receive({
      admit: true,
      callbackSecret: "kp-sec",
      config: { eventKey: "contact.add" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: {},
      header: (name: string) => (name.toLowerCase() === "x-hook-secret" ? "keap-verify-123" : undefined),
      query: (name: string) => (name === "keap_token" ? "kp-sec" : undefined),
    } as never);
    expect(handshake).toMatchObject({
      outcome: "respond",
      status: 200,
      headers: { "x-hook-secret": "keap-verify-123" },
    });

    const evt = await keapEvent.receive({
      admit: true,
      callbackSecret: "kp-sec",
      config: { eventKey: "contact.add" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { event_key: "contact.add", object_keys: [{ id: 88 }], timestamp: "2026-11-21T00:00:00Z" },
      header: () => undefined,
      query: (name: string) => (name === "keap_token" ? "kp-sec" : undefined),
    } as never);
    expect(evt).toMatchObject({ outcome: "event", outputs: { eventKey: "contact.add" } });
  });
});
