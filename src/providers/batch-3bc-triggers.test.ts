import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chargebeeEvent } from "./chargebee/trigger-on-event.ts";
import { helpscoutConversationEvent } from "./helpscout/trigger-on-conversation-event.ts";
import { onfleetTaskEvent } from "./onfleet/trigger-on-task-event.ts";
import { paypalEvent } from "./paypal/trigger-on-event.ts";
import { postmarkEmailEvent } from "./postmark/trigger-on-email-event.ts";
import { basicAuthorizationHeader } from "./provider-runtime.ts";
import { taigaProjectEvent } from "./taiga/trigger-on-project-event.ts";
import { thehiveEvent } from "./thehive/trigger-on-event.ts";
import { wiseEvent } from "./wise/trigger-on-event.ts";
import { wufooFormEntry } from "./wufoo/trigger-on-form-entry.ts";

describe("Batch 3B & 3C SaaS triggers", () => {
  it("paypal.on_event receives wildcard and specific events", async () => {
    const res = await paypalEvent.receive({
      admit: true,
      callbackSecret: "pp-sec",
      config: { events: ["PAYMENT.CAPTURE.COMPLETED"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource_type: "capture" },
      header: () => undefined,
      query: (name: string) => (name === "pp_token" ? "pp-sec" : undefined),
    } as never);
    expect(res).toMatchObject({ outcome: "event", dedupeKey: "WH-1", outputs: { event: "PAYMENT.CAPTURE.COMPLETED" } });
  });

  it("chargebee.on_event polls events and advances checkpoint", async () => {
    const res = await chargebeeEvent.poll({
      config: { eventTypes: ["subscription_created"] },
      checkpoint: { occurredAt: 1000 },
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
    expect(res.checkpoint).toMatchObject({ occurredAt: 1060 });
  });

  it("postmark.on_email_event verifies Basic auth and emits Delivery events", async () => {
    const auth = basicAuthorizationHeader("oomol:pm-sec");
    const res = await postmarkEmailEvent.receive({
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

  it("wise.on_event verifies callback token and matches event_type", async () => {
    const res = await wiseEvent.receive({
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
    expect(res).toMatchObject({ outcome: "event", dedupeKey: "del-1" });
  });

  it("onfleet.on_task_event echoes GET check challenge and handles POST taskCompleted", async () => {
    const checkRes = await onfleetTaskEvent.receive({
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

  it("thehive.on_event polls alerts newer than checkpoint", async () => {
    const res = await thehiveEvent.poll({
      config: { resourceType: "alert" },
      checkpoint: { updatedAt: 100 },
      now: new Date("2026-11-21T00:00:00Z"),
      connector: {
        async execute() {
          return {
            status: 200,
            data: [
              { id: "a1", updatedAt: 90 },
              { id: "a2", updatedAt: 150 },
            ],
          };
        },
      },
    } as never);
    expect(res.events).toHaveLength(1);
    expect(res.events[0]).toMatchObject({ dedupeKey: "alert:a2:150" });
    expect(res.checkpoint).toEqual({ updatedAt: 150, seenIds: ["a2"] });

    // Boundary timestamp: unseen record a3 at same updatedAt=150 should emit while a2 is deduplicated
    const res2 = await thehiveEvent.poll({
      config: { resourceType: "alert" },
      checkpoint: res.checkpoint,
      now: new Date("2026-11-21T00:01:00Z"),
      connector: {
        async execute() {
          return {
            status: 200,
            data: [
              { id: "a3", updatedAt: 150 },
              { id: "a2", updatedAt: 150 },
            ],
          };
        },
      },
    } as never);
    expect(res2.events).toHaveLength(1);
    expect(res2.events[0]).toMatchObject({ dedupeKey: "alert:a3:150" });
    expect(res2.checkpoint).toEqual({ updatedAt: 150, seenIds: ["a2", "a3"] });
  });

  it("thehive.on_event paginates when more than 50 records are newer than checkpoint", async () => {
    const pages: Record<string, unknown[]> = {
      "0-50": Array.from({ length: 50 }, (_, i) => ({ id: `a${100 - i}`, updatedAt: 200 })),
      "50-100": [
        { id: "a50", updatedAt: 180 },
        { id: "a49", updatedAt: 90 },
      ],
    };
    const ranges: string[] = [];
    const res = await thehiveEvent.poll({
      config: { resourceType: "alert" },
      checkpoint: { updatedAt: 100 },
      now: new Date("2026-11-21T00:00:00Z"),
      connector: {
        async execute(req: { query?: Record<string, string> }) {
          const range = req.query?.range ?? "0-50";
          ranges.push(range);
          return { status: 200, data: pages[range] ?? [] };
        },
      },
    } as never);
    expect(ranges).toEqual(["0-50", "50-100"]);
    expect(res.events).toHaveLength(51);
    expect(res.hasMore).toBe(false);
    expect(res.checkpoint).toMatchObject({ updatedAt: 200 });
  });

  it("wufoo.on_form_entry validates HandshakeKey and emits EntryId", async () => {
    const res = await wufooFormEntry.receive({
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
