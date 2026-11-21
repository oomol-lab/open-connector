import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-audience-event.definition.ts";

const allEventKeys = ["subscribe", "unsubscribe", "profile", "upemail", "cleaned", "campaign"] as const;

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("mc_token", token);
  return url.toString();
}

export const mailchimpAudienceEvent: IntegrationDefinition = {
  callback: { headers: [], query: ["mc_token"] },
  handshake(input) {
    if (input.method.toUpperCase() !== "GET") return undefined;
    if (input.callbackSecret && !sameSecret(input.query?.mc_token, input.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    return { outcome: "respond", status: 200, body: "ok", contentType: "text/plain" };
  },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const listId = encodeURIComponent(String(context.config.listId));
    const configured = new Set(Array.isArray(context.config.events) ? context.config.events.map(String) : []);
    const eventsPayload = Object.fromEntries(allEventKeys.map((key) => [key, configured.has(key)]));
    const sourcesPayload = { user: true, admin: true, api: true };
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: `/lists/${listId}/webhooks`, method: "GET" });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.webhooks)) {
          throw new TransientIntegrationError("Mailchimp returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.webhooks) {
          if (!isJsonObject(item) || typeof item.url != "string") continue;
          if (!item.url.startsWith(context.endpointUrl)) continue;
          if (typeof item.id != "string") {
            throw new PermanentIntegrationError("Mailchimp webhook entry is missing an ID.");
          }
          if (item.url !== webhookUrl) {
            if (!context.active) continue;
            throw new PermanentIntegrationError("Mailchimp webhook callback URL differs from this subscription.");
          }
          if (context.active) {
            const remoteEvents = isJsonObject(item.events) ? item.events : undefined;
            const remoteSources = isJsonObject(item.sources) ? item.sources : undefined;
            const eventsMatch =
              remoteEvents != null &&
              allEventKeys.every((key) => Boolean(remoteEvents[key]) === Boolean(eventsPayload[key]));
            const sourcesMatch =
              remoteSources != null &&
              Object.entries(sourcesPayload).every(([key, val]) => Boolean(remoteSources[key]) === val);
            if (!eventsMatch || !sourcesMatch) {
              throw new PermanentIntegrationError("Mailchimp webhook settings differ from this subscription.");
            }
          }
          found.push({ id: item.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: `/lists/${listId}/webhooks`,
          method: "POST",
          body: {
            url: webhookUrl,
            events: eventsPayload,
            sources: sourcesPayload,
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Mailchimp webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/lists/${listId}/webhooks/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("mc_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    if (context.method.toUpperCase() === "GET") {
      return { outcome: "respond", status: 200, body: "ok", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.type != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    if (!configured.includes(body.type)) {
      return { outcome: "ignored", reason: "Mailchimp event type is not subscribed." };
    }
    const data = isJsonObject(body.data) ? body.data : undefined;
    const firedAt = typeof body.fired_at == "string" ? body.fired_at : "";
    const subjectId = String(
      data?.id ??
        body["data[id]"] ??
        data?.email ??
        body["data[email]"] ??
        data?.new_id ??
        body["data[new_id]"] ??
        data?.new_email ??
        body["data[new_email]"] ??
        "",
    );
    const deliveryId = `${body.type}:${subjectId}:${firedAt}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: {
        event: body.type,
        deliveryId,
        listId: String(data?.list_id ?? body["data[list_id]"] ?? context.config.listId ?? ""),
        body,
      },
    };
  },
};
