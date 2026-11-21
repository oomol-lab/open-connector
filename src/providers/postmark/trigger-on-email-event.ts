import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { basicAuthorizationHeader } from "../provider-runtime.ts";
import { snapshot } from "./trigger-on-email-event.definition.ts";

export const postmarkEmailEvent: IntegrationDefinition = {
  callback: { headers: ["authorization"], query: [] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const messageStream = String(context.config.messageStream || "outbound");
    const configured = new Set(Array.isArray(context.config.events) ? context.config.events.map(String) : []);
    const triggersPayload = {
      Open: { Enabled: configured.has("Open"), PostFirstOpenOnly: false },
      Click: { Enabled: configured.has("Click"), ClickLocation: "HtmlAndText" },
      Delivery: { Enabled: configured.has("Delivery") },
      Bounce: { Enabled: configured.has("Bounce"), IncludeContent: true },
      SpamComplaint: { Enabled: configured.has("SpamComplaint"), IncludeContent: true },
      SubscriptionChange: { Enabled: configured.has("SubscriptionChange") },
    };
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "GET",
          query: { MessageStream: messageStream },
        });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.Webhooks)) {
          throw new TransientIntegrationError("Postmark returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.Webhooks) {
          if (!isJsonObject(item) || typeof item.Url != "string") continue;
          if (item.Url != context.endpointUrl) continue;
          if (!["number", "string"].includes(typeof item.ID)) {
            throw new PermanentIntegrationError("Postmark webhook entry is missing an ID.");
          }
          found.push({ id: String(item.ID), secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: {
            Url: context.endpointUrl,
            MessageStream: messageStream,
            HttpAuth: { Username: "oomol", Password: context.callbackSecret },
            Triggers: triggersPayload,
          },
        });
        if (!isJsonObject(response.data) || !["number", "string"].includes(typeof response.data.ID)) {
          throw new TransientIntegrationError("Postmark webhook creation returned no identity.");
        }
        return { id: String(response.data.ID), secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    const expected = basicAuthorizationHeader(`oomol:${context.callbackSecret}`);
    if (!sameSecret(context.header("authorization"), expected)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.RecordType != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    if (!configured.includes(body.RecordType)) {
      return { outcome: "ignored", reason: "Postmark event type is not subscribed." };
    }
    const messageId = typeof body.MessageID == "string" ? body.MessageID : "";
    const deliveryId = String(
      body.ID ??
        `${body.RecordType}:${messageId}:${String(body.ReceivedAt ?? body.DeliveredAt ?? body.BouncedAt ?? "")}`,
    );
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: {
        recordType: body.RecordType,
        deliveryId,
        messageId,
        body,
      },
    };
  },
};
