import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("pp_token", token);
  return url.toString();
}

export const paypalEvent: IntegrationDefinition = {
  callback: { headers: ["paypal-transmission-id"], query: ["pp_token"] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    const expected = [...configured].sort();
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: "/v1/notifications/webhooks", method: "GET" });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.webhooks)) {
          throw new TransientIntegrationError("PayPal returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.webhooks) {
          if (!isJsonObject(item) || typeof item.url != "string") continue;
          if (!item.url.startsWith(context.endpointUrl)) continue;
          const itemEvents = Array.isArray(item.event_types)
            ? item.event_types
                .map((entry) => (isJsonObject(entry) && typeof entry.name == "string" ? entry.name : ""))
                .filter(Boolean)
                .sort()
            : [];
          if (
            typeof item.id != "string" ||
            item.url !== webhookUrl ||
            JSON.stringify(itemEvents) != JSON.stringify(expected)
          ) {
            throw new PermanentIntegrationError("PayPal webhook settings differ from this subscription.");
          }
          found.push({ id: item.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/v1/notifications/webhooks",
          method: "POST",
          body: {
            url: webhookUrl,
            event_types: configured.map((name) => ({ name })),
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("PayPal webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/v1/notifications/webhooks/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("pp_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.id != "string" || typeof body.event_type != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    if (!configured.includes("*") && !configured.includes(body.event_type)) {
      return { outcome: "ignored", reason: "PayPal event type is not subscribed." };
    }
    return {
      outcome: "event",
      dedupeKey: body.id,
      outputs: {
        event: body.event_type,
        deliveryId: body.id,
        resourceType: typeof body.resource_type == "string" ? body.resource_type : "",
        body,
      },
    };
  },
};
