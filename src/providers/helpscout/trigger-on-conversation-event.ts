import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { verifyBase64Hmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-conversation-event.definition.ts";

export const helpscoutConversationEvent: IntegrationDefinition = {
  callback: { headers: ["x-helpscout-event", "x-helpscout-signature"], query: [] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    const expected = [...configured].sort();
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: "/webhooks", method: "GET" });
        const embedded =
          isJsonObject(response.data) && isJsonObject(response.data._embedded) ? response.data._embedded : undefined;
        if (!embedded || !Array.isArray(embedded.webhooks)) {
          throw new TransientIntegrationError("Help Scout returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of embedded.webhooks) {
          if (!isJsonObject(item) || typeof item.url != "string") continue;
          if (item.url != context.endpointUrl) continue;
          const itemEvents = Array.isArray(item.events) ? item.events.map(String).sort() : [];
          if (
            !["number", "string"].includes(typeof item.id) ||
            JSON.stringify(itemEvents) != JSON.stringify(expected)
          ) {
            throw new PermanentIntegrationError("Help Scout webhook settings differ from this subscription.");
          }
          found.push({ id: String(item.id), secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: {
            url: context.endpointUrl,
            events: configured,
            secret: context.callbackSecret,
            payloadVersion: "V2",
          },
        });
        const id =
          (isJsonObject(response.data) && ["number", "string"].includes(typeof response.data.id)
            ? String(response.data.id)
            : undefined) ?? response.headers?.["resource-id"];
        if (!id) {
          throw new TransientIntegrationError("Help Scout webhook creation returned no identity.");
        }
        return { id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  async receive(context) {
    const signature = context.header("x-helpscout-signature");
    if (!(await verifyBase64Hmac(context.callbackSecret, [context.rawBody], signature, "SHA-1"))) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const event = context.header("x-helpscout-event");
    const body = context.payload;
    if (!event || !isJsonObject(body)) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    if (!configured.includes(event)) {
      return { outcome: "ignored", reason: "Help Scout event is not subscribed." };
    }
    const deliveryId = `${event}:${String(body.id ?? "")}:${String(body.userUpdatedAt ?? body.createdAt ?? "")}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { event, deliveryId, body },
    };
  },
};
