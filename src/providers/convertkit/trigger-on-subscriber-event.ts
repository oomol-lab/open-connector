import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-subscriber-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("ck_token", token);
  return url.toString();
}

export const convertkitSubscriberEvent: IntegrationDefinition = {
  callback: { headers: [], query: ["ck_token"] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const eventName = String(context.config.eventName);
    const targetUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: "/webhooks", method: "GET" });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.webhooks)) {
          throw new TransientIntegrationError("ConvertKit returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.webhooks) {
          if (!isJsonObject(item) || typeof item.target_url != "string") continue;
          if (!item.target_url.startsWith(context.endpointUrl)) continue;
          const evt = isJsonObject(item.event) ? item.event : undefined;
          if (!["number", "string"].includes(typeof item.id) || evt?.name != eventName) {
            throw new PermanentIntegrationError("ConvertKit webhook settings differ from this subscription.");
          }
          found.push({ id: String(item.id), secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: { target_url: targetUrl, event: { name: eventName } },
        });
        const webhook =
          isJsonObject(response.data) && isJsonObject(response.data.webhook) ? response.data.webhook : response.data;
        if (!isJsonObject(webhook) || !["number", "string"].includes(typeof webhook.id)) {
          throw new TransientIntegrationError("ConvertKit webhook creation returned no identity.");
        }
        return { id: String(webhook.id), secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("ck_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body)) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const event = String(context.config.eventName);
    const subscriber = isJsonObject(body.subscriber) ? body.subscriber : undefined;
    const deliveryId = `${event}:${String(subscriber?.id ?? body.id ?? "")}:${String(subscriber?.created_at ?? body.created_at ?? "")}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { event, deliveryId, body },
    };
  },
};
