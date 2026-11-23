import type { TriggerStore } from "./store.ts";
import type { SubscriptionOwner } from "./subscriptions.ts";

import { expect, test, vi } from "vitest";
import { postmarkEmailEvent } from "../providers/postmark/trigger-on-email-event.ts";
import { executeSubscription } from "./subscriptions.ts";

const owner: SubscriptionOwner = {
  tokenId: "token",
  service: "postmark",
  connectionId: "connection",
  triggerId: "postmark.on_email_event",
  connectionRevision: "1",
  providerAccountId: "account",
};

test.each([true, false])(
  "answers authenticated verification without claiming an active reconciliation lease (authorized=%s)",
  async (authorized) => {
    const claim = vi.fn(async () => false);
    const store = {
      getFlowTrigger: async () => ({
        ...owner,
        status: "active",
        callbackNonce: "nonce",
        callbackSecret: "secret",
        checkpoint: null,
        reconcileAt: 0,
      }),
      claimFlowTrigger: claim,
    } as unknown as TriggerStore;
    const result = await executeSubscription(
      store,
      postmarkEmailEvent,
      owner,
      {
        operation: "receive",
        subscriptionId: "id",
        method: "POST",
        admit: true,
        current: true,
        headers: {
          authorization: `Basic ${Buffer.from(`oomol:${authorized ? "secret" : "wrong"}`).toString("base64")}`,
        },
        query: { connector_subscription: "nonce" },
        rawBody: Buffer.from(
          JSON.stringify({ RecordType: "Delivery", MessageID: "883953f4-6105-42a2-a16a-77a8eac79483" }),
        ).toString("base64"),
      },
      {
        execute: async () => {
          throw new Error("Unexpected provider call");
        },
      },
      new AbortController().signal,
    );
    expect(result).toMatchObject({ result: { outcome: "respond", status: authorized ? 200 : 401 } });
    expect(claim).not.toHaveBeenCalled();
  },
);

test("verifies a legacy Trello delivery using the stored endpoint without skipping the signature", async () => {
  const { createHmac } = await import("node:crypto");
  const { trelloModelEvent } = await import("../providers/trello/trigger-on-model-event.ts");
  const { executeSubscriptionOperation } = await import("./subscriptions.ts");
  const record = {
    id: "legacy",
    status: "active",
    mode: "webhook",
    endpointUrl: "https://callback.example/trello",
    callbackNonce: "nonce",
    callbackSecret: "secret",
    config: { modelId: "model", actionTypes: [] },
    checkpoint: null,
    subscription: { hookId: "hook" },
    reconcileAt: 0,
  } as unknown as import("./store.ts").TriggerSubscription;
  const raw = JSON.stringify({ action: { id: "action", type: "updateCard" }, model: { id: "model" } });
  const callback = "https://callback.example/trello?connector_subscription=nonce&trello_token=secret";
  const signature = createHmac("sha1", "app-secret")
    .update(raw + callback)
    .digest("base64");
  const receive = (value: string) =>
    executeSubscriptionOperation(
      record,
      async () => {},
      trelloModelEvent,
      {
        operation: "receive",
        subscriptionId: "legacy",
        method: "POST",
        headers: { "content-type": "application/json", "x-trello-webhook": value },
        query: { connector_subscription: "nonce", trello_token: "secret" },
        rawBody: Buffer.from(raw).toString("base64"),
        current: true,
        admit: true,
      },
      {
        authType: "oauth2",
        oauthClientConfig: { clientId: "app", clientSecret: "app-secret" },
        execute: async () => {
          throw new Error("Unexpected provider request");
        },
      },
      new AbortController().signal,
    );
  expect(await receive(signature)).toMatchObject({ result: { outcome: "event" } });
  expect(await receive("invalid")).toMatchObject({ result: { outcome: "respond", status: 401 } });
});

test("keeps the default body limit before the handshake fast path", async () => {
  const store = {
    getFlowTrigger: async () => ({
      ...owner,
      status: "active",
      callbackNonce: "nonce",
      callbackSecret: "secret",
      checkpoint: null,
      reconcileAt: 0,
    }),
  } as unknown as TriggerStore;
  await expect(
    executeSubscription(
      store,
      postmarkEmailEvent,
      owner,
      {
        operation: "receive",
        subscriptionId: "id",
        method: "POST",
        admit: true,
        current: true,
        headers: { authorization: `Basic ${Buffer.from("oomol:secret").toString("base64")}` },
        query: { connector_subscription: "nonce" },
        rawBody: Buffer.from(
          JSON.stringify({
            RecordType: "Delivery",
            MessageID: "883953f4-6105-42a2-a16a-77a8eac79483",
            padding: "x".repeat(70_000),
          }),
        ).toString("base64"),
      },
      {
        execute: async () => {
          throw new Error("Unexpected provider call");
        },
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "invalid_input", message: "Webhook body is too large" });
});
