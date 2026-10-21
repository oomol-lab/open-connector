import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { basicAuthorizationHeader } from "../provider-runtime.ts";
import { snapshot } from "./trigger-on-crm-event.definition.ts";

export const pipedriveCrmEvent: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const current = await webhookRequest(context, { endpoint: "/v1/users/me", method: "GET" });
    if (
      !isJsonObject(current.data) ||
      current.data.success !== true ||
      !isJsonObject(current.data.data) ||
      !["string", "number"].includes(typeof current.data.data.company_id)
    )
      throw new TransientIntegrationError("Pipedrive returned no account identity.");
    const companyId = String(current.data.data.company_id);
    const event = String(context.config.eventType);
    const entity = event == "person.created" ? "person" : "deal";
    const action = event.endsWith(".created") ? "create" : "change";
    const result = await reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, { endpoint: "/v1/webhooks", method: "GET" });
        if (!isJsonObject(response.data) || response.data.success !== true || !Array.isArray(response.data.data))
          throw new TransientIntegrationError("Pipedrive returned an invalid webhook list.");
        const found: ManagedWebhook[] = [];
        for (const item of response.data.data) {
          if (!isJsonObject(item) || typeof item.subscription_url != "string")
            throw new TransientIntegrationError("Pipedrive returned an invalid webhook.");
          if (item.subscription_url != context.endpointUrl) continue;
          if (
            !["number", "string"].includes(typeof item.id) ||
            item.event_object != entity ||
            item.event_action != action ||
            item.version != "2.0"
          )
            throw new PermanentIntegrationError("Pipedrive webhook event settings differ from this subscription.");
          found.push({ id: String(item.id), secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/v1/webhooks",
          method: "POST",
          body: {
            subscription_url: context.endpointUrl,
            event_action: action,
            event_object: entity,
            version: "2.0",
            http_auth_user: "oomol",
            http_auth_password: context.callbackSecret,
          },
        });
        if (
          !isJsonObject(response.data) ||
          response.data.success !== true ||
          !isJsonObject(response.data.data) ||
          !["number", "string"].includes(typeof response.data.data.id)
        )
          throw new TransientIntegrationError("Pipedrive webhook creation returned no identity.");
        return { id: String(response.data.data.id), secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/v1/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
    if (context.active)
      await context.state!.saveSubscription(
        { ...context.state!.subscription, companyId },
        new Date(context.now.getTime() + 86_400_000),
      );
    return result;
  },
  receive(context) {
    const expected = basicAuthorizationHeader(`oomol:${context.callbackSecret}`);
    if (!sameSecret(context.header("authorization"), expected))
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    const companyId = context.state?.subscription.companyId;
    if (typeof companyId != "string") return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    const body = context.payload;
    if (!isJsonObject(body) || !isJsonObject(body.meta) || !isJsonObject(body.data))
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    const meta = body.meta;
    if (
      meta.version != "2.0" ||
      String(meta.company_id) != companyId ||
      String(meta.webhook_id) != context.state?.subscription.hookId
    )
      return { outcome: "ignored", reason: "Pipedrive subscription or company does not match." };
    const event = String(context.config.eventType);
    if (
      meta.entity != (event == "person.created" ? "person" : "deal") ||
      meta.action != (event.endsWith(".created") ? "create" : "change")
    )
      return { outcome: "ignored", reason: "Pipedrive event does not match." };
    if (!event.endsWith(".created")) {
      const field = event == "deal.stage_changed" ? "stage_id" : "status";
      if (!isJsonObject(body.previous) || !(field in body.previous) || body.previous[field] === body.data[field])
        return { outcome: "ignored", reason: "The selected deal field did not change." };
    }
    if (typeof meta.id != "string" || !meta.id || !["number", "string"].includes(typeof meta.entity_id))
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    return {
      outcome: "event",
      dedupeKey: meta.id,
      outputs: { event, deliveryId: meta.id, objectId: String(meta.entity_id), body },
    };
  },
};
