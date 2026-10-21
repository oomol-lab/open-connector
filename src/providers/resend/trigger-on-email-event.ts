import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { bytes, verifyBase64Hmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-email-event.definition.ts";

function webhook(value: unknown): ManagedWebhook {
  if (
    !isJsonObject(value) ||
    typeof value.id != "string" ||
    !value.id ||
    typeof value.signing_secret != "string" ||
    !value.signing_secret.startsWith("whsec_")
  )
    throw new TransientIntegrationError("Resend returned an invalid webhook identity or signing secret.");
  try {
    if (!atob(value.signing_secret.slice(6)).length) throw new Error();
  } catch {
    throw new TransientIntegrationError("Resend returned an invalid webhook signing secret.");
  }
  return { id: value.id, secret: value.signing_secret };
}

export const resendEmailEvent: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    return reconcileManagedWebhook(context, {
      async find() {
        const found: ManagedWebhook[] = [];
        let after: string | undefined;
        for (let page = 0; page < 100; page++) {
          const result = await webhookRequest(context, {
            endpoint: "/webhooks",
            method: "GET",
            query: after == null ? { limit: 100 } : { limit: 100, after },
          });
          if (
            !isJsonObject(result.data) ||
            !Array.isArray(result.data.data) ||
            typeof result.data.has_more != "boolean"
          )
            throw new TransientIntegrationError("Resend returned an invalid webhook page.");
          for (const item of result.data.data) {
            if (!isJsonObject(item) || typeof item.id != "string" || !item.id || typeof item.endpoint != "string")
              throw new TransientIntegrationError("Resend returned an invalid webhook.");
            if (item.endpoint == context.endpointUrl) {
              const detail = await webhookRequest(context, {
                endpoint: `/webhooks/${encodeURIComponent(item.id)}`,
                method: "GET",
              });
              found.push(webhook(detail.data));
            }
          }
          if (!result.data.has_more) return found;
          const last = result.data.data.at(-1);
          if (!isJsonObject(last) || typeof last.id != "string" || !last.id || last.id == after)
            throw new TransientIntegrationError("Resend webhook pagination did not advance.");
          after = last.id;
        }
        throw new PermanentIntegrationError("The Resend webhook list exceeds 10000 entries.");
      },
      async create() {
        const result = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: { endpoint: context.endpointUrl, events: context.config.eventTypes! },
        });
        return webhook(result.data);
      },
      async align(id) {
        await webhookRequest(context, {
          endpoint: `/webhooks/${encodeURIComponent(id)}`,
          method: "PATCH",
          body: { endpoint: context.endpointUrl, events: context.config.eventTypes!, status: "enabled" },
        });
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  async receive(context) {
    const secret = context.state?.subscription.secret;
    if (typeof secret != "string") return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    const id = context.header("svix-id");
    const timestamp = context.header("svix-timestamp");
    const signatures = context.header("svix-signature")?.split(" ") ?? [];
    let valid = false;
    if (
      id &&
      timestamp &&
      Number.isInteger(Number(timestamp)) &&
      Math.abs(context.now.getTime() / 1000 - Number(timestamp)) <= 300
    ) {
      const key = Uint8Array.from(atob(secret.slice(6)), (character) => character.charCodeAt(0));
      for (const signature of signatures) {
        if (
          signature.startsWith("v1,") &&
          (await verifyBase64Hmac(key, [bytes(`${id}.${timestamp}.`), context.rawBody], signature.slice(3)))
        ) {
          valid = true;
          break;
        }
      }
    }
    if (!valid) return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    const body = context.payload;
    if (
      !isJsonObject(body) ||
      typeof body.type != "string" ||
      !(context.config.eventTypes as string[]).includes(body.type)
    )
      return { outcome: "ignored", reason: "Resend event does not match." };
    if (
      !isJsonObject(body.data) ||
      typeof body.data.email_id != "string" ||
      !body.data.email_id ||
      typeof body.created_at != "string"
    )
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    return {
      outcome: "event",
      dedupeKey: id!,
      outputs: {
        event: body.type,
        deliveryId: id!,
        emailId: body.data.email_id,
        createdAt: body.created_at,
        body: body.data,
      },
    };
  },
};
