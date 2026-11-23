import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { verify } from "node:crypto";
import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

const wiseSchemaVersionByEvent: Record<string, string> = {
  "swift-in#credit": "3.0.0",
};

function resolveWiseSchemaVersion(triggerOn: string): string {
  return wiseSchemaVersionByEvent[triggerOn] ?? "2.0.0";
}

const wiseProductionPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvO8vXV+JksBzZAY6GhSO
XdoTCfhXaaiZ+qAbtaDBiu2AGkGVpmEygFmWP4Li9m5+Ni85BhVvZOodM9epgW3F
bA5Q1SexvAF1PPjX4JpMstak/QhAgl1qMSqEevL8cmUeTgcMuVWCJmlge9h7B1CS
D4rtlimGZozG39rUBDg6Qt2K+P4wBfLblL0k4C4YUdLnpGYEDIth+i8XsRpFlogx
CAFyH9+knYsDbR43UJ9shtc42Ybd40Afihj8KnYKXzchyQ42aC8aZ/h5hyZ28yVy
Oj3Vos0VdBIs/gAyJ/4yyQFCXYte64I7ssrlbGRaco4nKF3HmaNhxwyKyJafz19e
HwIDAQAB
-----END PUBLIC KEY-----`;

function verifyWiseSignature(rawBody: Uint8Array, signature: string | undefined, publicKey: string): boolean {
  if (!signature) return false;
  try {
    return verify("RSA-SHA256", rawBody, publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("wise_token", token);
  return url.toString();
}

export const wiseEvent: IntegrationDefinition = {
  callback: {
    headers: ["x-delivery-id", "x-signature-sha256", "x-test-notification"],
    query: ["wise_token"],
  },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const profileId = encodeURIComponent(String(context.config.profileId));
    const triggerOn = String(context.config.triggerOn);
    const subsPath = `/v3/profiles/${profileId}/subscriptions`;
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: subsPath, method: "GET" });
        if (!Array.isArray(response.data)) {
          throw new TransientIntegrationError("Wise returned an invalid subscription list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data) {
          if (!isJsonObject(item) || !isJsonObject(item.delivery) || typeof item.delivery.url != "string") continue;
          if (!item.delivery.url.startsWith(context.endpointUrl)) continue;
          if (typeof item.id != "string" || item.delivery.url !== webhookUrl || item.trigger_on != triggerOn) {
            throw new PermanentIntegrationError("Wise webhook subscription settings differ from this trigger.");
          }
          found.push({ id: item.id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: subsPath,
          method: "POST",
          body: {
            name: "OOMOL Open Flow webhook",
            trigger_on: triggerOn,
            delivery: { version: resolveWiseSchemaVersion(triggerOn), url: webhookUrl },
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Wise webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `${subsPath}/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("wise_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    if (!verifyWiseSignature(context.rawBody, context.header("x-signature-sha256"), wiseProductionPublicKey)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    if (context.header("x-test-notification")?.toLowerCase() === "true") {
      return { outcome: "ignored", reason: "Wise test webhook notification." };
    }
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.event_type != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const hookId = context.state?.subscription.hookId;
    if (typeof hookId != "string" || hookId.length === 0) {
      return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    }
    if (body.subscription_id !== hookId) {
      return {
        outcome: "ignored",
        reason: "Wise subscription ID does not match this subscription.",
      };
    }
    if (body.event_type != String(context.config.triggerOn)) {
      return { outcome: "ignored", reason: "Wise event type does not match." };
    }
    const deliveryId =
      context.header("x-delivery-id") ??
      `${body.event_type}:${String(body.subscription_id ?? "")}:${String(body.sent_at ?? "")}`;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { event: body.event_type, deliveryId, body },
    };
  },
};
