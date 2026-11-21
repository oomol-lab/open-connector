import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("wise_token", token);
  return url.toString();
}

export const wiseEvent: IntegrationDefinition = {
  callback: { headers: ["x-delivery-id", "x-signature-sha256"], query: ["wise_token"] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const profileId = encodeURIComponent(String(context.config.profileId));
    const triggerOn = String(context.config.triggerOn);
    const subsPath = `/v3/profiles/${profileId}/subscriptions`;
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: subsPath, method: "GET" });
        if (!Array.isArray(response.data)) {
          throw new TransientIntegrationError("Wise returned an invalid subscription list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data) {
          if (!isJsonObject(item) || !isJsonObject(item.delivery) || typeof item.delivery.url != "string") continue;
          if (!item.delivery.url.startsWith(context.endpointUrl)) continue;
          if (typeof item.id != "string" || item.trigger_on != triggerOn) {
            throw new PermanentIntegrationError("Wise webhook subscription settings differ from this trigger.");
          }
          found.push({ id: item.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: subsPath,
          method: "POST",
          body: {
            name: "OOMOL Open Flow webhook",
            trigger_on: triggerOn,
            delivery: { version: "2.0.0", url: webhookUrl },
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Wise webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `${subsPath}/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("wise_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.event_type != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    if (body.event_type != String(context.config.triggerOn)) {
      return { outcome: "ignored", reason: "Wise event type does not match." };
    }
    const deliveryId =
      context.header("x-delivery-id") ??
      `${body.event_type}:${String(body.subscription_id ?? "")}:${String(body.sent_at ?? "")}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { event: body.event_type, deliveryId, body },
    };
  },
};
