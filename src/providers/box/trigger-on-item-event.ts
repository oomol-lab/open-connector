import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { snapshot } from "./trigger-on-item-event.definition.ts";

export const boxItemEvent: IntegrationDefinition = {
  callback: { headers: ["box-delivery-id", "box-delivery-timestamp", "box-signature-primary"], query: [] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const targetType = String(context.config.targetType);
    const targetId = String(context.config.targetId);
    const configuredTriggers = Array.isArray(context.config.triggers) ? context.config.triggers.map(String) : [];
    const expected = [...configuredTriggers].sort();
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: "/webhooks", method: "GET" });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.entries)) {
          throw new TransientIntegrationError("Box returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.entries) {
          if (!isJsonObject(item) || typeof item.address != "string") continue;
          if (item.address != context.endpointUrl) continue;
          const target = isJsonObject(item.target) ? item.target : undefined;
          const itemTriggers = Array.isArray(item.triggers) ? item.triggers.map(String).sort() : [];
          if (
            typeof item.id != "string" ||
            target?.type != targetType ||
            String(target?.id ?? "") != targetId ||
            JSON.stringify(itemTriggers) != JSON.stringify(expected)
          ) {
            throw new PermanentIntegrationError("Box webhook settings differ from this subscription.");
          }
          found.push({ id: item.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: {
            target: { id: targetId, type: targetType },
            address: context.endpointUrl,
            triggers: configuredTriggers,
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Box webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    const hookId = context.state?.subscription.hookId;
    if (typeof hookId != "string") {
      return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || !isJsonObject(body.webhook) || typeof body.trigger != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    if (String(body.webhook.id ?? "") != hookId) {
      return { outcome: "ignored", reason: "Box webhook ID does not match this subscription." };
    }
    const configuredTriggers = Array.isArray(context.config.triggers) ? context.config.triggers.map(String) : [];
    if (!configuredTriggers.includes(body.trigger)) {
      return { outcome: "ignored", reason: "Box trigger event is not subscribed." };
    }
    const deliveryId =
      (typeof body.id == "string" && body.id.length > 0 ? body.id : undefined) ?? context.header("box-delivery-id");
    if (!deliveryId) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const source = isJsonObject(body.source) ? body.source : undefined;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: {
        event: body.trigger,
        deliveryId,
        targetId: String(source?.id ?? context.config.targetId ?? ""),
        targetType: String(source?.type ?? context.config.targetType ?? ""),
        body,
      },
    };
  },
};
