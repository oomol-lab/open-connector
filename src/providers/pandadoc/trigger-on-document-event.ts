import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { bytes, verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-document-event.definition.ts";

function webhook(value: unknown): ManagedWebhook {
  if (
    !isJsonObject(value) ||
    typeof value.uuid != "string" ||
    !value.uuid ||
    typeof value.shared_key != "string" ||
    !value.shared_key
  )
    throw new TransientIntegrationError("PandaDoc returned an invalid webhook identity or shared key.");
  return { id: value.uuid, secret: value.shared_key };
}

export const pandadocDocumentEvent: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const endpoint = "/public/v1/webhook-subscriptions";
    return reconcileManagedWebhook(context, {
      async find() {
        const found: ManagedWebhook[] = [];
        const result = await webhookRequest(context, { endpoint, method: "GET" });
        if (!isJsonObject(result.data) || !Array.isArray(result.data.items))
          throw new TransientIntegrationError("PandaDoc returned an invalid webhook list.");
        for (const item of result.data.items) {
          if (!isJsonObject(item) || typeof item.url != "string")
            throw new TransientIntegrationError("PandaDoc returned an invalid webhook.");
          if (item.url == context.endpointUrl) found.push(webhook(item));
        }
        return found;
      },
      async create() {
        const result = await webhookRequest(context, {
          endpoint,
          method: "POST",
          body: {
            name: "OOMOL document status",
            url: context.endpointUrl,
            active: true,
            triggers: ["document_state_changed"],
            payload: ["metadata"],
          },
        });
        return webhook(result.data);
      },
      async align(id) {
        await webhookRequest(context, {
          endpoint: `${endpoint}/${encodeURIComponent(id)}`,
          method: "PATCH",
          body: { url: context.endpointUrl, active: true, triggers: ["document_state_changed"], payload: ["metadata"] },
        });
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `${endpoint}/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  async receive(context) {
    const secret = context.state?.subscription.secret;
    if (typeof secret != "string") return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    if (!(await verifyHexHmac(secret, [context.rawBody], context.query("signature"))))
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    if (!Array.isArray(context.payload))
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    const events: JsonValue[] = [];
    const identities: string[] = [];
    for (const item of context.payload) {
      if (!isJsonObject(item) || item.event != "document_state_changed") continue;
      const data = item.data;
      if (
        !isJsonObject(data) ||
        typeof data.id != "string" ||
        !data.id ||
        typeof data.status != "string" ||
        typeof data.date_modified != "string" ||
        !data.date_modified
      )
        return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
      if (context.config.completedOnly === true && data.status != "document.completed") continue;
      events.push(item);
      identities.push(JSON.stringify([data.id, data.status, data.date_modified]));
    }
    if (!events.length) return { outcome: "ignored", reason: "No matching document status changes." };
    // Derive deduplication identity from the signed body, not an unsigned delivery header.
    const digest = await crypto.subtle.digest("SHA-256", bytes(JSON.stringify(identities.sort())));
    return {
      outcome: "event",
      dedupeKey: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(""),
      outputs: { events },
    };
  },
};
