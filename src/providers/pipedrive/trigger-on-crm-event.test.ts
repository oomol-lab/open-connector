import { describe, expect, it } from "vitest";
import { basicAuthorizationHeader } from "../provider-runtime.ts";
import { pipedriveCrmEvent } from "./trigger-on-crm-event.ts";

describe("Pipedrive CRM v2 trigger", () => {
  it("reconciles organization.created webhook subscriptions", async () => {
    const requests: { endpoint: string; method: string; body?: unknown }[] = [];
    let savedSub: Record<string, unknown> = {};
    const state = {
      checkpoint: null,
      subscription: {} as Record<string, unknown>,
      async saveCheckpoint() {},
      async saveSubscription(sub: Record<string, unknown>) {
        state.subscription = sub;
        savedSub = sub;
      },
    };
    const result = await pipedriveCrmEvent.reconcile({
      active: true,
      callbackSecret: "secret-123",
      config: { eventType: "organization.created" },
      endpointUrl: "https://hooks.example/pipedrive",
      idempotencyKey: "req-1",
      now: new Date("2026-11-21T00:00:00.000Z"),
      state,
      connector: {
        async execute(req: { endpoint: string; method: string; body?: unknown }) {
          requests.push({ endpoint: req.endpoint, method: req.method, body: req.body });
          if (req.endpoint === "/v1/users/me") {
            return { status: 200, data: { success: true, data: { company_id: 9876 } } };
          }
          if (req.endpoint === "/v1/webhooks" && req.method === "GET") {
            return { status: 200, data: { success: true, data: [] } };
          }
          if (req.endpoint === "/v1/webhooks" && req.method === "POST") {
            return { status: 200, data: { success: true, data: { id: 555 } } };
          }
          throw new Error(`Unexpected request: ${req.method} ${req.endpoint}`);
        },
      },
    } as never);

    expect(result).toEqual({ outcome: "ready" });
    expect(requests.find((r) => r.method === "POST")?.body).toMatchObject({
      subscription_url: "https://hooks.example/pipedrive",
      event_action: "create",
      event_object: "organization",
      version: "2.0",
    });
    expect(savedSub).toMatchObject({ companyId: "9876", hookId: "555" });
  });

  it("receives organization.updated v2 events and ignores mismatched entities", async () => {
    const auth = basicAuthorizationHeader("oomol:secret-123");
    const baseContext = {
      admit: true,
      callbackSecret: "secret-123",
      config: { eventType: "organization.updated" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      state: { checkpoint: null, subscription: { companyId: "9876", hookId: "555" } },
      header: (name: string) => (name.toLowerCase() === "authorization" ? auth : undefined),
      query: () => undefined,
    };

    const matched = await pipedriveCrmEvent.receive({
      ...baseContext,
      payload: {
        meta: {
          version: "2.0",
          company_id: 9876,
          webhook_id: 555,
          entity: "organization",
          action: "change",
          id: "evt-org-1",
          entity_id: 321,
        },
        data: { id: 321, name: "Acme Corp" },
        previous: { name: "Acme" },
      },
    } as never);

    expect(matched).toMatchObject({
      outcome: "event",
      dedupeKey: "evt-org-1",
      outputs: { event: "organization.updated", deliveryId: "evt-org-1", objectId: "321" },
    });

    const ignored = await pipedriveCrmEvent.receive({
      ...baseContext,
      payload: {
        meta: {
          version: "2.0",
          company_id: 9876,
          webhook_id: 555,
          entity: "deal",
          action: "change",
          id: "evt-deal-1",
          entity_id: 100,
        },
        data: { id: 100 },
      },
    } as never);

    expect(ignored).toMatchObject({ outcome: "ignored" });
  });

  it("receives organization.deleted v2 events with null data", async () => {
    const auth = basicAuthorizationHeader("oomol:secret-123");
    const deleted = await pipedriveCrmEvent.receive({
      admit: true,
      callbackSecret: "secret-123",
      config: { eventType: "organization.deleted" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      state: { checkpoint: null, subscription: { companyId: "9876", hookId: "555" } },
      header: (name: string) => (name.toLowerCase() === "authorization" ? auth : undefined),
      query: () => undefined,
      payload: {
        meta: {
          version: "2.0",
          company_id: 9876,
          webhook_id: 555,
          entity: "organization",
          action: "delete",
          id: "evt-org-del-1",
          entity_id: 321,
        },
        data: null,
        previous: { id: 321, name: "Acme Corp" },
      },
    } as never);

    expect(deleted).toMatchObject({
      outcome: "event",
      dedupeKey: "evt-org-del-1",
      outputs: { event: "organization.deleted", deliveryId: "evt-org-del-1", objectId: "321" },
    });
  });
});
