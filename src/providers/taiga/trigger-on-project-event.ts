import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-project-event.definition.ts";

export const taigaProjectEvent: IntegrationDefinition = {
  callback: { headers: ["x-taiga-webhook-signature"], query: [] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const projectId = Number(context.config.projectId);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "GET",
          query: { project: String(projectId) },
        });
        if (!Array.isArray(response.data)) {
          throw new TransientIntegrationError("Taiga returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data) {
          if (!isJsonObject(item) || typeof item.url != "string") continue;
          if (item.url != context.endpointUrl) continue;
          if (!["number", "string"].includes(typeof item.id) || Number(item.project) !== projectId) {
            throw new PermanentIntegrationError("Taiga webhook settings differ from this subscription.");
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
            project: projectId,
            name: "OOMOL Open Flow webhook",
            url: context.endpointUrl,
            key: context.callbackSecret,
          },
        });
        if (!isJsonObject(response.data) || !["number", "string"].includes(typeof response.data.id)) {
          throw new TransientIntegrationError("Taiga webhook creation returned no identity.");
        }
        return { id: String(response.data.id), secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  async receive(context) {
    const sig = context.header("x-taiga-webhook-signature");
    if (!(await verifyHexHmac(context.callbackSecret, [context.rawBody], sig, "SHA-1"))) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.type != "string" || typeof body.action != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const allowedTypes = Array.isArray(context.config.types) ? context.config.types.map(String) : [];
    const allowedActions = Array.isArray(context.config.actions) ? context.config.actions.map(String) : [];
    if (allowedTypes.length > 0 && !allowedTypes.includes(body.type)) {
      return { outcome: "ignored", reason: "Taiga entity type is not subscribed." };
    }
    if (allowedActions.length > 0 && !allowedActions.includes(body.action)) {
      return { outcome: "ignored", reason: "Taiga action is not subscribed." };
    }
    const data = isJsonObject(body.data) ? body.data : undefined;
    const deliveryId = `${body.type}:${body.action}:${String(data?.id ?? "")}:${String(body.date ?? "")}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { entityType: body.type, action: body.action, deliveryId, body },
    };
  },
};
