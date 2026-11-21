import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { verifyBase64Hmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-conversation-event.definition.ts";

// Help Scout enforces a 40-character maximum length for webhook signing secrets.
function helpScoutSigningSecret(callbackSecret: string): string {
  return callbackSecret.slice(0, 40);
}

export const helpscoutConversationEvent: IntegrationDefinition = {
  callback: { headers: ["x-helpscout-event", "x-helpscout-signature"], query: [] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    const expected = [...configured].sort();
    const signingSecret = helpScoutSigningSecret(context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const webhooks: unknown[] = [];
        const maxPages = 20;
        let totalPages = 1;
        for (let page = 1; page <= maxPages; page++) {
          const response = await webhookRequest(context, {
            endpoint: "/webhooks",
            method: "GET",
            query: page > 1 ? { page: String(page) } : undefined,
          });
          const embedded =
            isJsonObject(response.data) && isJsonObject(response.data._embedded) ? response.data._embedded : undefined;
          if (!embedded || !Array.isArray(embedded.webhooks)) {
            throw new TransientIntegrationError("Help Scout returned an invalid webhook list.");
          }
          webhooks.push(...embedded.webhooks);
          const pageInfo =
            isJsonObject(response.data) && isJsonObject(response.data.page) ? response.data.page : undefined;
          totalPages = typeof pageInfo?.totalPages == "number" ? pageInfo.totalPages : 1;
          if (page >= totalPages) break;
        }
        if (totalPages > maxPages) {
          throw new TransientIntegrationError("Help Scout webhook list exceeded the maximum supported page count.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of webhooks) {
          if (!isJsonObject(item) || typeof item.url != "string") continue;
          if (item.url != context.endpointUrl) continue;
          if (!["number", "string"].includes(typeof item.id)) {
            throw new PermanentIntegrationError("Help Scout webhook entry is missing an ID.");
          }
          if (context.active) {
            if (typeof item.state == "string" && item.state.toLowerCase() !== "enabled") {
              throw new PermanentIntegrationError("Help Scout webhook is disabled.");
            }
            const itemEvents = Array.isArray(item.events) ? item.events.map(String).sort() : [];
            if (JSON.stringify(itemEvents) != JSON.stringify(expected)) {
              throw new PermanentIntegrationError("Help Scout webhook settings differ from this subscription.");
            }
          }
          found.push({ id: String(item.id), secret: signingSecret });
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
            secret: signingSecret,
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
        return { id, secret: signingSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  async receive(context) {
    const signature = context.header("x-helpscout-signature");
    if (
      !(await verifyBase64Hmac(helpScoutSigningSecret(context.callbackSecret), [context.rawBody], signature, "SHA-1"))
    ) {
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
    const embedded = isJsonObject(body._embedded) ? body._embedded : undefined;
    const threads = Array.isArray(embedded?.threads) ? embedded.threads : undefined;
    const latestThread = threads && threads.length > 0 && isJsonObject(threads[0]) ? threads[0] : undefined;
    const threadId =
      latestThread && ["number", "string"].includes(typeof latestThread.id) ? String(latestThread.id) : undefined;
    const timestamp =
      event === "customer.updated"
        ? (body.updatedAt ?? body.userUpdatedAt ?? body.createdAt ?? "")
        : (body.userUpdatedAt ?? body.updatedAt ?? body.createdAt ?? "");
    const identity =
      (event.endsWith(".reply.created") || event.endsWith(".note.created")) && threadId ? threadId : String(timestamp);
    const deliveryId = `${event}:${String(body.id ?? "")}:${identity}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { event, deliveryId, body },
    };
  },
};
