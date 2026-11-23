import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { randomUUIDv7 } from "../../core/uuid-v7.ts";
import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-subscriber-event.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("ck_token", token);
  return url.toString();
}

function normalizeKitEventName(name: string): string {
  const dotIndex = name.indexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex + 1) : name;
}

function parseOptionalNumericId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export const convertkitSubscriberEvent: IntegrationDefinition = {
  callback: { headers: [], query: ["ck_token"] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const eventName = String(context.config.eventName);
    const normalizedEventName = normalizeKitEventName(eventName);
    const tagId = parseOptionalNumericId(context.config.tagId);
    const formId = parseOptionalNumericId(context.config.formId);
    const needsTagId = eventName === "subscriber.tag_add" || eventName === "subscriber.tag_remove";
    const needsFormId = eventName === "subscriber.form_subscribe";
    if (context.active && needsTagId && tagId === undefined) {
      throw new PermanentIntegrationError(`ConvertKit ${eventName} requires a valid numeric tagId.`);
    }
    if (context.active && needsFormId && formId === undefined) {
      throw new PermanentIntegrationError(`ConvertKit ${eventName} requires a valid numeric formId.`);
    }
    const eventPayload: Record<string, string | number> = { name: eventName };
    if (needsTagId && tagId !== undefined) eventPayload.tag_id = tagId;
    if (needsFormId && formId !== undefined) eventPayload.form_id = formId;

    const targetUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const found: ManagedWebhook[] = [];
        const cursors = new Set<string>();
        let after: string | undefined;
        while (true) {
          const response = await webhookRequest(context, {
            endpoint: after === undefined ? "/webhooks" : `/webhooks?after=${encodeURIComponent(after)}`,
            method: "GET",
          });
          if (!isJsonObject(response.data) || !Array.isArray(response.data.webhooks)) {
            throw new TransientIntegrationError("ConvertKit returned an invalid webhook list.");
          }
          for (const item of response.data.webhooks) {
            if (!isJsonObject(item) || typeof item.target_url != "string") continue;
            if (!item.target_url.startsWith(context.endpointUrl)) continue;
            if (item.target_url !== targetUrl) {
              if (!context.active) continue;
              throw new PermanentIntegrationError("ConvertKit webhook callback URL differs from this subscription.");
            }
            if (!["number", "string"].includes(typeof item.id)) {
              throw new PermanentIntegrationError("ConvertKit webhook entry is missing an ID.");
            }
            if (context.active) {
              const evt = isJsonObject(item.event) ? item.event : undefined;
              const remoteName = typeof evt?.name == "string" ? normalizeKitEventName(evt.name) : "";
              const remoteTagId = parseOptionalNumericId(evt?.tag_id);
              const remoteFormId = parseOptionalNumericId(evt?.form_id);
              if (
                remoteName !== normalizedEventName ||
                (needsTagId && remoteTagId !== tagId) ||
                (needsFormId && remoteFormId !== formId)
              ) {
                throw new PermanentIntegrationError("ConvertKit webhook settings differ from this subscription.");
              }
            }
            found.push({ id: String(item.id), secret: context.callbackSecret });
          }

          const pagination = response.data.pagination;
          if (!isJsonObject(pagination) || typeof pagination.has_next_page !== "boolean") {
            throw new TransientIntegrationError("ConvertKit returned invalid webhook pagination.");
          }
          if (!pagination.has_next_page) break;
          const next = pagination.end_cursor;
          if (typeof next !== "string" || !next || cursors.has(next)) {
            throw new TransientIntegrationError("ConvertKit returned an invalid webhook cursor.");
          }
          cursors.add(next);
          after = next;
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: { target_url: targetUrl, event: eventPayload },
        });
        const webhook =
          isJsonObject(response.data) && isJsonObject(response.data.webhook) ? response.data.webhook : response.data;
        if (!isJsonObject(webhook) || !["number", "string"].includes(typeof webhook.id)) {
          throw new TransientIntegrationError("ConvertKit webhook creation returned no identity.");
        }
        return { id: String(webhook.id), secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("ck_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body)) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const event = String(context.config.eventName);
    const deliveryId = randomUUIDv7();
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { event, deliveryId, body },
    };
  },
};
