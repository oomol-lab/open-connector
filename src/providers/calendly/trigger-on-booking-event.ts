import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { bytes, verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-booking-event.definition.ts";

function webhookId(uri: unknown): string {
  if (typeof uri != "string" || !uri.startsWith("https://api.calendly.com/webhook_subscriptions/"))
    throw new TransientIntegrationError("Calendly returned an invalid subscription URI.");
  const id = uri.slice("https://api.calendly.com/webhook_subscriptions/".length);
  if (!id || id.includes("/") || id.includes("?") || id.includes("#"))
    throw new TransientIntegrationError("Calendly returned an invalid subscription identity.");
  return id;
}

export const calendlyBookingEvent: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    // OAuth subscriptions use the application signing key; signing_key cannot override it.
    if (context.connector.authType != "api_key")
      throw new PermanentIntegrationError(
        "Calendly Triggers require a Personal Access Token connection. OAuth application signing keys are not configured by this deployment.",
      );
    const current = await webhookRequest(context, { endpoint: "/users/me", method: "GET" });
    if (
      !isJsonObject(current.data) ||
      !isJsonObject(current.data.resource) ||
      typeof current.data.resource.uri != "string" ||
      typeof current.data.resource.current_organization != "string"
    )
      throw new TransientIntegrationError("Calendly returned an invalid current user.");
    const organization = current.data.resource.current_organization;
    const user = current.data.resource.uri;
    const scope = String(context.config.scope);
    const query: Record<string, string | number> = { organization, scope, count: 100 };
    if (scope == "user") query.user = user;
    return reconcileManagedWebhook(context, {
      async find() {
        const found: ManagedWebhook[] = [];
        const seen = new Set<string>();
        for (let page = 0; page < 100; page++) {
          const result = await webhookRequest(context, {
            endpoint: "/webhook_subscriptions",
            method: "GET",
            query,
          });
          if (
            !isJsonObject(result.data) ||
            !Array.isArray(result.data.collection) ||
            !isJsonObject(result.data.pagination)
          )
            throw new TransientIntegrationError("Calendly returned an invalid webhook page.");
          for (const item of result.data.collection) {
            if (!isJsonObject(item) || typeof item.callback_url != "string")
              throw new TransientIntegrationError("Calendly returned an invalid webhook.");
            if (item.callback_url != context.endpointUrl) continue;
            if (item.organization != organization || item.scope != scope || (scope == "user" && item.user != user))
              throw new PermanentIntegrationError("Calendly webhook scope differs from this subscription.");
            if (context.active && item.state != "active")
              throw new PermanentIntegrationError(
                "Calendly disabled this webhook. Restore it or remove the owned webhook before retrying.",
              );
            if (
              context.active &&
              (!Array.isArray(item.events) ||
                item.events.length != (context.config.eventTypes as string[]).length ||
                !(context.config.eventTypes as string[]).every((event) => (item.events as unknown[]).includes(event)))
            )
              throw new PermanentIntegrationError(
                "Calendly webhook events differ from this subscription. Remove the owned webhook before retrying.",
              );
            found.push({ id: webhookId(item.uri), secret: context.callbackSecret });
          }
          const next = result.data.pagination.next_page_token;
          if (next == null) return found;
          if (typeof next != "string" || !next || seen.has(next))
            throw new TransientIntegrationError("Calendly webhook pagination did not advance.");
          seen.add(next);
          query.page_token = next;
        }
        throw new PermanentIntegrationError("The Calendly webhook list exceeds 10000 entries.");
      },
      async create() {
        const body: Record<string, unknown> = {
          url: context.endpointUrl,
          events: context.config.eventTypes,
          organization,
          scope,
          signing_key: context.callbackSecret,
        };
        if (scope == "user") body.user = user;
        const result = await webhookRequest(context, {
          endpoint: "/webhook_subscriptions",
          method: "POST",
          body,
        });
        if (!isJsonObject(result.data) || !isJsonObject(result.data.resource))
          throw new TransientIntegrationError("Calendly webhook creation returned no resource.");
        return { id: webhookId(result.data.resource.uri), secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/webhook_subscriptions/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  async receive(context) {
    const parts =
      context
        .header("calendly-webhook-signature")
        ?.split(",")
        .map((part) => part.trim()) ?? [];
    const timestamps = parts.filter((part) => part.startsWith("t="));
    const timestamp = timestamps[0]?.slice(2);
    let valid = false;
    if (
      timestamps.length == 1 &&
      timestamp &&
      Number.isInteger(Number(timestamp)) &&
      Math.abs(context.now.getTime() / 1000 - Number(timestamp)) <= 180
    ) {
      for (const part of parts) {
        if (
          part.startsWith("v1=") &&
          (await verifyHexHmac(context.callbackSecret, [bytes(`${timestamp}.`), context.rawBody], part.slice(3)))
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
      typeof body.event != "string" ||
      !(context.config.eventTypes as string[]).includes(body.event)
    )
      return { outcome: "ignored", reason: "Calendly event does not match." };
    if (
      !isJsonObject(body.payload) ||
      typeof body.payload.uri != "string" ||
      !body.payload.uri ||
      typeof body.created_at != "string" ||
      !body.created_at
    )
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    return {
      outcome: "event",
      dedupeKey: JSON.stringify([body.event, body.payload.uri, body.created_at]),
      outputs: {
        event: body.event,
        inviteeUri: body.payload.uri,
        createdAt: body.created_at,
        body: body.payload,
      },
    };
  },
};
