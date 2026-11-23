import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("keap_token", token);
  return url.toString();
}

export const keapEvent: IntegrationDefinition = {
  callback: { headers: ["x-hook-secret"], query: ["keap_token"] },
  handshake(input) {
    const hookSecret = input.headers["x-hook-secret"];
    if (!hookSecret) return undefined;
    if (input.callbackSecret && !sameSecret(input.query?.keap_token, input.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    return {
      outcome: "respond",
      status: 200,
      body: "",
      contentType: "text/plain",
      headers: { "x-hook-secret": hookSecret },
    };
  },
  maximumBodyBytes: 1024 * 1024,
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    let hookStatus: unknown;
    const eventKey = String(context.config.eventKey);
    const hookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: "/hooks", method: "GET" });
        if (!Array.isArray(response.data)) {
          throw new TransientIntegrationError("Keap returned an invalid hook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data) {
          if (!isJsonObject(item) || typeof item.hookUrl != "string") continue;
          if (!item.hookUrl.startsWith(context.endpointUrl)) continue;
          if (item.hookUrl !== hookUrl) {
            if (!context.active) continue;
            throw new PermanentIntegrationError("Keap hook callback URL differs from this subscription.");
          }
          if (typeof item.key != "string") {
            throw new PermanentIntegrationError("Keap hook entry is missing a key.");
          }
          if (context.active) {
            if (item.eventKey != eventKey) {
              throw new PermanentIntegrationError("Keap hook settings differ from this subscription.");
            }
            hookStatus = item.status;
          }
          found.push({ id: item.key, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/hooks",
          method: "POST",
          body: { eventKey, hookUrl },
        });
        if (!isJsonObject(response.data) || typeof response.data.key != "string") {
          throw new TransientIntegrationError("Keap hook creation returned no key.");
        }
        hookStatus = response.data.status;
        return { id: response.data.key, secret: context.callbackSecret };
      },
      async align(id) {
        if (typeof hookStatus === "string" && hookStatus.toLowerCase() === "verified") return;
        await webhookRequest(context, { endpoint: `/hooks/${encodeURIComponent(id)}/verify`, method: "POST" });
        const response = await webhookRequest(context, { endpoint: `/hooks/${encodeURIComponent(id)}`, method: "GET" });
        if (!isJsonObject(response.data) || response.data.status !== "Verified") {
          throw new TransientIntegrationError("Keap webhook verification is pending.");
        }
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/hooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("keap_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const hookSecret = context.header("x-hook-secret");
    if (hookSecret) {
      return {
        outcome: "respond",
        status: 200,
        body: "",
        contentType: "text/plain",
        headers: { "x-hook-secret": hookSecret },
      };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.event_key != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    if (body.event_key != String(context.config.eventKey)) {
      return { outcome: "ignored", reason: "Keap event key does not match." };
    }
    const keys = Array.isArray(body.object_keys)
      ? body.object_keys
          .map((item) =>
            isJsonObject(item) ? `${String(item.id ?? "")}@${String(item.timestamp ?? "")}` : String(item),
          )
          .join(",")
      : "";
    const deliveryId = `${body.event_key}:${keys}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { eventKey: body.event_key, deliveryId, body },
    };
  },
};
