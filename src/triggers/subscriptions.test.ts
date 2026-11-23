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
