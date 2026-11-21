import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-model-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("trello_token", token);
  return url.toString();
}

export const trelloModelEvent: IntegrationDefinition = {
  callback: { headers: ["x-trello-webhook"], query: ["trello_token"] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const modelId = String(context.config.modelId);
    const callbackURL = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, {
          endpoint: "/members/me/tokens",
          method: "GET",
          query: { webhooks: "true" },
        });
        if (!Array.isArray(response.data)) {
          throw new TransientIntegrationError("Trello returned an invalid token webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const tokenEntry of response.data) {
          if (!isJsonObject(tokenEntry) || !Array.isArray(tokenEntry.webhooks)) continue;
          for (const item of tokenEntry.webhooks) {
            if (!isJsonObject(item) || typeof item.callbackURL != "string") continue;
            if (!item.callbackURL.startsWith(context.endpointUrl)) continue;
            if (typeof item.id != "string" || item.idModel != modelId || item.active !== true) {
              throw new PermanentIntegrationError("Trello webhook settings differ from this subscription.");
            }
            found.push({ id: item.id, secret: context.callbackSecret });
          }
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: {
            description: "OOMOL Open Flow webhook",
            callbackURL,
            idModel: modelId,
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Trello webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("trello_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    if (context.method.toUpperCase() === "HEAD") {
      return { outcome: "respond", status: 200, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (
      !isJsonObject(body) ||
      !isJsonObject(body.action) ||
      typeof body.action.id != "string" ||
      typeof body.action.type != "string"
    ) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const allowedTypes = Array.isArray(context.config.actionTypes) ? context.config.actionTypes.map(String) : [];
    if (allowedTypes.length > 0 && !allowedTypes.includes(body.action.type)) {
      return { outcome: "ignored", reason: "Trello action type is not subscribed." };
    }
    const model = isJsonObject(body.model) ? body.model : undefined;
    return {
      outcome: "event",
      dedupeKey: body.action.id,
      outputs: {
        actionType: body.action.type,
        deliveryId: body.action.id,
        modelId: String(model?.id ?? context.config.modelId ?? ""),
        body,
      },
    };
  },
};
