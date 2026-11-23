import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("eb_token", token);
  return url.toString();
}

export const eventbriteEvent: IntegrationDefinition = {
  callback: { headers: ["x-eventbrite-delivery"], query: ["eb_token"] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const orgId = encodeURIComponent(String(context.config.organizationId));
    const configured = Array.isArray(context.config.actions) ? context.config.actions.map(String) : [];
    const expected = [...configured].sort();
    const eventId =
      typeof context.config.eventId == "string" && context.config.eventId.trim()
        ? context.config.eventId.trim()
        : undefined;
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, {
          endpoint: `/organizations/${orgId}/webhooks/`,
          method: "GET",
        });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.webhooks)) {
          throw new TransientIntegrationError("Eventbrite returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.webhooks) {
          if (!isJsonObject(item) || typeof item.endpoint_url != "string") continue;
          if (!item.endpoint_url.startsWith(context.endpointUrl)) continue;
          const itemActions = Array.isArray(item.actions) ? item.actions.map(String).sort() : [];
          const itemEventId =
            typeof item.event_id == "string" && item.event_id.trim() ? item.event_id.trim() : undefined;
          if (
            typeof item.id != "string" ||
            item.endpoint_url !== webhookUrl ||
            (context.active && (itemEventId !== eventId || JSON.stringify(itemActions) != JSON.stringify(expected)))
          ) {
            throw new PermanentIntegrationError("Eventbrite webhook settings differ from this subscription.");
          }
          found.push({ id: item.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: `/organizations/${orgId}/webhooks/`,
          method: "POST",
          body: {
            endpoint_url: webhookUrl,
            actions: configured.join(","),
            event_id: eventId,
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Eventbrite webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}/`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("eb_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || !isJsonObject(body.config) || typeof body.config.action != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const action = body.config.action;
    const configured = Array.isArray(context.config.actions) ? context.config.actions.map(String) : [];
    if (!configured.includes(action)) {
      return { outcome: "ignored", reason: "Eventbrite action is not subscribed." };
    }
    const apiUrl = typeof body.api_url == "string" ? body.api_url : "";
    const deliveryId =
      context.header("x-eventbrite-delivery") ?? `${action}:${apiUrl}:${String(body.config.webhook_id ?? "")}`;
    const { endpoint_url: _endpointUrl, ...publicConfig } = body.config;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { action, deliveryId, apiUrl, body: { ...body, config: publicConfig } },
    };
  },
};
