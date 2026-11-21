import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-crm-event.definition.ts";

export const copperCrmEvent: IntegrationDefinition = {
  callback: { headers: [], query: [] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const resourceType = String(context.config.resourceType);
    const event = String(context.config.event);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: "/webhooks", method: "GET" });
        if (!Array.isArray(response.data)) {
          throw new TransientIntegrationError("Copper returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data) {
          if (!isJsonObject(item) || typeof item.target != "string") continue;
          if (item.target != context.endpointUrl) continue;
          if (!["number", "string"].includes(typeof item.id) || item.type != resourceType || item.event != event) {
            throw new PermanentIntegrationError("Copper webhook settings differ from this subscription.");
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
            target: context.endpointUrl,
            type: resourceType,
            event,
            secret: { token: context.callbackSecret },
          },
        });
        if (!isJsonObject(response.data) || !["number", "string"].includes(typeof response.data.id)) {
          throw new TransientIntegrationError("Copper webhook creation returned no identity.");
        }
        return { id: String(response.data.id), secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    const body = context.payload;
    if (!isJsonObject(body)) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const secretObj = isJsonObject(body.secret) ? body.secret : undefined;
    const token = typeof secretObj?.token == "string" ? secretObj.token : undefined;
    if (!sameSecret(token, context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const resourceType = typeof body.type == "string" ? body.type : "";
    const event = typeof body.event == "string" ? body.event : "";
    if (resourceType != String(context.config.resourceType) || event != String(context.config.event)) {
      return { outcome: "ignored", reason: "Copper webhook event does not match." };
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(String).join(",") : "";
    const deliveryId = `${String(body.subscription_id ?? "")}:${resourceType}:${event}:${ids}:${String(body.timestamp ?? "")}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { resourceType, event, deliveryId, body },
    };
  },
};
