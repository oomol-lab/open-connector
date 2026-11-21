import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { encodePathSegment } from "../../core/request.ts";
import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-item-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("box_token", token);
  return url.toString();
}

export const boxItemEvent: IntegrationDefinition = {
  callback: { headers: ["box-delivery-id", "box-delivery-timestamp", "box-signature-primary"], query: ["box_token"] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const targetType = String(context.config.targetType);
    const targetId = String(context.config.targetId);
    const configuredTriggers = Array.isArray(context.config.triggers) ? context.config.triggers.map(String) : [];
    const expected = [...configuredTriggers].sort();
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const entries: unknown[] = [];
        let marker: string | undefined;
        for (let page = 0; page < 20; page++) {
          const query: Record<string, string> = { usemarker: "true" };
          if (marker) query.marker = marker;
          const response = await webhookRequest(context, { endpoint: "/webhooks", method: "GET", query });
          if (!isJsonObject(response.data) || !Array.isArray(response.data.entries)) {
            throw new TransientIntegrationError("Box returned an invalid webhook list.");
          }
          entries.push(...response.data.entries);
          const nextMarker =
            typeof response.data.next_marker == "string" && response.data.next_marker.length > 0
              ? response.data.next_marker
              : undefined;
          if (!nextMarker) break;
          marker = nextMarker;
        }
        const found: ManagedWebhook[] = [];
        for (const rawEntry of entries) {
          if (!isJsonObject(rawEntry) || typeof rawEntry.id != "string") continue;
          // Box's list endpoint returns mini webhook objects without address/triggers; fetch details when missing.
          let item = rawEntry;
          if (typeof item.address != "string" || !Array.isArray(item.triggers)) {
            const detail = await webhookRequest(context, {
              endpoint: `/webhooks/${encodePathSegment(rawEntry.id)}`,
              method: "GET",
            });
            if (!isJsonObject(detail.data)) continue;
            item = detail.data;
          }
          if (typeof item.address != "string") continue;
          if (!item.address.startsWith(context.endpointUrl)) continue;
          if (item.address !== webhookUrl) {
            if (!context.active) continue;
            throw new PermanentIntegrationError("Box webhook callback URL differs from this subscription.");
          }
          if (context.active) {
            const target = isJsonObject(item.target) ? item.target : undefined;
            const itemTriggers = Array.isArray(item.triggers) ? item.triggers.map(String).sort() : [];
            if (
              target?.type != targetType ||
              String(target?.id ?? "") != targetId ||
              JSON.stringify(itemTriggers) != JSON.stringify(expected)
            ) {
              throw new PermanentIntegrationError("Box webhook settings differ from this subscription.");
            }
          }
          found.push({ id: rawEntry.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: {
            target: { id: targetId, type: targetType },
            address: webhookUrl,
            triggers: configuredTriggers,
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Box webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodePathSegment(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("box_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
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
