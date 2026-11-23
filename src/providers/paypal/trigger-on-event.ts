import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("pp_token", token);
  return url.toString();
}

const verifyEndpoint = "/v1/notifications/verify-webhook-signature";

function verifySignatureBody(fields: Readonly<Record<string, string>>, rawBody: Uint8Array) {
  const head = JSON.stringify(fields);
  const rawEvent = new TextDecoder("utf-8").decode(rawBody);
  return `${head.slice(0, -1)},"webhook_event":${rawEvent}}`;
}

export const paypalEvent: IntegrationDefinition = {
  callback: {
    headers: [
      "paypal-transmission-id",
      "paypal-transmission-time",
      "paypal-transmission-sig",
      "paypal-cert-url",
      "paypal-auth-algo",
    ],
    query: ["pp_token"],
  },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    const expected = [...configured].sort();
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, {
          endpoint: "/v1/notifications/webhooks",
          method: "GET",
        });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.webhooks)) {
          throw new TransientIntegrationError("PayPal returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.webhooks) {
          if (!isJsonObject(item) || typeof item.url != "string") continue;
          const ownsStoredHook = typeof item.id === "string" && item.id === context.state?.subscription.hookId;
          if (!item.url.startsWith(context.endpointUrl) && (context.active || !ownsStoredHook)) continue;
          if (typeof item.id != "string") {
            throw new PermanentIntegrationError("PayPal webhook entry is missing an ID.");
          }
          if (item.url !== webhookUrl) {
            if (!context.active && !ownsStoredHook) continue;
            if (context.active)
              throw new PermanentIntegrationError("PayPal webhook callback URL differs from this subscription.");
          }
          if (context.active) {
            const itemEvents = Array.isArray(item.event_types)
              ? item.event_types
                  .map((entry) => (isJsonObject(entry) && typeof entry.name == "string" ? entry.name : ""))
                  .filter(Boolean)
                  .sort()
              : [];
            if (JSON.stringify(itemEvents) != JSON.stringify(expected)) {
              throw new PermanentIntegrationError("PayPal webhook settings differ from this subscription.");
            }
          }
          found.push({ id: item.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/v1/notifications/webhooks",
          method: "POST",
          body: {
            url: webhookUrl,
            event_types: configured.map((name) => ({ name })),
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("PayPal webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/v1/notifications/webhooks/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  async receive(context) {
    if (!sameSecret(context.query("pp_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const webhookId = context.state?.subscription.hookId;
    if (typeof webhookId != "string" || webhookId.length === 0) {
      return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.id != "string" || typeof body.event_type != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const transmissionId = context.header("paypal-transmission-id");
    const transmissionTime = context.header("paypal-transmission-time");
    const transmissionSig = context.header("paypal-transmission-sig");
    const certUrl = context.header("paypal-cert-url");
    const authAlgo = context.header("paypal-auth-algo");
    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const verify = await context.connector.execute(
      {
        endpoint: verifyEndpoint,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: verifySignatureBody(
          {
            auth_algo: authAlgo,
            cert_url: certUrl,
            transmission_id: transmissionId,
            transmission_sig: transmissionSig,
            transmission_time: transmissionTime,
            webhook_id: webhookId,
          },
          context.rawBody,
        ),
      },
      context.signal,
    );
    if (
      verify.status < 200 ||
      verify.status >= 300 ||
      !isJsonObject(verify.data) ||
      verify.data.verification_status !== "SUCCESS"
    ) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    if (!configured.includes("*") && !configured.includes(body.event_type)) {
      return { outcome: "ignored", reason: "PayPal event type is not subscribed." };
    }
    return {
      outcome: "event",
      dedupeKey: body.id,
      outputs: {
        event: body.event_type,
        deliveryId: body.id,
        resourceType: typeof body.resource_type == "string" ? body.resource_type : "",
        body,
      },
    };
  },
};
