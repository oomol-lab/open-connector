import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-task-event.definition.ts";

function webhook(value: unknown): ManagedWebhook {
  if (
    !isJsonObject(value) ||
    typeof value.id != "string" ||
    !value.id ||
    typeof value.secret != "string" ||
    !value.secret
  )
    throw new TransientIntegrationError("ClickUp returned an invalid webhook identity or secret.");
  return { id: value.id, secret: value.secret };
}

export const clickupTaskEvent: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const endpoint = `/team/${encodeURIComponent(String(context.config.workspaceId))}/webhook`;
    const location = context.config.listId == null ? {} : { list_id: Number(context.config.listId) };
    return reconcileManagedWebhook(context, {
      async find() {
        const result = await webhookRequest(context, { endpoint, method: "GET" });
        if (!isJsonObject(result.data) || !Array.isArray(result.data.webhooks))
          throw new TransientIntegrationError("ClickUp returned an invalid webhook list.");
        return result.data.webhooks
          .filter((item) => {
            if (!isJsonObject(item) || typeof item.endpoint != "string")
              throw new TransientIntegrationError("ClickUp returned an invalid webhook.");
            if (item.endpoint !== context.endpointUrl) return false;
            if (context.active && String(item.list_id ?? "") !== String(context.config.listId ?? ""))
              throw new PermanentIntegrationError(
                "The ClickUp webhook no longer matches the configured List. Remove the subscription before recreating it.",
              );
            return true;
          })
          .map(webhook);
      },
      async create() {
        const result = await webhookRequest(context, {
          endpoint,
          method: "POST",
          body: { endpoint: context.endpointUrl, events: context.config.eventTypes!, ...location },
        });
        if (!isJsonObject(result.data) || !isJsonObject(result.data.webhook))
          throw new TransientIntegrationError("ClickUp webhook creation returned no webhook.");
        return webhook(result.data.webhook);
      },
      async align(id) {
        await webhookRequest(context, {
          endpoint: `/webhook/${encodeURIComponent(id)}`,
          method: "PUT",
          body: {
            endpoint: context.endpointUrl,
            events: context.config.eventTypes!,
            status: "active",
          },
        });
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/webhook/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  async receive(context) {
    const secret = context.state?.subscription.secret;
    if (typeof secret != "string") return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    if (!(await verifyHexHmac(secret, [context.rawBody], context.header("x-signature"))))
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    const body = context.payload;
    if (
      !isJsonObject(body) ||
      body.webhook_id != context.state?.subscription.hookId ||
      typeof body.event != "string" ||
      !(context.config.eventTypes as string[]).includes(body.event)
    )
      return { outcome: "ignored", reason: "ClickUp subscription or event does not match." };
    if (
      typeof body.task_id != "string" ||
      !body.task_id ||
      (body.history_items != null &&
        (!Array.isArray(body.history_items) ||
          body.history_items.some((item) => !isJsonObject(item) || typeof item.id != "string" || !item.id)))
    )
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    const historyIds = (body.history_items as { id: string }[] | undefined)?.map((item) => item.id).sort() ?? [];
    if (historyIds.length == 0 && body.event != "taskCreated")
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    return {
      outcome: "event",
      dedupeKey: JSON.stringify([body.webhook_id, body.event, historyIds.length ? historyIds : body.task_id]),
      outputs: { event: body.event, taskId: body.task_id, body },
    };
  },
};
