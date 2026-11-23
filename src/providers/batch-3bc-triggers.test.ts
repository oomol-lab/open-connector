import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chargebeeEvent } from "./chargebee/trigger-on-event.ts";
import { helpscoutConversationEvent } from "./helpscout/trigger-on-conversation-event.ts";
import { onfleetTaskEvent } from "./onfleet/trigger-on-task-event.ts";
import { paypalEvent } from "./paypal/trigger-on-event.ts";
import { postmarkEmailEvent } from "./postmark/trigger-on-email-event.ts";
import { basicAuthorizationHeader } from "./provider-runtime.ts";
import { taigaProjectEvent } from "./taiga/trigger-on-project-event.ts";
import { wiseEvent } from "./wise/trigger-on-event.ts";
import { wufooFormEntry } from "./wufoo/trigger-on-form-entry.ts";

describe("Batch 3B & 3C SaaS triggers", () => {
  it("paypal.on_event rejects events without the native verification headers", async () => {
    const res = await paypalEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "pp-sec",
      state: { subscription: { hookId: "hook" } },
      config: { events: ["PAYMENT.CAPTURE.COMPLETED"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource_type: "capture" },
      header: () => undefined,
      query: (name: string) => (name === "pp_token" ? "pp-sec" : undefined),
    } as never);
    expect(res).toMatchObject({ outcome: "respond", status: 401 });
  });

  it("chargebee.on_event polls events and advances checkpoint", async () => {
    const res = await chargebeeEvent.poll({
      config: { eventTypes: ["subscription_created"] },
      checkpoint: { baseline: 1000, baselineIds: "", scannedAt: 1000, seen: {}, scan: null },
      now: new Date("2026-11-21T00:00:00Z"),
      connector: {
        async execute() {
          return {
            status: 200,
            data: {
              list: [
                { event: { id: "ev_1", event_type: "subscription_created", occurred_at: 1050 } },
                { event: { id: "ev_2", event_type: "invoice_updated", occurred_at: 1060 } },
              ],
            },
          };
        },
      },
    } as never);
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({ dedupeKey: "ev_1" });
    expect(res.checkpoint).toMatchObject({
      scannedAt: Math.floor(new Date("2026-11-21T00:00:00Z").getTime() / 1000),
      scan: null,
    });
  });

  it("postmark.on_email_event verifies Basic auth and emits Delivery events", async () => {
    const auth = basicAuthorizationHeader("oomol:pm-sec");
    const res = await postmarkEmailEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "pm-sec",
      config: { messageStream: "outbound", events: ["Delivery"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { RecordType: "Delivery", MessageID: "msg-1", DeliveredAt: "2026-11-21T00:00:00Z" },
      header: (name: string) => (name.toLowerCase() === "authorization" ? auth : undefined),
      query: () => undefined,
    } as never);
    expect(res).toMatchObject({ outcome: "event", outputs: { recordType: "Delivery", messageId: "msg-1" } });
  });

  it("helpscout.on_conversation_event verifies HMAC-SHA1 Base64 signature", async () => {
    const raw = new TextEncoder().encode(JSON.stringify({ id: 501, userUpdatedAt: "2026-11-21T00:00:00Z" }));
    const sig = createHmac("sha1", "hs-sec").update(raw).digest("base64");
    const headers: Record<string, string> = {
      "x-helpscout-signature": sig,
      "x-helpscout-event": "convo.created",
    };
    const res = await helpscoutConversationEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "hs-sec",
      config: { events: ["convo.created"] },
      current: true,
      method: "POST",
      rawBody: raw,
      payload: { id: 501, userUpdatedAt: "2026-11-21T00:00:00Z" },
      header: (name: string) => headers[name.toLowerCase()],
      query: () => undefined,
    } as never);
    expect(res).toMatchObject({ outcome: "event", outputs: { event: "convo.created" } });
  });

  it("wise.on_event rejects unsigned events even with a valid callback token", async () => {
    const res = await wiseEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "wise-sec",
      config: { profileId: "123", triggerOn: "transfers#state-change" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { event_type: "transfers#state-change", subscription_id: "sub-1" },
      header: (name: string) => (name.toLowerCase() === "x-delivery-id" ? "del-1" : undefined),
      query: (name: string) => (name === "wise_token" ? "wise-sec" : undefined),
    } as never);
    expect(res).toMatchObject({ outcome: "respond", status: 401 });
  });

  it("onfleet.on_task_event echoes GET check challenge and handles POST taskCompleted", async () => {
    const checkRes = await onfleetTaskEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "of-sec",
      config: { trigger: "taskCompleted" },
      current: true,
      method: "GET",
      rawBody: new Uint8Array(),
      payload: {},
      header: () => undefined,
      query: (name: string) => (name === "of_token" ? "of-sec" : name === "check" ? "challenge-xyz" : undefined),
    } as never);
    expect(checkRes).toEqual({ outcome: "respond", status: 200, body: "challenge-xyz", contentType: "text/plain" });

    const postRes = await onfleetTaskEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "of-sec",
      config: { trigger: "taskCompleted" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { triggerName: "taskCompleted", taskId: "task-9", time: 1700000000 },
      header: () => undefined,
      query: (name: string) => (name === "of_token" ? "of-sec" : undefined),
    } as never);
    expect(postRes).toMatchObject({ outcome: "event", outputs: { triggerName: "taskCompleted", taskId: "task-9" } });
  });

  it("taiga.on_project_event verifies SHA-1 HMAC signature", async () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({ type: "issue", action: "create", date: "2026-11-21", data: { id: 7 } }),
    );
    const sig = createHmac("sha1", "tg-sec").update(raw).digest("hex");
    const res = await taigaProjectEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "tg-sec",
      config: { projectId: 1, types: ["issue"], actions: ["create"] },
      current: true,
      method: "POST",
      rawBody: raw,
      payload: { type: "issue", action: "create", date: "2026-11-21", data: { id: 7 } },
      header: (name: string) => (name.toLowerCase() === "x-taiga-webhook-signature" ? sig : undefined),
      query: () => undefined,
    } as never);
    expect(res).toMatchObject({ outcome: "event", outputs: { entityType: "issue", action: "create" } });
  });

  it("helpscout.on_conversation_event derives distinct deliveryIds for reply events with or without thread ID", async () => {
    const withThreadPayload = {
      id: 42,
      userUpdatedAt: "2026-11-21T00:00:00Z",
      _embedded: { threads: [{ id: 9001 }] },
    };
    const rawWithThread = Buffer.from(JSON.stringify(withThreadPayload));
    const sig1 = createHmac("sha1", "hs-sec").update(rawWithThread).digest("base64");
    const r1 = await helpscoutConversationEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "hs-sec",
      config: { events: ["convo.customer.reply.created"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(rawWithThread),
      payload: withThreadPayload,
      header: (k: string) =>
        ({ "x-helpscout-signature": sig1, "x-helpscout-event": "convo.customer.reply.created" })[k],
      query: () => undefined,
    } as never);
    expect(r1).toMatchObject({ outcome: "event", dedupeKey: "convo.customer.reply.created:42:9001" });

    // Without _embedded.threads, two distinct replies sharing userUpdatedAt produce distinct deliveryIds
    const pA = { id: 42, userUpdatedAt: "2026-11-21T00:00:00Z", preview: "first reply" };
    const pB = { id: 42, userUpdatedAt: "2026-11-21T00:00:00Z", preview: "second reply" };
    const rawA = Buffer.from(JSON.stringify(pA));
    const rawB = Buffer.from(JSON.stringify(pB));
    const rA = await helpscoutConversationEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "hs-sec",
      config: { events: ["convo.customer.reply.created"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(rawA),
      payload: pA,
      header: (k: string) =>
        ({
          "x-helpscout-signature": createHmac("sha1", "hs-sec").update(rawA).digest("base64"),
          "x-helpscout-event": "convo.customer.reply.created",
        })[k],
      query: () => undefined,
    } as never);
    const rB = await helpscoutConversationEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "hs-sec",
      config: { events: ["convo.customer.reply.created"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(rawB),
      payload: pB,
      header: (k: string) =>
        ({
          "x-helpscout-signature": createHmac("sha1", "hs-sec").update(rawB).digest("base64"),
          "x-helpscout-event": "convo.customer.reply.created",
        })[k],
      query: () => undefined,
    } as never);
    expect(rA.outcome).toBe("event");
    expect(rB.outcome).toBe("event");
    if (rA.outcome === "event" && rB.outcome === "event") {
      expect(rA.dedupeKey).not.toBe(rB.dedupeKey);
    }
  });

  it("wufoo.on_form_entry validates HandshakeKey and emits EntryId", async () => {
    const res = await wufooFormEntry.receive({
      connector: {},
      admit: true,
      callbackSecret: "wf-sec",
      config: { formHash: "z12345" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { HandshakeKey: "wf-sec", EntryId: "42" },
      header: () => undefined,
      query: () => undefined,
    } as never);
    expect(res).toMatchObject({ outcome: "event", dedupeKey: "42", outputs: { entryId: "42", formHash: "z12345" } });
  });
});
